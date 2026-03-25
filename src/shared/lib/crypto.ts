/**
 * SHA-256 hash using the Web Crypto API (available in all modern webviews).
 * Returns a lowercase hex string.
 */
export async function hashPassword(plain: string): Promise<string> {
    const encoded = new TextEncoder().encode(plain);
    const buffer  = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
