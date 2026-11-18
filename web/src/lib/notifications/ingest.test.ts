import { describe, expect, it } from "vitest";
import type { Category } from "../types";
import { fingerprintSource, occurredAt, suggestCategory } from "./ingest";

const cats: Category[] = [
  { id: "makan", name: "Makan & minum", type: "expense", icon: "makan", sort_order: 1 },
  { id: "belanja", name: "Belanja", type: "expense", icon: "belanja", sort_order: 3 },
  { id: "tagihan", name: "Tagihan", type: "expense", icon: "tagihan", sort_order: 8 },
  { id: "lain-out", name: "Lainnya", type: "expense", icon: "lainnya", sort_order: 11 },
  { id: "gaji", name: "Gaji", type: "income", icon: "gaji", sort_order: 1 },
  { id: "lain-in", name: "Lainnya", type: "income", icon: "lainnya", sort_order: 6 },
];

describe("when it happened", () => {
  it("uses the phone's time in Jakarta", () => {
    expect(occurredAt("2026-11-18T08:24:10.000Z", new Date("2026-11-18T09:00:00Z"))).toEqual({ date: "2026-11-18", time: "15:24" });
  });
  it("crosses midnight in Jakarta, not UTC", () => {
    expect(occurredAt("2026-11-18T17:30:00.000Z", new Date("2026-11-18T18:00:00Z"))).toEqual({ date: "2026-11-19", time: "00:30" });
  });
  it("falls back to now for a missing or future time", () => {
    const now = new Date("2026-11-18T09:00:00Z");
    expect(occurredAt(undefined, now)).toEqual({ date: "2026-11-18", time: "16:00" });
    expect(occurredAt("2026-12-01T00:00:00Z", now)).toEqual({ date: "2026-11-18", time: "16:00" });
  });
});

describe("fingerprint", () => {
  it("is the same for the same notification within a minute, different otherwise", () => {
    const a = { packageName: "id.dana", title: "DANA", text: "Rp3.500 telah  diterima", postedAt: "2026-11-18T08:24:10.000Z" };
    expect(fingerprintSource(a)).toBe(fingerprintSource({ ...a, text: "Rp3.500 telah diterima", postedAt: "2026-11-18T08:24:55.000Z" }));
    expect(fingerprintSource(a)).not.toBe(fingerprintSource({ ...a, postedAt: "2026-11-18T08:26:00.000Z" }));
  });
});

describe("category suggestion", () => {
  it("matches the app's own category name, then keywords, then Lainnya", () => {
    expect(suggestCategory({ type: "expense", categoryHint: "Belanja", description: "Belanja" }, cats)).toBe("belanja");
    expect(suggestCategory({ type: "expense", categoryHint: "Pulsa & Paket Data", description: "" }, cats)).toBe("tagihan");
    expect(suggestCategory({ type: "expense", categoryHint: "Transfer Rekening", description: "Transfer Rekening" }, cats)).toBe("lain-out");
    expect(suggestCategory({ type: "income", categoryHint: null, description: "Uang masuk DANA · Budi" }, cats)).toBe("lain-in");
    expect(suggestCategory({ type: "income", categoryHint: "Gaji", description: "" }, cats)).toBe("gaji");
  });
});
