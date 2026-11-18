import { jest, describe, test, expect, afterEach, beforeEach } from "@jest/globals";
import type { Env, SessionUser } from "../../src/types";

jest.doMock("../../src/lock", () => ({ lockCall: jest.fn() }));
jest.doMock("../../src/r2", () => ({ presign: jest.fn() }));

const { commitWorld, getLatest, uploadUrl } = jest.requireActual<typeof import("../../src/world")>("../../src/world");
const { lockCall } = jest.requireMock<typeof import("../../src/lock")>("../../src/lock");
const { presign } = jest.requireMock<typeof import("../../src/r2")>("../../src/r2");
const mockLockCall = jest.mocked(lockCall);
const mockPresign = jest.mocked(presign);
const user: SessionUser = { id: "user-1", name: "Test User", session: "world-test-session" };

function createWorld() {
    const objects = new Map<string, string>();
    const bucket = {
        get: jest.fn(async (key: string) => {
            const value = objects.get(key);
            if (value === undefined) return null;
            return {
                json: async <T>() => JSON.parse(value) as T,
            };
        }),
        head: jest.fn(async (key: string) => objects.has(key) ? { key } : null),
        put: jest.fn(async (key: string, value: string) => { objects.set(key, value); }),
        list: jest.fn(async ({ prefix }: { prefix: string }) => ({
            objects: [...objects.keys()]
                .filter(key => key.startsWith(prefix))
                .map(key => ({ key })),
        })),
        delete: jest.fn(async (keys: string[]) => {
            for (const key of keys) objects.delete(key);
        }),
    };
    const env = {
        WORLD: bucket,
        KEEP_VERSIONS: "3",
    } as unknown as Env;
    return { env, objects, bucket };
}

function commitRequest(key: unknown): Request {
    return new Request("https://worker/commit", {
        method: "POST",
        body: JSON.stringify({ key }),
    });
}

describe("world operations", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLockCall.mockResolvedValue(Response.json({ ok: true }));
        mockPresign.mockResolvedValue("https://signed.example/world");
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("uploadUrl returns the lock denial without signing an upload", async () => {
        const { env } = createWorld();
        const denial = Response.json({ ok: false, error: "no lock" }, { status: 409 });
        mockLockCall.mockResolvedValue(denial);

        const response = await uploadUrl(env, user);

        expect(response).toBe(denial);
        expect(mockPresign).not.toHaveBeenCalled();
        expect(mockLockCall).toHaveBeenCalledWith(env, { op: "check", ...user });
    });

    test("uploadUrl signs a timestamped ZIP key when the lock is held", async () => {
        const { env } = createWorld();
        const now = new Date("2026-01-02T03:04:05Z");
        jest.useFakeTimers().setSystemTime(now);

        const response = await uploadUrl(env, user);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            key: `worlds/${now.getTime()}.zip`,
            url: "https://signed.example/world",
        });
        expect(mockPresign).toHaveBeenCalledWith(env, "PUT", `worlds/${now.getTime()}.zip`, 3600);
    });

    test("commitWorld stops on lock denial", async () => {
        const { env, bucket } = createWorld();
        const denial = Response.json({ ok: false, error: "no lock" }, { status: 409 });
        mockLockCall.mockResolvedValue(denial);

        const response = await commitWorld(commitRequest("worlds/world.zip"), env, user);

        expect(response).toBe(denial);
        expect(bucket.head).not.toHaveBeenCalled();
        expect(bucket.put).not.toHaveBeenCalled();
    });

    test("commitWorld rejects keys outside the worlds prefix", async () => {
        const { env, bucket } = createWorld();

        const response = await commitWorld(commitRequest("private/world.zip"), env, user);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid key" });
        expect(bucket.head).not.toHaveBeenCalled();
    });

    test("commitWorld rejects an upload that is missing from R2", async () => {
        const { env, bucket } = createWorld();
        const log = jest.spyOn(console, "log").mockImplementation(() => {});

        const response = await commitWorld(commitRequest("worlds/missing.zip"), env, user);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "object missing" });
        expect(bucket.head).toHaveBeenCalledWith("worlds/missing.zip");
        expect(bucket.put).not.toHaveBeenCalled();
        log.mockRestore();
    });

    test("commitWorld updates latest and deletes archives outside retention", async () => {
        const { env, objects, bucket } = createWorld();
        env.KEEP_VERSIONS = "2";
        objects.set("worlds/a.zip", "a");
        objects.set("worlds/b.zip", "b");
        objects.set("worlds/d.zip", "d");
        objects.set("worlds/z.zip", "z");
        jest.useFakeTimers().setSystemTime(new Date("2026-01-02T03:04:05Z"));

        const response = await commitWorld(commitRequest("worlds/z.zip"), env, user);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(JSON.parse(objects.get("latest.json")!)).toEqual({
            key: "worlds/z.zip",
            ts: Date.now(),
            by: user.name,
        });
        expect(bucket.delete).toHaveBeenCalledWith(["worlds/b.zip", "worlds/a.zip"]);
        expect(objects.has("worlds/a.zip")).toBe(false);
        expect(objects.has("worlds/b.zip")).toBe(false);
        expect(objects.has("worlds/d.zip")).toBe(true);
        expect(objects.has("worlds/z.zip")).toBe(true);
    });

    test("getLatest returns an empty pointer when no latest object exists", async () => {
        const { env, bucket } = createWorld();

        const response = await getLatest(env);

        expect(await response.json()).toEqual({ key: null });
        expect(mockPresign).not.toHaveBeenCalled();
        expect(bucket.get).toHaveBeenCalledWith("latest.json");
    });

    test("getLatest signs a download URL for the committed pointer", async () => {
        const { env, objects } = createWorld();
        const pointer = { key: "worlds/world.zip", ts: 123, by: user.name };
        objects.set("latest.json", JSON.stringify(pointer));

        const response = await getLatest(env);

        expect(await response.json()).toEqual({
            ...pointer,
            url: "https://signed.example/world",
        });
        expect(mockPresign).toHaveBeenCalledWith(env, "GET", pointer.key);
    });

    test("completes an upload, commit, and latest retrieval cycle using fake R2", async () => {
        const { env, objects } = createWorld();
        jest.useFakeTimers().setSystemTime(new Date("2026-01-02T03:04:05Z"));
        mockPresign
            .mockResolvedValueOnce("https://signed.example/upload")
            .mockResolvedValueOnce("https://signed.example/download");

        const uploadResponse = await uploadUrl(env, user);
        const upload = await uploadResponse.json() as { key: string; url: string };
        objects.set(upload.key, "uploaded archive");

        const commitResponse = await commitWorld(commitRequest(upload.key), env, user);
        expect(commitResponse.status).toBe(200);

        const latestResponse = await getLatest(env);

        expect(await latestResponse.json()).toEqual({
            key: upload.key,
            ts: Date.now(),
            by: user.name,
            url: "https://signed.example/download",
        });
        expect(mockLockCall).toHaveBeenCalledTimes(2);
        expect(mockPresign).toHaveBeenNthCalledWith(1, env, "PUT", upload.key, 3600);
        expect(mockPresign).toHaveBeenNthCalledWith(2, env, "GET", upload.key);
    });
});
