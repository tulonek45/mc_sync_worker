const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseArgs } = require("node:util");

const root = path.join(__dirname, "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile) && process.loadEnvFile) process.loadEnvFile(envFile);

const { values: args } = parseArgs({
    options: {
        dir: { type: "string", default: "mc_server" },
        manifest: { type: "string", default: "profile/manifest.json" },
        env: { type: "string", default: "" },
        exclude: { type: "string", default: "" },
        "dry-run": { type: "boolean", default: false },
    },
});

const envName = args.env.trim();
const suffix = envName ? `_${envName.toUpperCase()}` : "";
const bucket = process.env[`R2_BUCKET${suffix}`];
if (!bucket) throw new Error(`Missing env var R2_BUCKET${suffix}`);

const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
if (!fs.existsSync(wrangler)) throw new Error("Wrangler is not installed. Run npm install first.");

const manifestFile = path.resolve(args.manifest);
const serverDir = path.resolve(args.dir);
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const wranglerArgs = envName ? ["--env", envName] : [];
const extraExcludes = args.exclude.split(",").map((value) => value.trim()).filter(Boolean);

const shouldExclude = (file) => extraExcludes.some((prefix) => file.path === prefix || file.path.startsWith(prefix.replace(/\/?$/, "/")));

function upload(key, file, contentType) {
    const command = ["r2", "object", "put", `${bucket}/${key}`, "--file", file,
        "--content-type", contentType, "--remote", "--force", ...wranglerArgs];
    if (args["dry-run"]) {
        console.log(`Would upload ${key}`);
        return;
    }
    execFileSync(process.execPath, [wrangler, ...command], { cwd: root, stdio: "inherit" });
}

for (const file of manifest.files) {
    if (shouldExclude(file)) continue;
    const source = path.resolve(serverDir, file.path);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile())
        throw new Error(`Manifest file is missing: ${source}`);
    upload(`profile/files/${file.sha256}`, source, "application/octet-stream");
}

upload("profile/manifest.json", manifestFile, "application/json");
console.log(`${args["dry-run"] ? "Would publish" : "Published"} profile version ${manifest.version}.`);
