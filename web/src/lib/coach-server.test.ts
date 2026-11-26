import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({}));
const { SAYS_NOT_FOUND, cleanSuggestions, keywordsOf } = await import("./coach-server");

describe("cleanSuggestions", () => {
  it("keeps amounts at the start and strips list numbering", () => {
    expect(cleanSuggestions({ questions: ["6 jt per bulan, cukup buat dana darurat?", "1. Utang 2 jt, lunasin dulu?", '"Makan 1,25 jt, kebanyakan nggak"'] })).toEqual([
      "6 jt per bulan, cukup buat dana darurat?",
      "Utang 2 jt, lunasin dulu?",
      "Makan 1,25 jt, kebanyakan nggak?",
    ]);
  });
  it("rejects wrong units and doubled words, so too few are left", () => {
    expect(cleanSuggestions({ questions: ["Bagaimana nyimpen 6M?", "Target 750k cukup?", "Lunasin dulu dulu?", "Utang 2 jt, lunasin dulu?"] })).toBeNull();
    expect(cleanSuggestions({ nope: 1 })).toBeNull();
  });
});

describe("records check after a 'not found' reply", () => {
  it("spots replies that deny or ask for records the Coach can search", () => {
    for (const t of [
      "Aku nggak menemukan transaksi “Axon Suites” di catatan bulan ini.",
      "Untuk melihat detailnya, aku perlu mengakses catatan transaksi kamu.",
      "Data transaksi sewa Axon Suites kemarin belum ada di catatanmu. Tambahkan dulu transaksi itu.",
      "Aku belum bisa menemukan transaksi spesifik itu.",
    ])
      expect(SAYS_NOT_FOUND.test(t)).toBe(true);
  });

  it("leaves ordinary answers alone", () => {
    for (const t of ["25 Nov: AXON Suites @bukit bintang Rp1.156.430.", "Tabunganmu belum ada yang terkumpul.", "Dana darurat sebaiknya tidak dipakai."])
      expect(SAYS_NOT_FOUND.test(t)).toBe(false);
  });

  it("keeps the words that name the transaction", () => {
    expect(keywordsOf("pengeluaran axon suites sewa kemaren")).toEqual(["axon", "suites", "sewa"]);
    expect(keywordsOf("Berapa kali aku beli kopi bulan ini?")).toEqual(["kopi"]);
  });
});
