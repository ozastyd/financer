import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Account passwords are stored as scrypt hashes: "scrypt$<salt>$<hash>" (base64).

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize("NFKC"), salt, 64, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

// Checked against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = `scrypt$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(64).toString("base64")}`;

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const [scheme, salt, hash] = (stored ?? DUMMY_HASH).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"));
  return stored !== undefined && actual.length === expected.length && timingSafeEqual(actual, expected);
}
