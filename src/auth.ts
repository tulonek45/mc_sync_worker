import type { Env, UserRecord } from "./types";
import { sha256 } from "./crypto";

export async function authUser(req: Request, env: Env): Promise<UserRecord | null> {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return null;
    return env.USERS.get<UserRecord>(`tok:${await sha256(token)}`, "json");
}
