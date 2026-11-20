const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");

const root = path.join(__dirname, "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

const { values: args } = parseArgs({
    options: {
        profile: { type: "string" },
        env: { type: "string", default: "" },
        exclude: { type: "string", default: "" },
    },
});

const envName = args.env.trim();
const suffix = envName ? `_${envName.toUpperCase()}` : "";
const getEnv = (baseKey, fallbackKey) => {
    const suffixed = process.env[`${baseKey}${suffix}`];
    if (suffixed !== undefined && suffixed !== "") return suffixed;
    if (fallbackKey && process.env[fallbackKey]) return process.env[fallbackKey];
    throw new Error(`Missing env var ${baseKey}${suffix}`);
};

const bucket = getEnv("R2_BUCKET");
const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
const accountId = getEnv("R2_ACCOUNT_ID");

const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
});


const extraExcludes = args.exclude.split(",").map((value) => value.trim()).filter(Boolean);
const shouldExclude = (file) => extraExcludes.some((prefix) => file.path === prefix || file.path.startsWith(prefix.replace(/\/?$/, "/")));


async function clearPrefix(prefix) {
    let continuationToken;
    let deletedCount = 0;

    do {
        const listed = await s3.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }),
        );

        const objects = (listed.Contents ?? []).map(({ Key }) => ({ Key }));
        if (objects.length > 0) {
            await s3.send(
                new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: { Objects: objects, Quiet: true },
                }),
            );
            deletedCount += objects.length;
        }

        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    if (deletedCount > 0) console.log(`Deleted ${deletedCount} existing object(s) under ${prefix}`);
}


async function upload(key, file, contentType) {
    const body = await fsp.readFile(file);
    await s3.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
        }),
    );
}


async function main() {
    const profileName = args.profile;
    if (!profileName) throw new Error("Missing required --profile argument");

    const profileRoot = path.join(root, "profiles", profileName);
    const manifestFile = path.join(profileRoot, "manifest.json");
    const serverDir = path.join(profileRoot, "server");
    if (!fs.existsSync(manifestFile)) throw new Error(`Manifest not found: ${manifestFile}`);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

    const toUpload = [];
    for (const file of manifest.files) {
        if (shouldExclude(file)) continue;
        const source = path.join(serverDir, file.path);
        if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
            throw new Error(`Manifest file is missing: ${source}`);
        }
        toUpload.push({
            key: `profiles/${profileName}/files/${file.sha256}`,
            source,
            contentType: "application/octet-stream",
        });
    }

    await clearPrefix(`profiles/${profileName}/`);
    for (const item of toUpload) await upload(item.key, item.source, item.contentType);
    await upload(`profiles/${profileName}/manifest.json`, manifestFile, "application/json");
    console.log(`Published ${profileName} profile version ${manifest.version}${envName ? ` to ${envName}` : ""}.`);
}

main().catch((error) => { console.error(error); process.exit(1);});