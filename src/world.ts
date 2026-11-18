import type { Env, UserRecord } from "./types";
import { presign } from "./r2";
import { json } from "./response";

export async function getLatest(env: Env): Promise<Response> {
    const pointer = await env.WORLD.get("latest.json");
    if (!pointer) return json({ key: null });
    const { key, ts, by } = await pointer.json<{ key: string; ts: number; by: string }>();
    return json({ key, ts, by, url: await presign(env, "GET", key) });
}


export async function uploadUrl(env: Env, user: UserRecord): Promise<Response> {
    const key = `worlds/${Date.now()}.zip`;
    return json({ key, url: await presign(env, "PUT", key, 3600) });
}


export async function commitWorld(req: Request, env: Env, user: UserRecord): Promise<Response> {
    const body = await req.json<{ key?: unknown }>();
    if (typeof body.key !== "string" || !body.key.startsWith("worlds/")) {
        return json({ error: "invalid key" }, 400);
    }
    const key: string = body.key;
    if (!(await env.WORLD.head(key))) {
        console.log(await env.WORLD.head(key))
        return json({ error: "object missing" }, 400);
    }
    await env.WORLD.put("latest.json", JSON.stringify({ key, ts: Date.now(), by: user.name }));
    const list = await env.WORLD.list({ prefix: "worlds/" });
    const old = list.objects.map(object => object.key).sort().reverse().slice(Number(env.KEEP_VERSIONS));
    if (old.length) await env.WORLD.delete(old);
    return json({ ok: true });
}