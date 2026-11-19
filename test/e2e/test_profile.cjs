const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { assertTestBucketUrl, checkEndpoint, getBearerToken, getEndpoint, getHeaders } = require("./helpers.cjs");

const DOWNLOAD_DIR = path.resolve(__dirname, "..", "..", "tmp");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function downloadBuffer(url) {
    assertTestBucketUrl(url);
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}): ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
}

async function fetchProfile(token) {
    const res = await fetch(getEndpoint("/profile"), {
        method: "GET",
        headers: getHeaders(token),
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Fetching profile failed (HTTP ${res.status}): ${await res.text()}`);
    return res.json();
}

async function downloadFiles(profile, outDir) {
    fs.mkdirSync(outDir, { recursive: true });

    for (const f of profile.files ?? []) {
        const dest = path.resolve(outDir, f.path);
        const data = await downloadBuffer(f.url);

        if (f.sha256) {
            const actual = sha256(data);
            if (actual !== f.sha256) {
                throw new Error(`Hash mismatch for ${f.path}: expected ${f.sha256}, got ${actual}`);
            }
        }

        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const tmp = `${dest}.part`;
        fs.writeFileSync(tmp, data);
        fs.renameSync(tmp, dest);
    }
}

async function main() {
    const endpoint = getEndpoint("/profile");
    await checkEndpoint(endpoint);
    const token = getBearerToken();

    const profile = await fetchProfile(token);
    console.log(profile)
    
    await downloadFiles(profile, DOWNLOAD_DIR);
    console.log(`Downloaded ${profile.files?.length ?? 0} files into ${DOWNLOAD_DIR}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});