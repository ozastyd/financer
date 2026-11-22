import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({}));
const { cleanSuggestions } = await import("./coach-server");

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
