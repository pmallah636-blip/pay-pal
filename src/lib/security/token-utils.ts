import crypto from "node:crypto";

/**
 * Hash a raw bearer token using SHA-256.
 * Store the HASH in the database — never the raw token.
 * Returns lowercase hex digest.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Timing-safe comparison of a raw token against a stored SHA-256 hash.
 * Both sides are hashed before comparison so lengths always match,
 * preventing length-based side-channel leakage.
 */
export function verifyTokenHash(rawToken: string, storedHash: string): boolean {
  if (typeof rawToken !== "string" || typeof storedHash !== "string") return false;
  const computedHash = hashToken(rawToken);
  const a = Buffer.from(computedHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
