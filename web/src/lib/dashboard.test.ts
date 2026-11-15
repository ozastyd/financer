import { describe, expect, it } from "vitest";
import { type DashboardRaw, dashboardArgs, parseDashboard, parsePeriodTotals } from "./dashboard";
import { categoryBreakdown, cumulativeSeries, cumulativeSeriesFromNet, slicesFromAmounts } from "./finance";
import type { Category, Transaction } from "./types";

const cats: Category[] = [
  { id: "food", name: "Makan & minum", type: "expense", icon: "makan", sort_order: 1 },
  { id: "move", name: "Transport", type: "expense", icon: "transport", sort_order: 2 },
  { id: "fun", name: "Hiburan", type: "expense", icon: "hiburan", sort_order: 3 },
  { id: "pay", name: "Gaji", type: "income", icon: "gaji", sort_order: 4 },
];

const tx = (id: string, type: "income" | "expense", category_id: string, amount: number, transaction_date: string): Transaction => ({
  id,
  type,
  category_id,
  amount,
  description: null,
  transaction_date,
  created_at: `${transaction_date}T10:00:00Z`,
});

const txs = [
  tx("1", "income", "pay", 4_500_000, "2026-11-01"),
  tx("2", "expense", "food", 35_000, "2026-11-03"),
  tx("3", "expense", "move", 22_000, "2026-11-03"),
  tx("4", "expense", "food", 120_000, "2026-10-28"),
  tx("5", "income", "pay", 4_500_000, "2026-10-01"),
  tx("6", "expense", "fun", 55_000, "2025-12-20"),
];

describe("dashboardArgs", () => {
  it("uses daily buckets for week and month, monthly for year", () => {
    expect(dashboardArgs("month", "2026-11-15")).toEqual({
      p_start: "2026-11-01",
      p_end: "2026-11-30",
      p_prev_start: "2026-10-01",
      p_prev_end: "2026-10-31",
      p_bucket: "day",
      p_today: "2026-11-15",
    });
    expect(dashboardArgs("year", "2026-11-15").p_bucket).toBe("month");
  });
});

describe("parseDashboard", () => {
  it("turns database numbers (sometimes strings) into totals and a recorded balance", () => {
    const raw: DashboardRaw = {
      current: { income: "4500000", expense: 57000, count: 3 },
      previous: { income: 4500000, expense: "120000", count: "2" },
      net_by_bucket: [{ d: "2026-11-01", net: 4500000 }],
      expense_by_category: [{ category_id: "food", amount: "35000" }],
      income_by_category: [],
      all_time_net: "8768000",
      all_time_count: 6,
      today_count: 0,
      starting_savings: "500000",
    };
    const d = parseDashboard(raw);
    expect(d.current).toEqual({ income: 4_500_000, expense: 57_000, net: 4_443_000, count: 3 });
    expect(d.previous.net).toBe(4_380_000);
    expect(d.recordedBalance).toBe(9_268_000);
    expect(d.netByDay.get("2026-11-01")).toBe(4_500_000);
    expect(d.expenseByCategory).toEqual([{ category_id: "food", amount: 35_000 }]);
  });

  it("reads period totals", () => {
    expect(parsePeriodTotals({ income: "10", expense: 4, count: "2", has_any: true })).toEqual({ income: 10, expense: 4, net: 6, count: 2, hasAny: true });
  });
});

describe("database-shaped inputs give the same result as the old browser maths", () => {
  it("slicesFromAmounts matches categoryBreakdown", () => {
    const sums = new Map<string, number>();
    for (const t of txs) if (t.type === "expense" && t.transaction_date >= "2025-01-01") sums.set(t.category_id, (sums.get(t.category_id) ?? 0) + t.amount);
    const fromDb = slicesFromAmounts([...sums].map(([category_id, amount]) => ({ category_id, amount })), cats, 2);
    expect(fromDb).toEqual(categoryBreakdown(txs, cats, "2025-01-01", "2026-12-31", "expense", 2));
  });

  it("cumulativeSeriesFromNet matches cumulativeSeries for a month (daily buckets)", () => {
    const daily = new Map<string, number>();
    for (const t of txs) daily.set(t.transaction_date, (daily.get(t.transaction_date) ?? 0) + (t.type === "income" ? t.amount : -t.amount));
    expect(cumulativeSeriesFromNet(daily, "month", "2026-11-15")).toEqual(cumulativeSeries(txs, "month", "2026-11-15"));
  });

  it("cumulativeSeriesFromNet matches cumulativeSeries for a year (monthly buckets)", () => {
    const monthly = new Map<string, number>();
    for (const t of txs) {
      const key = `${t.transaction_date.slice(0, 7)}-01`;
      monthly.set(key, (monthly.get(key) ?? 0) + (t.type === "income" ? t.amount : -t.amount));
    }
    expect(cumulativeSeriesFromNet(monthly, "year", "2026-11-15")).toEqual(cumulativeSeries(txs, "year", "2026-11-15"));
  });
});
