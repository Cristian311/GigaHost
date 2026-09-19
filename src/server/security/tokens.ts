import { createHash, randomBytes } from "node:crypto";

/** 256 bits of randomness, URL-safe. This is what goes into the emailed link. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Tokens are stored hashed: the link in the email is the only place the real
 * value exists, so reading the database is not enough to use one. A plain
 * SHA-256 is appropriate here because the input is already high-entropy; this
 * is not a password.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
