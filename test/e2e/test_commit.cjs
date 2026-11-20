const assert = require("node:assert/strict");
const {
    assertTestBucketUrl,
    checkEndpoint,
    getBearerTokenForUser,
    getEndpoint,
    fetchJson,
    sha256,
    DEFAULT_PROFILE,
} = require("./helpers.cjs");

const EMPTY_ZIP_ARCHIVE = Buffer.from([
    0x50, 0x4b, 0x05, 0x06, // End of central directory signature (PK\x05\x06)
    0x00, 0x00,             // Number of this disk
    0x00, 0x00,             // Disk where central directory starts
    0x00, 0x00,             // Number of central directory records on this disk
    0x00, 0x00,             // Total number of central directory records
    0x00, 0x00, 0x00, 0x00, // Size of central directory (bytes)
    0x00, 0x00, 0x00, 0x00, // Offset of start of central directory, relative to start of archive
    0x00, 0x00              // Comment length
]);

async function uploadArchive(url, data, timeoutMs = 300000) {
    assertTestBucketUrl(url);
    const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/zip" },
        body: data,
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Uploading archive failed (HTTP ${res.status}): ${body}`);
    }
}

async function main() {
    await checkEndpoint();
    const uploadUrlEndpoint = getEndpoint(`/p/${DEFAULT_PROFILE}/upload-url`);
    const commitEndpoint = getEndpoint(`/p/${DEFAULT_PROFILE}/commit`);

    const { token } = await getBearerTokenForUser("commit", process.argv[2]);
    const archiveDigest = sha256(EMPTY_ZIP_ARCHIVE);

    const uploadInfo = await fetchJson(uploadUrlEndpoint, token);
    console.log(uploadInfo.key)
    assert.ok(uploadInfo && typeof uploadInfo === "object", "Upload URL response should be an object.");
    assert.equal(typeof uploadInfo.key, "string", `Upload URL response has an invalid key: ${JSON.stringify(uploadInfo)}`);
    assert.match(uploadInfo.key, /^worlds\/[^/]+\/[^/]+\.zip$/, "Upload key should point at a worlds/*/*.zip archive.");
    assert.equal(typeof uploadInfo.url, "string", "Upload URL response must include a signed upload url.");

    await uploadArchive(uploadInfo.url, EMPTY_ZIP_ARCHIVE);

    const commitInfo = await fetchJson(commitEndpoint, token, "POST", 10000, {
        key: uploadInfo.key,
        sha256: archiveDigest,
    });
    assert.ok(commitInfo && typeof commitInfo === "object", "Commit response should be an object.");
    assert.equal(commitInfo.ok, true, "Commit response should confirm success.");
    if ("key" in commitInfo) {
        assert.equal(commitInfo.key, uploadInfo.key, "Committed key should match uploaded key.");
    }

    console.log(`Successfully uploaded and committed ${uploadInfo.key}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});