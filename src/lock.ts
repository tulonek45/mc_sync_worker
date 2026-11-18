import { Env, LockRequest, LockState } from "./types";

export function lockCall(env: Env, body: LockRequest): Promise<Response> {
    return env.LOCK.get(env.LOCK.idFromName("world")).fetch("https://lock/", { method: "POST", body: JSON.stringify(body) });
}


const safeTtl = (ttl?: unknown): number => 
    Math.min(Math.max(typeof ttl === "number" && Number.isFinite(ttl) ? ttl : 120, 60), 900);


const mine = (state: LockState | undefined, request: LockRequest) => 
    state && state.id === request.id && state.session === request.session;


export class Lock implements DurableObject {
    constructor(private state: DurableObjectState) {}

    async fetch(req: Request): Promise<Response> {
        const body = await req.json() as LockRequest;
        const { op, id, name } = body;
        const now = Date.now();
        let cur = await this.state.storage.get<LockState>("lock");

        if (cur && cur.exp < now) cur = undefined; // Lease expired

        if (op === "acquire") {
            if (cur && !mine(cur, body)) return Response.json({ ok: false, holder: cur.name }, { status: 409 });
            const ttl = safeTtl(body.ttl);
            const session = body.session
            await this.state.storage.put("lock", { id, name, session, ttl, exp: now + ttl * 1000 });
            return Response.json({ ok: true });
        }
        if (op === "heartbeat") {
            if (!cur || !mine(cur, body)) return Response.json({ ok: false, error: "no lock" }, { status: 409 });
            await this.state.storage.put("lock", { ...cur, exp: now + cur.ttl * 1000 });
            return Response.json({ ok: true });
        }
        if (op === "check") {
            if (!cur || !mine(cur, body)) return Response.json({ ok: false, error: "no lock" }, { status: 409 });
            return Response.json({ ok: true });
        }
        if (op === "release") {
            if (cur && mine(cur, body)) await this.state.storage.delete("lock");
            return Response.json({ ok: true });
        }
        return Response.json({ error: "bad op" }, { status: 400 });
  }
}

