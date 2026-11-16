export interface Env {
    WORLD: R2Bucket;
    USERS: KVNamespace;
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
