const assert = require("node:assert/strict");
const { checkEndpoint, getBearerToken, getEndpoint, fetchJson } = require("./helpers.cjs");

async function main() {
    await checkEndpoint();
    const endpoint = getEndpoint("/me");
    const token = getBearerToken();

    const response = await fetchJson(endpoint, token);
    assert.ok(response && typeof response === "object", "/me response should be a JSON object.");

    const {id, name, session } = response;
    assert.ok(
        typeof id === "string" || typeof name === "string" || typeof session === "string",
        "/me response should include a user identifier"
    );

    console.log("Authenticated /me response:", response);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});