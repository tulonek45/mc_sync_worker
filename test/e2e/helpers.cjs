const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");

const envFile = path.join(__dirname, "..", "..", ".env");
if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

const DEFAULT_TEST_ENDPOINT = "http://localhost:8787";
const TEST_BUCKET = "minecraft-server-test";

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

function promptForToken() {
    process.stdout.write("Bearer token: ");

    if (!process.stdin.isTTY) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            process.stdin.on("data", chunk => chunks.push(chunk));
            process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim()));
            process.stdin.on("error", reject);
        });
    }

    return new Promise((resolve, reject) => {
        const input = process.stdin;
        let token = "";

        const cleanup = () => {
            input.removeListener("data", onData);
            input.setRawMode(false);
            input.pause();
            process.stdout.write("\n");
        };

        const onData = chunk => {
            for (const byte of chunk) {
                if (byte === 3 || byte === 4) {
                    cleanup();
                    reject(new Error("Token prompt cancelled."));
                    return;
                }
                if (byte === 10 || byte === 13) {
                    cleanup();
                    resolve(token);
                    return;
                }
                if (byte === 8 || byte === 127) {
                    token = token.slice(0, -1);
                } else {
                    token += String.fromCharCode(byte);
                }
            }
        };

        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
    });
}

async function promptForText(question) {
    const interface_ = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        return (await interface_.question(question)).trim();
    } finally {
        interface_.close();
    }
}

async function getBearerToken() {
    return process.env.DEV_AUTH_TOKEN || await promptForToken();
}

module.exports = { assertTestBucketUrl, checkEndpoint, getBearerToken, getEndpoint, promptForText };
