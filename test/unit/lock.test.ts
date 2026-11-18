import { jest, describe, test, expect, afterEach } from "@jest/globals";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { LockState } from "../../src/types";

const { Lock } = jest.requireActual<typeof import("../../src/lock")>("../../src/lock");

function createLock() {
    const values = new Map<string, LockState>();
    const storage = {
        get: async <T>(key: string) => values.get(key) as T | undefined,
        put: async (key: string, value: LockState) => { values.set(key, value); },
        delete: async (key: string) => values.delete(key),
    };
    const lock = new Lock({ storage } as unknown as DurableObjectState);
    return { lock, values };
}

function request(body: unknown): Request {
    return new Request("https://lock/", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

describe("Lock Durable Object", () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    test("acquires a lease and allows the same owner to reacquire it", async () => {
        const { lock, values } = createLock();
        const body = { op: "acquire", id: "one", name: "One", session: "session-one" };

        const firstResponse = await lock.fetch(request(body));
        const reacquireResponse = await lock.fetch(request(body));

        expect(firstResponse.status).toBe(200);
        expect(await firstResponse.json()).toEqual({ ok: true });
        expect(reacquireResponse.status).toBe(200);
        expect(values.get("lock")?.id).toBe("one");
    });

    test("rejects a competing owner and reports the current holder", async () => {
        const { lock } = createLock();
        await lock.fetch(request({ op: "acquire", id: "one", name: "One" }));

        const response = await lock.fetch(request({ op: "acquire", id: "two", name: "Two" }));

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ ok: false, holder: "One" });
    });

    test("checks ownership and rejects a different owner", async () => {
        const { lock } = createLock();
        await lock.fetch(request({ op: "acquire", id: "one", name: "One" }));

        const ownerResponse = await lock.fetch(request({ op: "check", id: "one", name: "One" }));
        const otherResponse = await lock.fetch(request({ op: "check", id: "two", name: "Two" }));

        expect(ownerResponse.status).toBe(200);
        expect(await ownerResponse.json()).toEqual({ ok: true });
        expect(otherResponse.status).toBe(409);
        expect(await otherResponse.json()).toEqual({ ok: false, error: "no lock" });
    });

    test("heartbeats extend the lease only for its owner", async () => {
        const { lock, values } = createLock();
        jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z"));
        await lock.fetch(request({ op: "acquire", id: "one", name: "One" }));
        const initialExpiration = values.get("lock")?.exp;
        jest.advanceTimersByTime(10_000);

        const otherResponse = await lock.fetch(request({ op: "heartbeat", id: "two", name: "Two" }));
        const ownerResponse = await lock.fetch(request({ op: "heartbeat", id: "one", name: "One" }));

        expect(otherResponse.status).toBe(409);
        expect(ownerResponse.status).toBe(200);
        expect(values.get("lock")?.exp).toBeGreaterThan(initialExpiration!);
    });

    test("release clears only the matching owner's lease", async () => {
        const { lock, values } = createLock();
        await lock.fetch(request({ op: "acquire", id: "one", name: "One" }));

        const otherResponse = await lock.fetch(request({ op: "release", id: "two", name: "Two" }));
        expect(otherResponse.status).toBe(200);
        expect(values.has("lock")).toBe(true);

        const ownerResponse = await lock.fetch(request({ op: "release", id: "one", name: "One" }));
        expect(ownerResponse.status).toBe(200);
        expect(values.has("lock")).toBe(false);
    });

    test("allows a new owner to acquire an expired lease", async () => {
        const { lock, values } = createLock();
        jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z"));
        await lock.fetch(request({ op: "acquire", id: "one", name: "One", ttl: 60 }));
        jest.advanceTimersByTime(60_001);

        const response = await lock.fetch(request({ op: "acquire", id: "two", name: "Two" }));

        expect(response.status).toBe(200);
        expect(values.get("lock")?.id).toBe("two");
    });

    test("clamps lease durations to the supported minimum and maximum", async () => {
        const { lock, values } = createLock();
        const now = new Date("2026-01-01T00:00:00Z");
        jest.useFakeTimers().setSystemTime(now);

        await lock.fetch(request({ op: "acquire", id: "one", name: "One", ttl: 1 }));
        expect(values.get("lock")?.exp).toBe(now.getTime() + 60_000);

        await lock.fetch(request({ op: "acquire", id: "one", name: "One", ttl: 1000 }));
        expect(values.get("lock")?.exp).toBe(now.getTime() + 900_000);
    });

    test("rejects unknown operations", async () => {
        const { lock } = createLock();

        const response = await lock.fetch(request({ op: "other", id: "one", name: "One" }));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "bad op" });
    });
});
