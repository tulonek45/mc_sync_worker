const { checkEndpoint, getBearerTokenForUser, getEndpoint, promptForText, getHeaders } = require("./helpers.cjs");

const OPERATIONMAP = {
    a: "acquire",
    acquire: "acquire",
    h: "heartbeat",
    heartbeat: "heartbeat",
    r: "release",
    release: "release"
}

async function request(pathname, token) {
    return fetch(getEndpoint(pathname), {
        method: "POST",
        headers: getHeaders(token),
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ ttl: 60 })
    });
}

async function main() {
    await checkEndpoint(getEndpoint("/lock"));

    // Check if an argument was passed via CLI, otherwise prompt
    const arg = process.argv[2];
    const rawInput = arg 
        ? arg.toLowerCase() 
        : (await promptForText("Choose lock operation ([a]cquire, [h]eartbeat, [r]elease): ")).toLowerCase();
    
    const operation = OPERATIONMAP[rawInput];
    if (!["acquire", "heartbeat", "release"].includes(operation)) {
        throw new Error("Choose acquire, heartbeat, or release.");
    }

    const { userNumber, token } = await getBearerTokenForUser(operation);
    const pathname = {
        acquire: "/lock?ttl=60",
        heartbeat: "/heartbeat",
        release: "/release",
    }[operation];
    const response = await request(pathname, token);
    const responseBody = await response.text();
    if (!response.ok) {
        if (response.status === 409) {
            throw new Error(`${operation} failed as user ${userNumber}: ${responseBody}`);
        }
        throw new Error(`${operation} failed as user ${userNumber} (HTTP ${response.status}): ${responseBody}`);
    }

    console.log(`${operation} succeeded as user ${userNumber}: ${responseBody}`);
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});