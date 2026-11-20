const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    checkEndpoint,
    getBearerToken,
    getEndpoint,
    downloadBuffer,
    fetchJson,
    sha256,
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
    assert.ok(latestInfo && typeof latestInfo === "object", "Latest response should be an object.");
    if (!latestInfo.key || !latestInfo.url) {
        throw new Error("No committed latest object found.");
    }
    assert.match(latestInfo.key, /^worlds\/[^/]+\/[^/]+\.zip$/, "Latest should point at a world archive.");
    if (latestInfo.sha256 !== undefined) {
        assert.match(latestInfo.sha256, /^[0-9a-f]{64}$/i, "Latest sha256 must be a 64-char hex digest.");
    }

    const archive = await downloadBuffer(latestInfo.url, 300000);
    assert.ok(Buffer.isBuffer(archive), "Downloaded archive should be a Buffer.");
    assert.ok(archive.length >= 22, "Latest archive should contain at least a valid ZIP end-of-central-directory record.");
    assert.equal(archive.subarray(0, 2).toString("latin1"), "PK", "Downloaded archive should start with ZIP 'PK' header.");
    verifySha256(archive, latestInfo.sha256, latestInfo.key);

    const fileName = path.basename(latestInfo.key);
    const dest = path.resolve(DOWNLOAD_DIR, fileName);
    writeFileAtomic(dest, archive);

    const written = fs.readFileSync(dest);
    assert.equal(sha256(written), sha256(archive), "Persisted file hash should match downloaded archive.");

    console.log(`Latest ${latestInfo.key} downloaded to ${dest} (${archive.length} bytes).`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});