import { describe, expect, it } from "vitest";
import { buildFinancialSummary, extractAmount, fallbackReply, suggestQuestions } from "./coach";
import { EMPTY_FINANCIAL_PROFILE } from "./types";

describe("extractAmount", () => {
  it("understands common Indonesian amount styles", () => {
    expect(extractAmount("Aku mampu beli iPhone Rp15 juta nggak?")).toBe(15_000_000);
    expect(extractAmount("hp 5jt")).toBe(5_000_000);
    expect(extractAmount("Rp1.500.000")).toBe(1_500_000);
    expect(extractAmount("sepatu 750rb")).toBe(750_000);
    expect(extractAmount("2,5 juta")).toBe(2_500_000);
    expect(extractAmount("halo")).toBeNull();
  });
});

describe("fallbackReply", () => {
  const data = {
    financial: { ...EMPTY_FINANCIAL_PROFILE, monthly_income: 4_000_000, monthly_expenses: 3_000_000, current_savings: 1_000_000, onboarding_completed: true },
    categories: [
      { id: "pay", name: "Gaji", type: "income" as const, icon: "gaji", sort_order: 1 },
      { id: "food", name: "Makan & minum", type: "expense" as const, icon: "makan", sort_order: 1 },
    ],
    transactions: [
      { id: "1", type: "income" as const, category_id: "pay", amount: 4_000_000, description: null, transaction_date: "2026-11-01", created_at: "2026-11-01T00:00:00Z" },
      { id: "2", type: "expense" as const, category_id: "food", amount: 500_000, description: "rahasia", transaction_date: "2026-11-10", created_at: "2026-11-10T00:00:00Z" },
    ],
    goals: [],
  };
  const summary = buildFinancialSummary(data, "2026-11-14");

  it("builds a summary from real figures without free-text notes", () => {
    expect(summary.this_month).toMatchObject({ income: 4_000_000, expense: 500_000, net: 3_500_000 });
    expect(summary.recorded_balance).toBe(4_500_000);
    expect(JSON.stringify(summary)).not.toContain("rahasia");
  });

  it("answers affordability questions with the user's numbers", () => {
    const r = fallbackReply("Aku mampu beli HP Rp5 juta nggak?", summary);
    expect(r).toContain("Rp4.500.000");
    expect(r).toMatch(/belum disarankan/i);
  });

  it("summarises the month otherwise", () => {
    expect(fallbackReply("gimana keuanganku?", summary)).toContain("arus kas bersih Rp3.500.000");
  });
});

describe("suggestQuestions", () => {
  const base = {
    financial: { ...EMPTY_FINANCIAL_PROFILE, monthly_income: 4_000_000, onboarding_completed: true, emergency_fund_status: "belum_ada" },
    categories: [{ id: "food", name: "Makan & minum", type: "expense" as const, icon: "makan", sort_order: 1 }],
    goals: [],
  };
  it("asks about the user's own spending first", () => {
    const s = buildFinancialSummary(
      { ...base, transactions: [{ id: "1", type: "expense" as const, category_id: "food", amount: 450_000, description: null, transaction_date: "2026-11-10", created_at: "2026-11-10T00:00:00Z" }] },
      "2026-11-14",
    );
    const qs = suggestQuestions(s);
    expect(qs).toHaveLength(3);
    expect(qs[0]).toBe("Bulan ini aku minus. Gimana nutupnya?");
    expect(qs[1]).toContain("makan & minum yang sudah 450 rb");
  });
  it("falls back to profile questions before any record", () => {
    const qs = suggestQuestions(buildFinancialSummary({ ...base, transactions: [] }, "2026-11-14"));
    expect(qs).toHaveLength(3);
    expect(qs).toContain("Dana darurat idealnya berapa buatku?");
    expect(new Set(qs).size).toBe(3);
  });
});
