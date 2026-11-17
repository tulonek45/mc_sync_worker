import type { Env } from "./types";
import { authUser } from "./auth";
import { handleDiscord } from "./discord";
import { json } from "./response";
import { get_latest, commit_world, upload_url } from "./world";

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const path = new URL(req.url).pathname;

        if (path === "/discord") return handleDiscord(req, env);

        const user = await authUser(req, env);
        if (!user) return json({ error: "unauthorized" }, 401);

        if (path === "/test") return json({ message: `Hello ${user.name}!` }, 200)
        if (path === "/latest") return await get_latest(env);
        if (path === "/upload-url") return await upload_url(env)
        if (path === "/commit" && req.method === "POST") return await commit_world(req, env, user)

        return json({ error: "not found" }, 404);
    },
} satisfies ExportedHandler<Env>;

