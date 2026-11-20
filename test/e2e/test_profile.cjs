const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    checkEndpoint,
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
    assert.ok(Array.isArray(profile.files), "Profile should include a files array.");

    for (const f of profile.files) {
        assert.ok(f && typeof f === "object", "Each file entry should be an object.");
        assert.equal(typeof f.path, "string", "File entry must have a string path.");
        assert.ok(f.path.length > 0 && !path.isAbsolute(f.path), `Invalid relative file path: ${f.path}`);
        assert.equal(typeof f.url, "string", `File ${f.path} must have a download url.`);
        if (f.sha256 !== undefined) {
            assert.match(f.sha256, /^[0-9a-f]{64}$/i, `File ${f.path} sha256 must be a 64-char hex digest.`);
        }

        const dest = path.resolve(outDir, f.path);
        const data = await downloadBuffer(f.url);
        assert.ok(Buffer.isBuffer(data) && data.length > 0, `Downloaded file ${f.path} should not be empty.`);
        verifySha256(data, f.sha256, f.path);
        writeFileAtomic(dest, data);

        const written = fs.readFileSync(dest);
        assert.equal(written.length, data.length, `Written size mismatch for ${f.path}.`);
    }
}

async function main() {
    await checkEndpoint();
    const profileEndpoint = getEndpoint(`/p/${DEFAULT_PROFILE}/profile`);
    const profilesEndpoint = getEndpoint("/profiles");

    const token = getBearerToken();

    const profiles = await fetchJson(profilesEndpoint, token);
    assert.ok(profiles && typeof profiles === "object", "/profiles response should be an object.");
    const profileList = Array.isArray(profiles) ? profiles : profiles.profiles;
    assert.ok(Array.isArray(profileList), "/profiles should return or contain an array of profiles.");
    assert.ok(profileList.length > 0, "/profiles should contain at least one profile.");

    const matchedProfile = profileList.find(
        (p) => p === DEFAULT_PROFILE || p?.id === DEFAULT_PROFILE || p?.name === DEFAULT_PROFILE || p?.slug === DEFAULT_PROFILE
    );
    assert.ok(matchedProfile, `Expected default profile "${DEFAULT_PROFILE}" to be listed in /profiles.`);

    const profile = await fetchJson(profileEndpoint, token);
    assert.ok(profile && typeof profile === "object", "Profile detail should be an object.");

    await downloadFiles(profile, DOWNLOAD_DIR);
    console.log(`Downloaded ${profile.files.length} files into ${DOWNLOAD_DIR}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});