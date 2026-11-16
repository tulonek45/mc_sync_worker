import type { Env, UserRecord } from "./types";
import { authUser } from "./auth";
import { handleDiscord } from "./discord";
import { json } from "./response";

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const path = new URL(req.url).pathname;

        if (path === "/discord") return handleDiscord(req, env);

        const user = await authUser(req, env);
        if (!user) return json({ error: "unauthorized" }, 401);

        if (path === "/test") return json({ message: `Hello ${user.name}!` }, 200)

        return json({ error: "not found" }, 404);
    },
} satisfies ExportedHandler<Env>;
