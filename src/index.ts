import type { Env } from "./types";
import { authUser } from "./auth";
import { handleDiscord } from "./discord";
import { json } from "./response";
import { getLatest, commitWorld, uploadUrl } from "./world";
import { lockCall, Lock } from "./lock";

export { Lock };

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const path = new URL(req.url).pathname;

        if (path === "/discord") return handleDiscord(req, env);

        const user = await authUser(req, env);
        if (!user) return json({ error: "unauthorized" }, 401);

        if (path === "/test") return json({ message: `Hello ${user.name}!` }, 200)

        const session = req.headers.get("X-Session") ?? "";
        if (session.length < 8 || session.length > 64) return json({ error: "missing or invalid X-Session header" }, 400);

        const me = { id: user.id, name: user.name, session };
        if (path === "/latest") return await getLatest(env);
        if (path === "/upload-url") return await uploadUrl(env, me)
        if (path === "/commit" && req.method === "POST") return await commitWorld(req, env, me)
        if (path === "/heartbeat") return lockCall(env, { op: "heartbeat", ...me });
        if (path === "/release") return lockCall(env, { op: "release", ...me });
        if (path === "/lock") return lockCall(env, { op: "acquire", ...me, ...(await req.json<{ ttl?: number }>().catch(() => null))});
        return json({ error: "not found" }, 404);
    },
} satisfies ExportedHandler<Env>;

