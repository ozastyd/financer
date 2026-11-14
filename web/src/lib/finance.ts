import {
  addDays,
  addMonths,
  daysInMonth,
  endOfMonth,
  formatDayMonth,
  monthName,
  monthShortName,
  startOfMonth,
  startOfWeek,
} from "./date";
import type { Category, Transaction } from "./types";

export type Period = "week" | "month" | "year";

export interface PeriodRange {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  label: string;
  prevLabel: string;
}

export function periodRange(period: Period, today: string): PeriodRange {
  if (period === "week") {
    const start = startOfWeek(today);
    return {
      start,
      end: addDays(start, 6),
      prevStart: addDays(start, -7),
      prevEnd: addDays(start, -1),
      label: "Minggu ini",
      prevLabel: "minggu lalu",
    };
  }
  if (period === "year") {
    const y = today.slice(0, 4);
    const py = String(Number(y) - 1);
    return { start: `${y}-01-01`, end: `${y}-12-31`, prevStart: `${py}-01-01`, prevEnd: `${py}-12-31`, label: y, prevLabel: py };
  }
  const start = startOfMonth(today);
  const prev = addMonths(start, -1);
  return {
    start,
    end: endOfMonth(today),
    prevStart: prev,
    prevEnd: endOfMonth(prev),
    label: monthName(Number(today.slice(5, 7))),
    prevLabel: monthShortName(Number(prev.slice(5, 7))),
  };
}

export function inRange(d: string, start: string, end: string): boolean {
  return d >= start && d <= end;
}

export interface Totals {
  income: number;
  expense: number;
  net: number;
  count: number;
}

export function totals(txs: Transaction[], start?: string, end?: string): Totals {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const t of txs) {
    if (start && end && !inRange(t.transaction_date, start, end)) continue;
    count++;
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense, count };
}

/** Starting balance from onboarding plus every recorded income minus every expense. */
export function recordedBalance(startingBalance: number, txs: Transaction[]): number {
  const t = totals(txs);
  return startingBalance + t.net;
}

export interface SeriesPoint {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
}

/**
 * Cumulative net cash flow (income − expense) across the period, with the
 * previous period aligned by position for comparison. Points after today are null.
 */
export function cumulativeSeries(txs: Transaction[], period: Period, today: string): SeriesPoint[] {
  const r = periodRange(period, today);
  const netByDay = new Map<string, number>();
  for (const t of txs) {
    const v = t.type === "income" ? t.amount : -t.amount;
    netByDay.set(t.transaction_date, (netByDay.get(t.transaction_date) ?? 0) + v);
  }
  const sumRange = (a: string, b: string) => {
    let s = 0;
    for (const [d, v] of netByDay) if (d >= a && d <= b) s += v;
    return s;
  };

  const points: SeriesPoint[] = [];
  if (period === "year") {
    const y = Number(today.slice(0, 4));
    let cur = 0;
    let prev = 0;
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      const cs = `${y}-${mm}-01`;
      const ps = `${y - 1}-${mm}-01`;
      cur += sumRange(cs, endOfMonth(cs));
      prev += sumRange(ps, endOfMonth(ps));
      points.push({ key: cs, label: monthShortName(m), current: cs <= today ? cur : null, previous: prev });
    }
    return points;
  }

  const length = period === "week" ? 7 : daysInMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  const prevLength = period === "week" ? 7 : daysInMonth(Number(r.prevStart.slice(0, 4)), Number(r.prevStart.slice(5, 7)));
  let cur = 0;
  let prev = 0;
  for (let i = 0; i < length; i++) {
    const d = addDays(r.start, i);
    cur += netByDay.get(d) ?? 0;
    let previous: number | null = null;
    if (i < prevLength) {
      prev += netByDay.get(addDays(r.prevStart, i)) ?? 0;
      previous = prev;
    }
    points.push({ key: d, label: formatDayMonth(d), current: d <= today ? cur : null, previous });
  }
  return points;
}

export interface CategorySlice {
  name: string;
  amount: number;
  pct: number;
}

/** Spending per category within a range: the top `top` categories plus "Lainnya". */
export function categoryBreakdown(
  txs: Transaction[],
  categories: Category[],
  start: string,
  end: string,
  type: "expense" | "income" = "expense",
  top = 4,
): CategorySlice[] {
  const byCat = new Map<string, number>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type || !inRange(t.transaction_date, start, end)) continue;
    byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + t.amount);
    total += t.amount;
  }
  if (total === 0) return [];
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const sorted = [...byCat.entries()]
    .map(([id, amount]) => ({ name: names.get(id) ?? "Lainnya", amount }))
    .sort((a, b) => b.amount - a.amount);
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top).reduce((s, x) => s + x.amount, 0);
  const slices = rest > 0 ? [...head, { name: "Lainnya", amount: rest }] : head;
  // merge duplicate "Lainnya" entries
  const merged: { name: string; amount: number }[] = [];
  for (const s of slices) {
    const found = merged.find((m) => m.name === s.name);
    if (found) found.amount += s.amount;
    else merged.push({ ...s });
  }
  return merged.map((s) => ({ ...s, pct: (s.amount / total) * 100 }));
}

/** Rounds percentages so they add up to exactly 100 (largest remainder). */
export function roundedPercents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return floors;
}

export interface DayGroup {
  date: string;
  items: Transaction[];
  net: number;
}

/** Groups transactions by day, newest day first; items newest first. */
export function groupByDay(txs: Transaction[]): DayGroup[] {
  const map = new Map<string, Transaction[]>();
  for (const t of txs) {
    const list = map.get(t.transaction_date) ?? [];
    list.push(t);
    map.set(t.transaction_date, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      net: items.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0),
    }));
}

export function topCategoryNames(txs: Transaction[], categories: Category[], start: string, end: string, type: "income" | "expense", n = 2): string[] {
  return categoryBreakdown(txs, categories, start, end, type, n)
    .filter((s) => s.name !== "Lainnya" || n === 0)
    .slice(0, n)
    .map((s) => s.name);
}

/** Change of a value versus the previous period, as a whole percentage, or null when not comparable. */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
