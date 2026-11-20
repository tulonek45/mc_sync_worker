const assert = require("node:assert/strict");
const { checkEndpoint, getBearerTokenForUser, getEndpoint, promptForText, fetchJson, DEFAULT_PROFILE } = require("./helpers.cjs");

const OPERATION_MAP = {
    a: "acquire",
    acquire: "acquire",
    h: "heartbeat",
    heartbeat: "heartbeat",
    r: "release",
    release: "release",
};

const OPERATION_PATHS = {
    acquire: `/p/${DEFAULT_PROFILE}/lock`,
    heartbeat: `/p/${DEFAULT_PROFILE}/heartbeat`,
    release: `/p/${DEFAULT_PROFILE}/release`,
};

function assertLockResult(operation, result) {
    assert.ok(result && typeof result === "object", `${operation} response should be a JSON object.`);
    assert.equal(result.ok, true, `${operation} response should have ok: true.`);
}

async function main() {
    await checkEndpoint();

    const argOp = process.argv[2];
    const argUser = process.argv[3];

    const rawInput = argOp
        ? argOp.toLowerCase()
        : (await promptForText("Choose lock operation ([a]cquire, [h]eartbeat, [r]elease): ")).toLowerCase();

    const operation = OPERATION_MAP[rawInput];
    if (!operation) {
        throw new Error("Choose acquire, heartbeat, or release.");
    }

    const { userNumber, token } = await getBearerTokenForUser(operation, argUser);
    const endpoint = getEndpoint(OPERATION_PATHS[operation]);
    const payload = operation === "release" ? undefined : { ttl: 60 };

    try {
        const result = await fetchJson(endpoint, token, "POST", 10000, payload);
        assertLockResult(operation, result);
        console.log(`${operation} succeeded as user ${userNumber}:`, result);
    } catch (err) {
        throw new Error(
            `${operation} failed as user ${userNumber}: ${err instanceof Error ? err.message : err}`
        );
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});