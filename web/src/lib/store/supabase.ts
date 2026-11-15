"use client";

import { AppError, MESSAGES, errorFromFetchFailure, errorFromResponse, isOffline, secondsFromRateLimit } from "../errors";
import { getBrowserSupabase } from "../supabase/client";
import type { Category, FinancialProfile, Goal, UserProfile } from "../types";
import type { AppData, AuthClient, DataStore, Session } from "./types";

// Reads go straight to Postgres through RLS; writes go through the app's API
// routes so they are validated on the server before reaching the database.
// Larger reads (transactions, totals, goal history) live in src/lib/queries.ts.

async function api<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  if (isOffline()) throw new AppError("offline", MESSAGES.offline);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw errorFromFetchFailure();
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw errorFromResponse(res.status, json.error, res.headers.get("retry-after"));
  return json;
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

export function createSupabaseStore(): DataStore {
  const sb = getBrowserSupabase();

  async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) {
      if (isOffline()) throw new AppError("offline", MESSAGES.offline);
      const status = (error as { status?: number }).status;
      const expired = status === 401 || /jwt/i.test(error.message);
      throw new AppError(expired ? "session" : "server", expired ? MESSAGES.session : MESSAGES.load);
    }
    return data as T;
  }

  return {
    async load(): Promise<AppData> {
      let categories = await q<Category[]>(sb.from("categories").select("id,name,type,icon,sort_order").order("sort_order"));
      if (categories.length === 0) {
        // first sign-in: seed the default categories for this user
        const { error } = await sb.rpc("seed_default_categories");
        if (error) throw new AppError("server", "Gagal menyiapkan kategori. Coba muat ulang.");
        categories = await q<Category[]>(sb.from("categories").select("id,name,type,icon,sort_order").order("sort_order"));
      }
      const [up, fp, goals] = await Promise.all([
        q<UserProfile | null>(sb.from("user_profiles").select("display_name,age_range,occupation,financial_experience").maybeSingle()),
        q<FinancialProfile | null>(sb.from("financial_profiles").select("*").maybeSingle()),
        q<Goal[]>(sb.from("financial_goals").select("*").order("created_at")),
      ]);
      return {
        userProfile: up,
        financial: fp
          ? {
              ...fp,
              monthly_income: num(fp.monthly_income),
              additional_income: num(fp.additional_income),
              current_savings: num(fp.current_savings),
              monthly_expenses: num(fp.monthly_expenses),
              existing_debt: num(fp.existing_debt),
              monthly_obligations: num(fp.monthly_obligations),
            }
          : null,
        categories,
        goals: goals.map((g) => ({
          ...g,
          target_amount: num(g.target_amount),
          current_amount: num(g.current_amount),
          monthly_plan: g.monthly_plan == null ? null : num(g.monthly_plan),
        })),
      };
    },
    async saveOnboarding(input) {
      await api("/api/onboarding", "POST", input);
    },
    async addTransaction(input) {
      await api("/api/transactions", "POST", input);
    },
    async updateTransaction(id, input) {
      await api(`/api/transactions/${encodeURIComponent(id)}`, "PATCH", input);
    },
    async deleteTransaction(id) {
      await api(`/api/transactions/${encodeURIComponent(id)}`, "DELETE");
    },
    async addGoal(input) {
      const r = await api<{ id: string }>("/api/goals", "POST", input);
      return r.id;
    },
    async updateGoal(id, input) {
      await api(`/api/goals/${encodeURIComponent(id)}`, "PATCH", input);
    },
    async deleteGoal(id) {
      await api(`/api/goals/${encodeURIComponent(id)}`, "DELETE");
    },
    async addContribution(goalId, input) {
      await api(`/api/goals/${encodeURIComponent(goalId)}/contributions`, "POST", input);
    },
  };
}

export function createSupabaseAuth(): AuthClient {
  const sb = getBrowserSupabase();
  const toSession = (u: { id: string; email?: string } | null | undefined): Session | null =>
    u ? { userId: u.id, email: u.email ?? "" } : null;
  return {
    async getSession() {
      const { data } = await sb.auth.getUser();
      return toSession(data.user);
    },
    async signIn(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
      });
      if (error) {
        if (isOffline()) throw new AppError("offline", "Kamu sedang offline. Sambungkan internet dulu untuk menerima tautan.");
        const wait = secondsFromRateLimit(error.message);
        if (wait !== null || /rate|seconds|too many/i.test(error.message) || error.status === 429) {
          throw new AppError("limit", "Terlalu sering meminta tautan.", wait ?? 60);
        }
        throw new AppError("server", "Gagal mengirim tautan masuk. Periksa emailmu lalu coba lagi.");
      }
      return { sent: true };
    },
    async signOut() {
      await sb.auth.signOut();
    },
    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toSession(s?.user)));
      return () => data.subscription.unsubscribe();
    },
  };
}
