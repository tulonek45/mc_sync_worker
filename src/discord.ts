import { verifyKey } from "discord-interactions";
import { hex, sha256 } from "./crypto";
import { json } from "./response";
import type { DiscordInteraction, Env, UserRecord } from "./types";

const reply = (content: string): Response => json({ type: 4, data: { content, flags: 64 } });

export async function handleDiscord(req: Request, env: Env): Promise<Response> {
    const body = await req.text();
    const signature = req.headers.get("X-Signature-Ed25519");
    const timestamp = req.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp || !(await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY))) {
        return new Response("bad signature", { status: 401 });
    }

    const interaction = JSON.parse(body) as DiscordInteraction;
    if (interaction.type === 1) return json({ type: 1 });

    const member = interaction.member;
    if (!member || !member.roles.includes(env.DISCORD_ROLE_ID)) {
        return reply("You don't have access.");
    }

    const { id, username: name } = member.user;
    if (interaction.data?.name !== "getkey") return reply("Unknown command.");

    const oldTokenHash = await env.USERS.get(`user:${id}`);
    if (oldTokenHash) await env.USERS.delete(`tok:${oldTokenHash}`);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await sha256(token);
    const user: UserRecord = { id, name };
    await env.USERS.put(`tok:${tokenHash}`, JSON.stringify(user));
    await env.USERS.put(`user:${id}`, tokenHash);
    return reply(`Your token (keep it private):\n\`\`\`\n${token}\n\`\`\``);
}
