const fs = require("node:fs");
const path = require("node:path");

const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

const DEFAULT_TEST_ENDPOINT = "http://localhost:8787/test";

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

async function checkEndpoint(endpoint) {
    try {
        await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Test endpoint is unavailable at ${endpoint}: ${detail}`);
    }
}

async function main() {
    const endpoint = process.env.TEST_ENDPOINT || DEFAULT_TEST_ENDPOINT;
    await checkEndpoint(endpoint);
    const token = process.env.DEV_AUTH_TOKEN || await promptForToken();
    if (!token) {
        throw new Error("Bearer token cannot be empty.");
    }

    const response = await fetch(endpoint, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    const body = await response.text();

    console.log(`HTTP ${response.status}`);
    if (body) {
        console.log(body);
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});