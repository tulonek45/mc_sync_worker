const fs = require("node:fs");
const path = require("node:path");

const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

async function main() {
    const appId = process.env.DISCORD_APP_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;
    const missing = [
        ["DISCORD_APP_ID", appId],
        ["DISCORD_BOT_TOKEN", botToken],
        ["DISCORD_GUILD_ID", guildId],
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missing.length) {
        throw new Error(`Missing required .env setting(s): ${missing.join(", ")}`);
    }

    const endpoint = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
    const headers = {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
    };
    const command = {
        name: "getkey",
        description: "Get your sync access token.",
        type: 1,
    };

    const listResponse = await fetch(endpoint, { headers });
    if (!listResponse.ok) {
        throw new Error(`Discord API returned ${listResponse.status}: ${await listResponse.text()}`);
    }

    const commands = await listResponse.json();
    if (!Array.isArray(commands)) {
        throw new Error("Discord API returned an invalid command list.");
    }

    const existing = commands.find(item => item.name === command.name && (item.type === undefined || item.type === command.type));
    const response = existing
        ? await fetch(`${endpoint}/${existing.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(command),
        })
        : await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(command),
        });

    if (!response.ok) {
        throw new Error(`Discord API returned ${response.status}: ${await response.text()}`);
    }

    console.log(`Discord /${command.name} command ${existing ? "updated" : "registered"} for guild ${guildId}.`);
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});