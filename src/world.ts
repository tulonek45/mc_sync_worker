import type { Env, SessionUser } from "./types";
import { presign } from "./r2";
import { json } from "./response";
import { lockCall } from "./lock";

const latestKey = (p: string) => `latest/${p}.json`;
const worldPrefix = (p: string) => `worlds/${p}/`;

export async function getLatest(env: Env, profile: string): Promise<Response> {
    const pointer = await env.WORLD.get(latestKey(profile));
    if (!pointer) return json({ key: null });
    const { key, ts, by } = await pointer.json<{ key: string; ts: number; by: string }>();
    return json({ key, ts, by, url: await presign(env, "GET", key) });
}


export async function uploadUrl(env: Env, user: SessionUser, profile: string): Promise<Response> {
    const lockCheck = await lockCall(env, { op: "check", ...user, profile });
    if (!lockCheck.ok) return lockCheck;

    const key = `${worldPrefix(profile)}${Date.now()}.zip`;
    return json({ key, url: await presign(env, "PUT", key, 3600) });
}


export async function commitWorld(req: Request, env: Env, user: SessionUser, profile: string): Promise<Response> {
    const lockCheck = await lockCall(env, { op: "check", ...user, profile });
    if (!lockCheck.ok) return lockCheck;

    const body = await req.json<{ key?: unknown }>().catch(() => ({} as { key?: unknown }));
    const prefix = worldPrefix(profile);
    if (typeof body.key !== "string" || !body.key.startsWith(prefix)) {
        return json({ error: "invalid key" }, 400);
    }
    const key = body.key;
    if (!(await env.WORLD.head(key))) return json({ error: "object missing" }, 400);

    await env.WORLD.put(latestKey(profile), JSON.stringify({ key, ts: Date.now(), by: user.name }));
    const list = await env.WORLD.list({ prefix });
    const old = list.objects.map(object => object.key).sort().reverse().slice(Number(env.KEEP_VERSIONS));
    if (old.length) await env.WORLD.delete(old);
    return json({ ok: true });
}