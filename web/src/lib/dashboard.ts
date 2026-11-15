// Shape of the `dashboard` database function and how to call it.
// Shared by the browser (Beranda, Coach) and the coach API route.
import { type CategoryAmount, type Period, type Totals, periodRange } from "./finance";

export interface DashboardArgs {
  p_start: string;
  p_end: string;
  p_prev_start: string;
  p_prev_end: string;
  p_bucket: "day" | "month";
  p_today: string;
}

export function dashboardArgs(period: Period, today: string): DashboardArgs {
  const r = periodRange(period, today);
  return {
    p_start: r.start,
    p_end: r.end,
    p_prev_start: r.prevStart,
    p_prev_end: r.prevEnd,
    p_bucket: period === "year" ? "month" : "day",
    p_today: today,
  };
}

interface RawTotals {
  income: number | string;
  expense: number | string;
  count: number | string;
}

export interface DashboardRaw {
  current: RawTotals;
  previous: RawTotals;
  net_by_bucket: { d: string; net: number | string }[];
  expense_by_category: { category_id: string; amount: number | string }[];
  income_by_category: { category_id: string; amount: number | string }[];
  all_time_net: number | string;
  all_time_count: number | string;
  today_count: number | string;
  starting_savings: number | string;
}

export interface Dashboard {
  current: Totals;
  previous: Totals;
  /** Net amount per day (or per month start for the year view). */
  netByDay: Map<string, number>;
  expenseByCategory: CategoryAmount[];
  incomeByCategory: CategoryAmount[];
  /** Starting savings from onboarding plus every income minus every expense. */
  recordedBalance: number;
  allTimeCount: number;
  todayCount: number;
}

const n = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));

function totalsOf(t: RawTotals | null | undefined): Totals {
  const income = n(t?.income);
  const expense = n(t?.expense);
  return { income, expense, net: income - expense, count: n(t?.count) };
}

export function parseDashboard(raw: DashboardRaw): Dashboard {
  return {
    current: totalsOf(raw.current),
    previous: totalsOf(raw.previous),
    netByDay: new Map((raw.net_by_bucket ?? []).map((b) => [b.d, n(b.net)])),
    expenseByCategory: (raw.expense_by_category ?? []).map((c) => ({ category_id: c.category_id, amount: n(c.amount) })),
    incomeByCategory: (raw.income_by_category ?? []).map((c) => ({ category_id: c.category_id, amount: n(c.amount) })),
    recordedBalance: n(raw.starting_savings) + n(raw.all_time_net),
    allTimeCount: n(raw.all_time_count),
    todayCount: n(raw.today_count),
  };
}

export interface MonthTotals extends Totals {
  hasAny: boolean;
}

export function parsePeriodTotals(raw: { income: number | string; expense: number | string; count: number | string; has_any: boolean }): MonthTotals {
  return { ...totalsOf(raw), hasAny: Boolean(raw.has_any) };
}
