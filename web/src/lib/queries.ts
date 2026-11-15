"use client";

// Server-sized reads, cached with TanStack Query. Each one asks the database
// for exactly what a screen shows: totals from SQL functions, transactions one
// page at a time, a goal's history only when its page is open.
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AppError, MESSAGES, isOffline } from "./errors";
import { type Dashboard, type DashboardRaw, type MonthTotals, dashboardArgs, parseDashboard, parsePeriodTotals } from "./dashboard";
import type { Period } from "./finance";
import { getBrowserSupabase } from "./supabase/client";
import type { Contribution, Transaction, TxType } from "./types";

export const PAGE_SIZE = 30;

/** Root keys, used to refresh everything after a write. */
export const QK = {
  dashboard: ["dashboard"] as const,
  monthTotals: ["month-totals"] as const,
  transactions: ["transactions"] as const,
  contributions: ["contributions"] as const,
};

function queryError(error: { message: string; status?: number }): AppError {
  if (isOffline()) return new AppError("offline", MESSAGES.offline);
  const expired = error.status === 401 || /jwt/i.test(error.message);
  return new AppError(expired ? "session" : "server", expired ? MESSAGES.session : MESSAGES.load);
}
const num = (v: unknown) => (v == null ? 0 : Number(v));

export function useDashboard(period: Period, today: string, enabled = true) {
  return useQuery<Dashboard>({
    queryKey: [...QK.dashboard, period, today],
    enabled,
    queryFn: async () => {
      const { data, error } = await getBrowserSupabase().rpc("dashboard", dashboardArgs(period, today));
      if (error) throw queryError(error);
      return parseDashboard(data as DashboardRaw);
    },
  });
}

export function useMonthTotals(from: string, to: string) {
  return useQuery<MonthTotals>({
    queryKey: [...QK.monthTotals, from, to],
    queryFn: async () => {
      const { data, error } = await getBrowserSupabase().rpc("period_totals", { p_from: from, p_to: to });
      if (error) throw queryError(error);
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
      const { data, error } = await getBrowserSupabase().rpc("transactions_page", {
        p_from: from,
        p_to: to,
        p_type: type,
        p_query: q || null,
        p_cursor_date: pageParam?.date ?? null,
        p_cursor_created: pageParam?.created ?? null,
        p_cursor_id: pageParam?.id ?? null,
        p_limit: PAGE_SIZE,
      });
      if (error) throw queryError(error);
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
      const { data, error } = await getBrowserSupabase()
        .from("goal_contributions")
        .select("id,goal_id,kind,amount,note,contribution_date,created_at")
        .eq("goal_id", goalId as string)
        .order("contribution_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw queryError(error);
      return (data ?? []).map((c) => ({ ...c, amount: num(c.amount) })) as Contribution[];
    },
  });
}
