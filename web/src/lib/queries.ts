"use client";

// Server-sized reads, cached with TanStack Query. Each one asks the database
// for exactly what a screen shows: totals from SQL functions, transactions one
// page at a time, a goal's history only when its page is open.
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AppError, MESSAGES, isOffline } from "./errors";
import { api } from "./store/local";
import { type Dashboard, type DashboardRaw, type MonthTotals, dashboardArgs, parseDashboard, parsePeriodTotals } from "./dashboard";
import type { Period } from "./finance";
import type { Contribution, Transaction, TxType } from "./types";

export const PAGE_SIZE = 30;

/** Root keys, used to refresh everything after a write. */
export const QK = {
  dashboard: ["dashboard"] as const,
  monthTotals: ["month-totals"] as const,
  transactions: ["transactions"] as const,
  contributions: ["contributions"] as const,
};

async function get<T>(path: string, params: Record<string, string | number | null | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
  try {
    return await api<T>(`${path}?${qs}`);
  } catch (e) {
    if (isOffline()) throw new AppError("offline", MESSAGES.offline);
    if (e instanceof AppError && e.kind === "session") throw e;
    throw new AppError("server", MESSAGES.load);
  }
}
const num = (v: unknown) => (v == null ? 0 : Number(v));

export function useDashboard(period: Period, today: string, enabled = true) {
  return useQuery<Dashboard>({
    queryKey: [...QK.dashboard, period, today],
    enabled,
    queryFn: async () => {
      const data = await get<DashboardRaw>("/api/dashboard", { ...dashboardArgs(period, today) });
      return parseDashboard(data);
    },
  });
}

export function useMonthTotals(from: string, to: string) {
  return useQuery<MonthTotals>({
    queryKey: [...QK.monthTotals, from, to],
    queryFn: async () => {
      const data = await get<Parameters<typeof parsePeriodTotals>[0]>("/api/period-totals", { from, to });
      return parsePeriodTotals(data);
    },
  });
}

export interface TxRow extends Transaction {
  /** Net of the whole day under the same filters, even when the day spans pages. */
  day_net: number;
}

interface Cursor {
  date: string;
  created: string;
  id: string;
}

export function useTransactionPages(from: string, to: string, type: TxType | null, query: string) {
  const q = query.trim();
  return useInfiniteQuery<TxRow[], Error, { pages: TxRow[][] }, readonly unknown[], Cursor | null>({
    queryKey: [...QK.transactions, from, to, type, q],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const data = await get<TxRow[]>("/api/transactions", {
        from,
        to,
        type,
        query: q || null,
        cursor_date: pageParam?.date,
        cursor_created: pageParam?.created,
        cursor_id: pageParam?.id,
        limit: PAGE_SIZE,
      });
      return ((data ?? []) as TxRow[]).map((t) => ({ ...t, amount: num(t.amount), day_net: num(t.day_net) }));
    },
    getNextPageParam: (last) => {
      if (last.length < PAGE_SIZE) return null;
      const t = last[last.length - 1];
      return { date: t.transaction_date, created: t.created_at, id: t.id };
    },
  });
}

/** A goal's deposit and withdrawal history, newest first (latest 200). */
export function useGoalContributions(goalId: string | undefined) {
  return useQuery<Contribution[]>({
    queryKey: [...QK.contributions, goalId],
    enabled: Boolean(goalId),
    queryFn: async () => {
      const data = await get<Contribution[]>(`/api/goals/${encodeURIComponent(goalId as string)}/contributions`, {});
      return (data ?? []).map((c) => ({ ...c, amount: num(c.amount) })) as Contribution[];
    },
  });
}

/** Three suggested questions for the Coach's empty state, written from the user's own figures. */
export function useCoachSuggestions(enabled: boolean) {
  return useQuery<string[]>({
    queryKey: ["coach-suggest"],
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => (await get<{ questions: string[] }>("/api/coach/suggest", {})).questions,
  });
}
