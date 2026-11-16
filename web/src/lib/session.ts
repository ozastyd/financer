// Signed session cookie: "<userId>.<expiresMs>.<hmac>". Uses Web Crypto so it
// works in the proxy and in route handlers. Rotating SESSION_SECRET signs
// everyone out. Passwords live hashed in the database (src/lib/password.ts).

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

export async function createSessionToken(userId: string): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${userId}.${expires}.${await hmac(`${userId}.${expires}`)}`;
}

/** The signed-in user's id, or null for a missing, expired or forged token. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token || !authConfigured()) return null;
  const [userId, expires, sig] = token.split(".");
  if (!userId || !ID_RE.test(userId) || !expires || !/^\d+$/.test(expires) || !sig || Number(expires) < Date.now()) return null;
  return safeEqual(sig, await hmac(`${userId}.${expires}`)) ? userId : null;
}
