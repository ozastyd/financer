import { describe, expect, it } from "vitest";
import { captureItems, captureReply } from "./capture";

const base = { kind: "other" as const, merchant: null, date: "2026-11-18", total: null, category_id: null, transactions: [] };

describe("what a screenshot adds", () => {
  it("takes the transactions on a bank or e-wallet screen", () => {
    const items = captureItems({ ...base, kind: "statement", transactions: [{ date: null, description: "Transfer ke Budi", amount: 5000, type: "expense", category_id: "c1" }] });
    expect(items).toEqual([{ type: "expense", amount: 5000, description: "Transfer ke Budi", date: "2026-11-18", category_id: "c1" }]);
  });
  it("takes a store receipt's total", () => {
    expect(captureItems({ ...base, kind: "receipt", merchant: "Kopi Senja", total: 28000, category_id: "makan" })).toEqual([
      { type: "expense", amount: 28000, description: "Kopi Senja", date: "2026-11-18", category_id: "makan" },
    ]);
  });
  it("finds nothing on other screens", () => {
    expect(captureItems(base)).toEqual([]);
  });
});

describe("the notification text", () => {
  const one = [{ type: "expense" as const, amount: 5000, description: "Transfer GoPay", date: null, category_id: null }];
  it("says what was added", () => {
    expect(captureReply(one, 1)).toBe("Masuk ke Perlu dicek: Transfer GoPay −Rp5.000");
    expect(captureReply([...one, ...one], 2)).toMatch(/^2 transaksi masuk ke Perlu dicek/);
  });
  it("explains nothing found and repeats", () => {
    expect(captureReply([], 0)).toMatch(/Tidak ada transaksi/);
    expect(captureReply(one, 0)).toMatch(/Sudah tercatat/);
  });
});
