const assert = require("node:assert/strict");
const { assertTestBucketUrl, checkEndpoint, getBearerToken, getEndpoint } = require("./helpers.cjs");

async function main() {
    const endpoint = getEndpoint("/latest");
    await checkEndpoint(endpoint);
    const token = await getBearerToken();
    if (!token) {
        throw new Error("Bearer token cannot be empty.");
    }

    const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        throw new Error(`Requesting latest failed (HTTP ${response.status}): ${await response.text()}`);
    }

    const latestInfo = await response.json();
    if (!latestInfo.key || !latestInfo.url) {
        throw new Error("No committed latest object found.");
    }
    assert.match(latestInfo.key, /^worlds\/.+\.zip$/, "Latest should point at a world archive.");
    assertTestBucketUrl(latestInfo.url);

    const downloadResponse = await fetch(latestInfo.url, { signal: AbortSignal.timeout(300000) });
    if (!downloadResponse.ok) {
        throw new Error(`Downloading latest failed (HTTP ${downloadResponse.status}): ${await downloadResponse.text()}`);
    }
    const archive = Buffer.from(await downloadResponse.arrayBuffer());
    assert.ok(archive.length > 4, "Latest archive should not be empty.");
    assert.deepEqual(archive.subarray(0, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]), "Latest should be a ZIP archive.");

    console.log(`Latest ${latestInfo.key} downloaded (${archive.length} bytes).`);
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
