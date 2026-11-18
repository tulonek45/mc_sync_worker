const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");

const envFile = path.join(__dirname, "..", "..", ".env");
if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

const DEFAULT_TEST_ENDPOINT = "http://localhost:8787";
const TEST_BUCKET = "minecraft-server-test";
const DEFAULT_SESSION = `session-default`

function getEndpoint(pathname) {
    const configuredEndpoint = process.env.TEST_ENDPOINT || DEFAULT_TEST_ENDPOINT;
    const { origin } = new URL(configuredEndpoint);
    return new URL(pathname, origin).toString();
}

function assertTestBucketUrl(value) {
    const url = new URL(value);
    const expectedHost = new RegExp(`^${TEST_BUCKET}\\.[^.]+\\.r2\\.cloudflarestorage\\.com$`);
    if (url.protocol !== "https:" || !expectedHost.test(url.hostname)) {
        throw new Error(`Expected a signed URL for ${TEST_BUCKET}; received ${url.origin}`);
    }
    return url;
}

async function checkEndpoint(endpoint) {
    try {
        await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Test endpoint is unavailable at ${endpoint}: ${detail}`, { cause: error });
    }
}

async function promptForText(question) {
    const interface_ = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        return (await interface_.question(question)).trim();
    } finally {
        interface_.close();
    }
}

function getBearerToken() {
    const token = process.env.DEV_AUTH_TOKEN_1
    if (!token) {
        throw new Error("DEV_AUTH_TOKEN_1 not found.");
    }
    return token
}

async function getBearerTokenForUser(action) {
    const selection = await promptForText(`Choose user 1 or 2 to ${action}: `);
    if (selection !== "1" && selection !== "2") {
        throw new Error("Choose user 1 or 2.");
    }

    const token = process.env[`DEV_AUTH_TOKEN_${selection}`];
    if (!token) {
        throw new Error(`DEV_AUTH_TOKEN_${selection} not found.`);
    }
    return { userNumber: Number(selection), token };
}

function getHeaders(token) {
    return {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Session": DEFAULT_SESSION,
    }
}

module.exports = {
    assertTestBucketUrl,
    checkEndpoint,
    getBearerToken,
    getBearerTokenForUser,
    getEndpoint,
    getHeaders,
    promptForText,
};
