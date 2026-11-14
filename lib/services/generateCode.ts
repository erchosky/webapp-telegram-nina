import crypto from "node:crypto";

/** Matches VIP Guard's referral_codes.code constraint: ^[A-Za-z0-9_-]{6,32}$ */
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;

// Unambiguous alphabet (no 0/O/1/I/l) — easier to read and share verbally.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * Generate a random referral code that satisfies REFERRAL_CODE_PATTERN.
 * Uses crypto-grade randomness with rejection sampling to avoid modulo bias.
 */
export function generateReferralCode(length = 8): string {
  if (length < 6 || length > 32) {
    throw new RangeError("referral code length must be between 6 and 32");
  }
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = "";
  while (out.length < length) {
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      const b = bytes[i];
      if (b < max) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}
