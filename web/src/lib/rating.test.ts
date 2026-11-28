import { describe, expect, it } from "vitest";
import { type RatingStats, shouldAskForRating } from "./rating";

const now = new Date("2026-11-27T10:00:00Z");
const ready: RatingStats = { accountCreatedAt: "2026-11-19T10:00:00Z", activeDays: 3, transactions: 10, rated: false, asks: 0, lastAskedAt: null };

describe("shouldAskForRating", () => {
  it("asks after a week of real use", () => {
    expect(shouldAskForRating(ready, now)).toBe(true);
  });

  it("waits for a week, a few active days and ten transactions", () => {
    expect(shouldAskForRating({ ...ready, accountCreatedAt: "2026-11-21T10:00:00Z" }, now)).toBe(false);
    expect(shouldAskForRating({ ...ready, activeDays: 2 }, now)).toBe(false);
    expect(shouldAskForRating({ ...ready, transactions: 9 }, now)).toBe(false);
  });

  it("never asks again after an answer, or after three asks", () => {
    expect(shouldAskForRating({ ...ready, rated: true }, now)).toBe(false);
    expect(shouldAskForRating({ ...ready, asks: 3, lastAskedAt: "2026-01-01T00:00:00Z" }, now)).toBe(false);
  });

  it("asks again a month after a close", () => {
    expect(shouldAskForRating({ ...ready, asks: 1, lastAskedAt: "2026-11-10T10:00:00Z" }, now)).toBe(false);
    expect(shouldAskForRating({ ...ready, asks: 1, lastAskedAt: "2026-10-27T09:00:00Z" }, now)).toBe(true);
  });
});
