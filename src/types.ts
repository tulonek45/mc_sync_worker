export interface Env {
    WORLD: R2Bucket;
    USERS: KVNamespace;
    LOCK: DurableObjectNamespace
    R2_ACCOUNT_ID: string;
    R2_BUCKET: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    DISCORD_ROLE_ID: string;
    DISCORD_PUBLIC_KEY: string;
    KEEP_VERSIONS: string;
}

export interface UserRecord {
    id: string;
    name: string;
} 

export interface SessionUser extends UserRecord {
    session: string;
}

export interface DiscordInteraction {
    type: number;
    member?: {
        roles: string[];
        user: {
            id: string;
            username: string;
        };
    };
    data?: {
        name: string;
    };
}

export type LockOp = "acquire" | "heartbeat" | "check" | "release";
export interface LockRequest { op: LockOp; id: string; name: string; session: string; ttl?: number }
export interface LockState { id: string; name: string; session: string; ttl: number; exp: number }
