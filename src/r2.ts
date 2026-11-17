import { AwsClient } from "aws4fetch";
import type { Env } from "./types";

export async function presign(env: Env, method: "GET" | "PUT", key: string, expires = 900): Promise<string> {
    const aws = new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: "s3",
        region: "auto",
    });
    const url = new URL(`https://${env.R2_BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`);
    url.searchParams.set("X-Amz-Expires", String(expires));
    const signed = await aws.sign(new Request(url, { method }), { aws: { signQuery: true } });
    return signed.url;
}
