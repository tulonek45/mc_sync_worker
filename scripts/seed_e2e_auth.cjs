const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

const tokens = [process.env.DEV_AUTH_TOKEN_1, process.env.DEV_AUTH_TOKEN_2];
if (tokens.some(token => !token)) {
    throw new Error("Set DEV_AUTH_TOKEN_1 and DEV_AUTH_TOKEN_2 in .env before seeding E2E auth.");
}
if (tokens[0] === tokens[1]) {
    throw new Error("DEV_AUTH_TOKEN_1 and DEV_AUTH_TOKEN_2 must be different.");
}

const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
if (!fs.existsSync(wrangler)) {
    throw new Error("Wrangler is not installed. Run npm install first.");
}

const users = [
    { token: tokens[0], user: { id: "e2e-user-1", name: "E2E Test User 1" } },
    { token: tokens[1], user: { id: "e2e-user-2", name: "E2E Test User 2" } },
];

for (const { token, user } of users) {
    const hash = createHash("sha256").update(token).digest("hex");
    execFileSync(process.execPath, [
        wrangler,
        "kv",
        "key",
        "put",
        `tok:${hash}`,
        JSON.stringify(user),
        "--binding",
        "USERS",
        "--env",
        "e2e",
        "--remote",
    ], { cwd: root, stdio: "inherit" });
}

console.log("Seeded two test users in the E2E USERS namespace.");
