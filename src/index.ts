import type { Env } from "./types";
import { authUser } from "./auth";
import { handleDiscord } from "./discord";
import { json } from "./response";
import { getLatest, commitWorld, uploadUrl } from "./world";
import { lockCall, Lock } from "./lock";
import { getProfile, listProfiles } from "./profile";

export { Lock };

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const path = new URL(req.url).pathname;

        if (path === "/discord" && req.method === "POST") return handleDiscord(req, env);

        const user = await authUser(req, env);
        if (!user) return json({ error: "unauthorized" }, 401);

        const session = req.headers.get("X-Session") ?? "";
        if (session.length < 8 || session.length > 64) return json({ error: "missing or invalid X-Session header" }, 400);

        if (path === "/me" && req.method === "GET") return json({ id: user.id, name: user.name, session }, 200);
        if (path === "/profiles" && req.method === "GET") return listProfiles(env);

        const m = path.match(/^\/p\/([a-z0-9-]{1,32})\/([a-z-]+)$/); // require path: /p/<profile>/<action>
        if (!m) return json({ error: "not found" }, 404);
        const [, profile, action] = m;

        if (!(await env.WORLD.head(`profiles/${profile}/manifest.json`))) return json({ error: "unknown profile" }, 404);

        const me = { id: user.id, name: user.name, session };
        if (action === "latest" && req.method === "GET") return await getLatest(env, profile);
        if (action === "profile" && req.method === "GET") return await getProfile(env, profile);
        if (action === "upload-url" && req.method === "GET") return await uploadUrl(env, me, profile)
        if (action === "commit" && req.method === "POST") return await commitWorld(req, env, me, profile)
        if (action === "heartbeat" && req.method === "POST") return lockCall(env, { op: "heartbeat", ...me, profile });
        if (action === "release" && req.method === "POST") return lockCall(env, { op: "release", ...me, profile });
        if (action === "lock" && req.method === "POST") {
            const { ttl } = (await req.json<{ ttl?: number }>().catch(() => null)) ?? {};
            return lockCall(env, { op: "acquire", ...me, profile, ttl });
        }
        return json({ error: "not found" }, 404);
    },
} satisfies ExportedHandler<Env>;

