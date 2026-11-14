import { describe, expect, it } from "vitest";
import { formatPercent, formatRupiah, formatShort, formatSigned, parseRupiahInput, percent, roundUpTo } from "./money";

describe("formatRupiah", () => {
  it("formats with dot thousands separators and no space", () => {
    expect(formatRupiah(1_500_000)).toBe("Rp1.500.000");
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(35_000)).toBe("Rp35.000");
    expect(formatRupiah(999)).toBe("Rp999");
  });
  it("uses a real minus sign for negatives", () => {
    expect(formatRupiah(-87_000)).toBe("−Rp87.000");
  });
  it("rounds fractional input", () => {
    expect(formatRupiah(1000.6)).toBe("Rp1.001");
  });
});

describe("formatSigned", () => {
  it("prefixes + and −", () => {
    expect(formatSigned(350_000)).toBe("+Rp350.000");
    expect(formatSigned(-35_000)).toBe("−Rp35.000");
    expect(formatSigned(0)).toBe("Rp0");
  });
});

describe("formatShort", () => {
  it("abbreviates", () => {
    expect(formatShort(2_930_000)).toBe("2,93 jt");
    expect(formatShort(750_000)).toBe("750 rb");
    expect(formatShort(12_500_000)).toBe("12,5 jt");
    expect(formatShort(1_200_000_000)).toBe("1,2 M");
    expect(formatShort(500)).toBe("500");
  });
});

describe("parseRupiahInput", () => {
  it("keeps digits only", () => {
    expect(parseRupiahInput("Rp 1.500.000")).toBe(1_500_000);
    expect(parseRupiahInput("35000")).toBe(35_000);
  });
  it("returns null for empty or oversized input", () => {
    expect(parseRupiahInput("")).toBeNull();
    expect(parseRupiahInput("abc")).toBeNull();
    expect(parseRupiahInput("99999999999999")).toBeNull();
  });
});

describe("percent helpers", () => {
  it("clamps and formats", () => {
    expect(percent(4_250_000, 10_000_000)).toBe(42.5);
    expect(percent(5, 0)).toBe(0);
    expect(percent(20, 10)).toBe(100);
    expect(formatPercent(42.5)).toBe("42,5%");
    expect(formatPercent(10)).toBe("10%");
  });
  it("rounds up to a step", () => {
    expect(roundUpTo(821_429, 5_000)).toBe(825_000);
  });
});
