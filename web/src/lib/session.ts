// Signed session cookie: "<userId>.<expiresMs>.<stamp>.<hmac>". Uses Web Crypto
// so it works in the proxy and in route handlers. Rotating SESSION_SECRET signs
// everyone out. The stamp is a fingerprint of the account's password hash:
// changing or resetting the password changes it, which signs out every other
// device (route handlers compare it with the database; see requireUser).
// Older three-part tokens without a stamp are still accepted and upgraded.

export const SESSION_COOKIE = "fo_session";
export const SESSION_DAYS = 30;

function secret(): string {
  return process.env.SESSION_SECRET ?? "";
}

export const authConfigured = () => Boolean(process.env.SESSION_SECRET);

const enc = new TextEncoder();
const ID_RE = /^[0-9a-f-]{36}$/;

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings without leaking where they differ. */
function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const STAMP_RE = /^[0-9a-f]{16}$/;

/** Short fingerprint of a password hash; changes whenever the password does. */
export async function passwordStamp(passwordHash: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(passwordHash)));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(userId: string, stamp: string): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${userId}.${expires}.${stamp}.${await hmac(`${userId}.${expires}.${stamp}`)}`;
}

export interface SessionClaims {
  userId: string;
  /** Password fingerprint at sign-in; null for tokens issued before stamps existed. */
  stamp: string | null;
}

/** The token's user and stamp, or null for a missing, expired or forged token. */
export async function readSessionToken(token: string | undefined): Promise<SessionClaims | null> {
  if (!token || !authConfigured()) return null;
  const parts = token.split(".");
  const [userId, expires] = parts;
  if (!userId || !ID_RE.test(userId) || !expires || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return null;
  if (parts.length === 4) {
    const [, , stamp, sig] = parts;
    if (!STAMP_RE.test(stamp) || !sig) return null;
    return safeEqual(sig, await hmac(`${userId}.${expires}.${stamp}`)) ? { userId, stamp } : null;
  }
  if (parts.length === 3) {
    const sig = parts[2];
    return sig && safeEqual(sig, await hmac(`${userId}.${expires}`)) ? { userId, stamp: null } : null;
  }
  return null;
}

/** The signed-in user's id, or null (signature and expiry only; used by the proxy). */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  return (await readSessionToken(token))?.userId ?? null;
}
