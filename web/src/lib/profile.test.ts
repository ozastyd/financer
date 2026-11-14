import { describe, expect, it } from "vitest";
import { buildStartingProfile } from "./profile";
import { coachRequest, goalInput, onboardingInput, transactionInput } from "./schemas";
import { EMPTY_FINANCIAL_PROFILE, type FinancialProfile } from "./types";

const fp = (over: Partial<FinancialProfile>): FinancialProfile => ({ ...EMPTY_FINANCIAL_PROFILE, ...over });

describe("buildStartingProfile", () => {
  it("derives the monthly surplus from the answers", () => {
    const p = buildStartingProfile(
      fp({ monthly_income: 4_500_000, monthly_expenses: 3_000_000, monthly_obligations: 400_000, current_savings: 4_250_000, income_frequency: "bulanan" }),
      "2026-11-14",
    );
    expect(p.surplus).toBe(1_100_000);
    expect(p.strengths).toContain("Pemasukan rutin");
    expect(p.recommended?.key).toBe("darurat");
    expect(p.recommended?.target).toBe(10_200_000);
    expect(p.recommended?.monthly).toBe(550_000);
  });
  it("lets users with no income continue and still get guidance", () => {
    const p = buildStartingProfile(fp({ monthly_expenses: 500_000 }), "2026-11-14");
    expect(p.income).toBe(0);
    expect(p.improvements[0]).toMatch(/Belum ada pemasukan/);
    expect(p.recommended?.key).toBe("rp1jt");
    expect(p.recommended?.monthly).toBeNull();
    expect(p.recommended?.completionDate).toBeNull();
  });
  it("suggests paying debt first when the user chose it", () => {
    const p = buildStartingProfile(fp({ monthly_income: 3_000_000, existing_debt: 2_000_000, goal_choices: ["utang"] }), "2026-11-14");
    expect(p.recommended).toMatchObject({ key: "utang", target: 2_000_000 });
  });
});

describe("schemas", () => {
  it("accepts a valid transaction and rejects bad amounts", () => {
    const ok = transactionInput.safeParse({ type: "expense", category_id: "c1", amount: 35_000, description: " Kopi ", transaction_date: "2026-11-14" });
    expect(ok.success && ok.data.description).toBe("Kopi");
    expect(transactionInput.safeParse({ type: "expense", category_id: "c1", amount: 0, transaction_date: "2026-11-14" }).success).toBe(false);
    expect(transactionInput.safeParse({ type: "expense", category_id: "c1", amount: 10.5, transaction_date: "2026-11-14" }).success).toBe(false);
    expect(transactionInput.safeParse({ type: "expense", category_id: "c1", amount: -5, transaction_date: "2026-11-14" }).success).toBe(false);
    expect(transactionInput.safeParse({ type: "gift", category_id: "c1", amount: 5, transaction_date: "2026-11-14" }).success).toBe(false);
    expect(transactionInput.safeParse({ type: "expense", category_id: "c1", amount: 5, transaction_date: "2026-02-30" }).success).toBe(false);
  });
  it("normalises empty optional fields to null", () => {
    const g = goalInput.parse({ title: "Laptop", target_amount: 8_000_000, description: "" });
    expect(g).toMatchObject({ target_date: null, description: null, monthly_plan: null, priority: 2 });
  });
  it("allows zero income in onboarding but not negative", () => {
    expect(onboardingInput.safeParse({ step: 2, financial: { monthly_income: 0, income_source: "belum_ada" } }).success).toBe(true);
    expect(onboardingInput.safeParse({ step: 2, financial: { monthly_income: -1 } }).success).toBe(false);
  });
  it("limits coach messages", () => {
    expect(coachRequest.safeParse({ messages: [] }).success).toBe(false);
    expect(coachRequest.safeParse({ messages: [{ role: "user", content: "Halo" }] }).success).toBe(true);
  });
});
