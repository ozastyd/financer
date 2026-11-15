import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { getSetting, setSettingOnce } from "./db";

// The app password is chosen on first visit and stored as a scrypt hash in
// the database (app_settings.password_hash). Wiping the database clears it.

const KEY = "password_hash";
export const MIN_PASSWORD_LENGTH = 8;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize("NFKC"), salt, 64, (err, key) => (err ? reject(err) : resolve(key))));
}

export function passwordIsSet(): boolean {
  return getSetting(KEY) !== null;
}

/** Stores the first password. Returns false when one already exists. */
export async function setInitialPassword(password: string): Promise<boolean> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return setSettingOnce(KEY, `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`);
}

export async function checkPassword(password: string): Promise<boolean> {
  const stored = getSetting(KEY);
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
