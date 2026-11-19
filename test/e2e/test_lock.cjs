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

async function main() {
    await checkEndpoint(getEndpoint("/lock"));

    // Check if an argument was passed via CLI, otherwise prompt
    const arg = process.argv[2];
    const rawInput = arg
        ? arg.toLowerCase()
        : (await promptForText("Choose lock operation ([a]cquire, [h]eartbeat, [r]elease): ")).toLowerCase();

    const operation = OPERATION_MAP[rawInput];
    if (!operation) {
        throw new Error("Choose acquire, heartbeat, or release.");
    }

    const { userNumber, token } = await getBearerTokenForUser(operation);
    const endpoint = getEndpoint(OPERATION_PATHS[operation]);

    try {
        const result = await fetchJson(endpoint, token, "POST", 10000, { ttl: 60 });
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