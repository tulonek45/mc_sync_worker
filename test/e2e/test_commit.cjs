const assert = require("node:assert/strict");
const { assertTestBucketUrl, checkEndpoint, getBearerToken, getEndpoint } = require("./helpers.cjs");

async function main() {
    const uploadUrlEndpoint = getEndpoint("/upload-url");
    const commitEndpoint = getEndpoint("/commit");
    
    await checkEndpoint(uploadUrlEndpoint);
    const token = await getBearerToken();
    if (!token) {
        throw new Error("Bearer token cannot be empty.");
    }

    const uploadUrlResponse = await fetch(uploadUrlEndpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
    });
    if (!uploadUrlResponse.ok) {
        throw new Error(`Requesting upload URL failed (HTTP ${uploadUrlResponse.status}): ${await uploadUrlResponse.text()}`);
    }
    const uploadInfo = await uploadUrlResponse.json();
    if (typeof uploadInfo.key !== "string" || !/^worlds\/.+\.zip$/.test(uploadInfo.key)) {
        throw new Error(`Upload URL response has an invalid key: ${JSON.stringify(uploadInfo)}`);
    }
    assertTestBucketUrl(uploadInfo.url);

    const archive = Buffer.from([
        0x50, 0x4b, 0x05, 0x06, // End of central directory signature (PK\x05\x06)
        0x00, 0x00,             // Number of this disk
        0x00, 0x00,             // Disk where central directory starts
        0x00, 0x00,             // Number of central directory records on this disk
        0x00, 0x00,             // Total number of central directory records
        0x00, 0x00, 0x00, 0x00, // Size of central directory (bytes)
        0x00, 0x00, 0x00, 0x00, // Offset of start of central directory, relative to start of archive
        0x00, 0x00              // Comment length
    ]);

    const uploadResponse = await fetch(uploadInfo.url, {
        method: "PUT",
        headers: { "Content-Type": "application/zip" },
        body: archive,
        signal: AbortSignal.timeout(300000),
    });
    if (!uploadResponse.ok) {
        const body = await uploadResponse.text();
        throw new Error(`Uploading archive failed (HTTP ${uploadResponse.status}): ${body}`);
    }

    const commitResponse = await fetch(commitEndpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: uploadInfo.key }),
        signal: AbortSignal.timeout(10000),
    });
    if (!commitResponse.ok) {
        throw new Error(`Committing ${uploadInfo.key} failed (HTTP ${commitResponse.status}): ${await commitResponse.text()}`);
    }

    const commitInfo = await commitResponse.json();
    assert.equal(commitInfo.ok, true, "Commit response should confirm success.");

}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});