import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, passwordStamp, readSessionToken, verifySessionToken } from "./session";

const UID = "11111111-2222-3333-4444-555555555555";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret";
});

describe("session tokens", () => {
  it("round-trips the user and the password stamp", async () => {
    const stamp = await passwordStamp("scrypt$a$b");
    const token = await createSessionToken(UID, stamp);
    expect(await readSessionToken(token)).toEqual({ userId: UID, stamp });
    expect(await verifySessionToken(token)).toBe(UID);
  });
  it("changes the stamp when the password hash changes", async () => {
    expect(await passwordStamp("scrypt$a$b")).not.toBe(await passwordStamp("scrypt$a$c"));
  });
  it("rejects a tampered stamp", async () => {
    const token = await createSessionToken(UID, await passwordStamp("x"));
    const [u, e, , sig] = token.split(".");
    expect(await readSessionToken(`${u}.${e}.${await passwordStamp("y")}.${sig}`)).toBeNull();
  });
  it("still accepts an older token without a stamp", async () => {
    const expires = Date.now() + 60_000;
    const sig = createHmac("sha256", "test-secret").update(`${UID}.${expires}`).digest("hex");
    expect(await readSessionToken(`${UID}.${expires}.${sig}`)).toEqual({ userId: UID, stamp: null });
  });
});
