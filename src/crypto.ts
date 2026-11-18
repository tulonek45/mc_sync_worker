export function hex(buffer: ArrayBuffer | Uint8Array): string {
    return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}


export async function sha256(value: string): Promise<string> {
    return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
