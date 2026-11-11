import crypto from "crypto";

/**
 * Generate a cryptographically unpredictable session token (256-bit entropy).
 * Never use Math.random() for security tokens.
 */
export function generateSecureToken(prefix = "tok"): string {
  const bytes = crypto.randomBytes(32);
  return `${prefix}_${bytes.toString("hex")}`;
}

/**
 * Calculate the SHA-256 hash of a buffer or string.
 * Returns lowercase hex digest.
 */
export function calculateSHA256(content: Buffer | string): string {
  const hash = crypto.createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function secureTimingCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
