const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const crypto = require("node:crypto");

const envFile = path.join(__dirname, "..", "..", ".env");
if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

const DEFAULT_PROFILE = "test"
const DOWNLOAD_DIR = path.resolve(__dirname, "..", "..", "tmp");

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

async function checkEndpoint(endpoint = getEndpoint("")) {
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

function writeFileAtomic(dest, data) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part.${process.pid}`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, dest);
}

async function fetchJson(endpoint, token, method = "GET", timeoutMs = 10000, body = undefined) {
    const headers = {
        ...getHeaders(token),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    };

    const res = await fetch(endpoint, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
        throw new Error(`Requesting ${endpoint} failed (HTTP ${res.status}): ${await res.text()}`);
    }
    return res.json();
}

async function downloadBuffer(url, timeoutMs = 60000) {
    assertTestBucketUrl(url);
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
        throw new Error(`Download failed (HTTP ${res.status}): ${await res.text()}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

function sha256(buf) {
    return crypto.createHash("sha256").update(buf).digest("hex");
}

function verifySha256(data, expected, label) {
    if (!expected) return;
    const actual = sha256(data);
    if (actual !== expected) {
        throw new Error(`Hash mismatch for ${label}: expected ${expected}, got ${actual}`);
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
    fetchJson,
    writeFileAtomic,
    downloadBuffer,
    sha256,
    verifySha256,
    DEFAULT_PROFILE,
    DOWNLOAD_DIR,
};
