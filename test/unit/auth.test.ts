import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { Env, UserRecord } from "../../src/types";

jest.doMock("../../src/crypto", () => ({ sha256: jest.fn() }));

const { authUser } = jest.requireActual<typeof import("../../src/auth")>("../../src/auth");
const { sha256 } = jest.requireMock<typeof import("../../src/crypto")>("../../src/crypto");
const mockSha256 = jest.mocked(sha256);

function createEnv(get: ReturnType<typeof jest.fn>): Env {
    return {
        USERS: { get } as unknown as KVNamespace,
    } as Env;
}

describe("authUser", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSha256.mockResolvedValue("mock-token-hash");
    });

    test("returns null without looking up an absent bearer token", async () => {
        const get = jest.fn();

        const user = await authUser(new Request("https://worker/test"), createEnv(get));

        expect(user).toBeNull();
        expect(mockSha256).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
    });

    test("hashes a bearer token before looking up its user record", async () => {
        const token = "unit-test-token";
        const userRecord: UserRecord = { id: "user-1", name: "Test User" };
        const get = jest.fn<(key: string, type: "json") => Promise<UserRecord | null>>().mockResolvedValue(userRecord);

        const user = await authUser(
            new Request("https://worker/test", { headers: { Authorization: `Bearer ${token}` } }),
            createEnv(get),
        );

        expect(user).toEqual(userRecord);
        expect(mockSha256).toHaveBeenCalledWith(token);
        expect(get).toHaveBeenCalledWith("tok:mock-token-hash", "json");
    });

    test("returns null when the token has no matching user record", async () => {
        const token = "unknown-token";
        const get = jest.fn<() => Promise<UserRecord | null>>().mockResolvedValue(null);

        const user = await authUser(
            new Request("https://worker/test", { headers: { Authorization: `Bearer ${token}` } }),
            createEnv(get),
        );

        expect(user).toBeNull();
        expect(mockSha256).toHaveBeenCalledWith(token);
        expect(get).toHaveBeenCalledTimes(1);
    });
});
