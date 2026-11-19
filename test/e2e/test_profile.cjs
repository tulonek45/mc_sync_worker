const fs = require("node:fs");
const path = require("node:path");
const { checkEndpoint,
    getBearerToken,
    getEndpoint,
    downloadBuffer,
    fetchJson,
    verifySha256,
    writeFileAtomic,
    DEFAULT_PROFILE,
    DOWNLOAD_DIR,
} = require("./helpers.cjs");

async function downloadFiles(profile, outDir) {
    fs.mkdirSync(outDir, { recursive: true });

    for (const f of profile.files ?? []) {
        const dest = path.resolve(outDir, f.path);
        const data = await downloadBuffer(f.url);
        verifySha256(data, f.sha256, f.path);
        writeFileAtomic(dest, data);
    }
}

async function main() {
    await checkEndpoint();
    const profileEndpoint = getEndpoint(`/p/${DEFAULT_PROFILE}/profile`);
    const profilesEndpoint = getEndpoint(`/profiles`);
    
    const token = getBearerToken();

    const profiles = await fetchJson(profilesEndpoint, token);
    console.log(profiles);

    const profile = await fetchJson(profileEndpoint, token);
    console.log(profile);

    await downloadFiles(profile, DOWNLOAD_DIR);
    console.log(`Downloaded ${profile.files?.length ?? 0} files into ${DOWNLOAD_DIR}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});