import type { Env, ProfileManifest } from "./types";
import { json } from "./response";
import { presign } from "./r2";
import { lockCall } from "./lock";

const SHA256_RE = /^[0-9a-f]{64}$/;
const PROFILE_RE = /^[a-z0-9-]{1,32}$/;

// Paths the profile must never write
const RESERVED_NAMES = new Set([
    "server.properties",
    "eula.txt",
    "banned-players.json",
    "banned-ips.json",
    "ops.json",
    "whitelist.json",
]);
const RESERVED_DIRS = new Set([
    "world",
    "logs",
    "crash-reports"
]);


function isSafePath(p: unknown): p is string {
    if (typeof p !== "string" || p.length === 0 || p.length > 200) return false;
    if (p.startsWith("/") || p.includes("\\") || p.includes("\0")) return false;
    const parts = p.split("/");
    if (parts.some(s => s === "" || s === "." || s === "..")) return false;
    if (RESERVED_DIRS.has(parts[0])) return false;
    if (RESERVED_NAMES.has(parts[parts.length - 1]) && parts.length === 1) return false;
    return true;
}


export function validateManifest(raw: unknown): ProfileManifest | string {
    if (typeof raw !== "object" || raw === null) return "manifest is not an object";
    const m = raw as Partial<ProfileManifest>;

    if (typeof m.version !== "number" || !Number.isInteger(m.version)) return "version must be an integer";

    const s = m.server;
    if (!s || typeof s.type !== "string" || typeof s.mc_version !== "string" || typeof s.url !== "string")
        return "server needs type, mc_version and url";
    if (!s.url.startsWith("https://")) return "server.url must be https";
    if (!s.sha256 && !s.sha1) return "server needs a sha256 or sha1";

    if (!Array.isArray(m.files)) return "files must be an array";
    const seen = new Set<string>();
    for (const f of m.files) {
        if (!isSafePath(f?.path)) return `unsafe or reserved path: ${JSON.stringify(f?.path)}`;
        if (typeof f.sha256 !== "string" || !SHA256_RE.test(f.sha256)) return `bad sha256 for ${f.path}`;
        if (seen.has(f.path)) return `duplicate path: ${f.path}`;
        seen.add(f.path);
    }

    if (typeof m.properties !== "object" || m.properties === null) return "properties must be an object";
    for (const [k, v] of Object.entries(m.properties))
        if (typeof v !== "string") return `property ${k} must be a string`;

    return m as ProfileManifest;
}


export async function getProfile(env: Env, profile: string): Promise<Response> {
    const obj = await env.WORLD.get(`profiles/${profile}/manifest.json`);
    if (!obj) return json({ error: "no profile published" }, 404);

    let raw: unknown;
    try { raw = await obj.json(); }
    catch { return json({ error: "manifest is not valid JSON" }, 500); }

    const manifest = validateManifest(raw);
    if (typeof manifest === "string") return json({ error: `invalid manifest: ${manifest}` }, 500);

    const files = await Promise.all(
        manifest.files.map(async f => ({
            ...f,
            url: await presign(env, "GET", `profiles/${profile}/files/${f.sha256}`, 900),
        }))
    );

    return json({ ...manifest, files });
}


export async function listProfiles(env: Env): Promise<Response> {
    const listing = await env.WORLD.list({ prefix: "profiles/", delimiter: "/" });
    const names = listing.delimitedPrefixes
        .map(p => p.slice("profiles/".length, -1))
        .filter(n => PROFILE_RE.test(n));

    const profiles = await Promise.all(names.map(async profile => {
        const obj = await env.WORLD.get(`profiles/${profile}/manifest.json`);
        if (!obj) return null;
        const manifest = validateManifest(await obj.json().catch(() => null));
        if (typeof manifest === "string") return null;
        const lock = await lockCall(env, { op: "state", id: "", name: "", session: "", profile })
            .then(r => r.json<{ holder?: string }>())
            .catch(() => null);

        return {
            name: profile,
            mc_version: manifest.server.mc_version,
            type: manifest.server.type,
            locked_by: lock?.holder ?? null,
        };
    }));
    return json({ profiles: profiles.filter(Boolean) });
}