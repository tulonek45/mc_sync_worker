const assert = require("node:assert/strict");
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

async function main() {
    await checkEndpoint();
    const endpoint = getEndpoint(`/p/${DEFAULT_PROFILE}/latest`);

    const token = getBearerToken();

    const latestInfo = await fetchJson(endpoint, token);
    if (!latestInfo.key || !latestInfo.url) {
        throw new Error("No committed latest object found.");
    }
    assert.match(latestInfo.key, /^worlds\/.+\.zip$/, "Latest should point at a world archive.");

    const archive = await downloadBuffer(latestInfo.url, 300000);
    assert.ok(archive.length > 4, "Latest archive should not be empty.");
    verifySha256(archive, latestInfo.sha256, latestInfo.key);

    const fileName = path.basename(latestInfo.key);
    const dest = path.resolve(DOWNLOAD_DIR, fileName);
    writeFileAtomic(dest, archive);

    console.log(`Latest ${latestInfo.key} downloaded to ${dest} (${archive.length} bytes).`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});