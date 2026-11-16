import { describe, expect, it } from "vitest";
import { categoryBreakdown, changePct, cumulativeSeries, flexiblePlan, groupByDay, periodRange, planCheck, recordedBalance, roundedPercents, sameDayComparison, totals } from "./finance";
import type { Category, Transaction } from "./types";

const cats: Category[] = [
  { id: "food", name: "Makan & minum", type: "expense", icon: "makan", sort_order: 1 },
  { id: "trans", name: "Transport", type: "expense", icon: "transport", sort_order: 2 },
  { id: "shop", name: "Belanja", type: "expense", icon: "belanja", sort_order: 3 },
  { id: "subs", name: "Langganan", type: "expense", icon: "langganan", sort_order: 4 },
  { id: "fun", name: "Hiburan", type: "expense", icon: "hiburan", sort_order: 5 },
  { id: "pay", name: "Gaji", type: "income", icon: "gaji", sort_order: 1 },
];

let n = 0;
const tx = (type: Transaction["type"], category_id: string, amount: number, transaction_date: string): Transaction => ({
  id: `t${++n}`,
  type,
  category_id,
  amount,
  description: null,
  transaction_date,
  created_at: `${transaction_date}T0${n % 10}:00:00Z`,
});

const data: Transaction[] = [
  tx("income", "pay", 4_500_000, "2026-11-01"),
  tx("expense", "food", 35_000, "2026-11-14"),
  tx("expense", "food", 30_000, "2026-11-14"),
  tx("expense", "trans", 22_000, "2026-11-14"),
  tx("expense", "shop", 214_500, "2026-11-13"),
  tx("expense", "subs", 55_000, "2026-11-13"),
  tx("expense", "fun", 100_000, "2026-11-12"),
  tx("income", "pay", 4_000_000, "2026-10-01"),
  tx("expense", "food", 1_000_000, "2026-10-20"),
];

describe("totals", () => {
  it("sums the current month only", () => {
    const r = periodRange("month", "2026-11-14");
    expect(r).toMatchObject({ start: "2026-11-01", end: "2026-11-30", prevStart: "2026-10-01", prevEnd: "2026-10-31", label: "November" });
    expect(totals(data, r.start, r.end)).toEqual({ income: 4_500_000, expense: 456_500, net: 4_043_500, count: 7 });
    expect(totals(data, r.prevStart, r.prevEnd).net).toBe(3_000_000);
  });
  it("computes the recorded balance from the starting balance", () => {
    expect(recordedBalance(1_000_000, data)).toBe(1_000_000 + 8_500_000 - 1_456_500);
  });
  it("handles an empty list", () => {
    expect(totals([])).toEqual({ income: 0, expense: 0, net: 0, count: 0 });
  });
});

describe("cumulativeSeries", () => {
  it("accumulates daily net and stops after today", () => {
    const s = cumulativeSeries(data, "month", "2026-11-14");
    expect(s).toHaveLength(30);
    expect(s[0].current).toBe(4_500_000);
    expect(s[13].current).toBe(4_043_500);
    expect(s[14].current).toBeNull();
    expect(s[30 - 1].previous).toBe(3_000_000);
  });
  it("supports week and year", () => {
    expect(cumulativeSeries(data, "week", "2026-11-14")).toHaveLength(7);
    const y = cumulativeSeries(data, "year", "2026-11-14");
    expect(y).toHaveLength(12);
    expect(y[10].current).toBe(3_000_000 + 4_043_500);
    expect(y[11].current).toBeNull();
  });
});

describe("categoryBreakdown", () => {
  it("returns the top categories plus Lainnya", () => {
    const s = categoryBreakdown(data, cats, "2026-11-01", "2026-11-30", "expense", 3);
    expect(s.map((x) => x.name)).toEqual(["Belanja", "Hiburan", "Makan & minum", "Lainnya"]);
    expect(s.reduce((a, b) => a + b.amount, 0)).toBe(456_500);
  });
  it("returns nothing when there is no spending", () => {
    expect(categoryBreakdown([], cats, "2026-11-01", "2026-11-30")).toEqual([]);
  });
  it("rounds percentages to exactly 100", () => {
    expect(roundedPercents([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(roundedPercents([0, 0])).toEqual([0, 0]);
  });
});

describe("groupByDay", () => {
  it("groups newest first with day totals", () => {
    const g = groupByDay(data.filter((t) => t.transaction_date >= "2026-11-12"));
    expect(g.map((d) => d.date)).toEqual(["2026-11-14", "2026-11-13", "2026-11-12"]);
    expect(g[0].net).toBe(-87_000);
    expect(g[1].net).toBe(-269_500);
  });
});

describe("changePct", () => {
  it("is null when the previous value is zero", () => {
    expect(changePct(100, 0)).toBeNull();
    expect(changePct(1_920_000, 1_760_000)).toBe(9);
  });
});

describe("sameDayComparison", () => {
  it("compares at the latest recorded point", () => {
    const s = [
      { key: "a", label: "1", current: 100, previous: 50 },
      { key: "b", label: "2", current: 80, previous: 120 },
      { key: "c", label: "3", current: null, previous: 90 },
    ];
    expect(sameDayComparison(s)).toEqual({ current: 80, previous: 120 });
  });
  it("returns null when nothing is recorded yet", () => {
    expect(sameDayComparison([{ key: "a", label: "1", current: null, previous: 5 }])).toBeNull();
  });
});

describe("planCheck", () => {
  it("spreads the plan evenly over the month", () => {
    const c = planCheck(3_000_000, 1_000_000, "2026-11-15")!;
    expect(c.expectedByToday).toBe(1_500_000);
    expect(c.aheadBy).toBe(500_000);
    expect(c.left).toBe(2_000_000);
    expect(c.daysLeft).toBe(16);
    expect(c.perDay).toBe(125_000);
  });
  it("reports overspending and no allowance left", () => {
    const c = planCheck(1_000_000, 1_200_000, "2026-11-10")!;
    expect(c.aheadBy).toBeLessThan(0);
    expect(c.left).toBe(0);
    expect(c.perDay).toBe(0);
  });
  it("has no check without a plan", () => {
    expect(planCheck(0, 100, "2026-11-10")).toBeNull();
  });
});

describe("flexible plan", () => {
  it("takes fixed costs off the top, reserving obligations until they are paid", () => {
    expect(flexiblePlan(4_900_000, 600_000, 0)).toBe(4_300_000);
    expect(flexiblePlan(4_900_000, 600_000, 2_100_000)).toBe(2_800_000);
    expect(flexiblePlan(1_000_000, 0, 2_000_000)).toBe(0);
  });
});
