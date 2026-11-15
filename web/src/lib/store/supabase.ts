"use client";

import { getBrowserSupabase } from "../supabase/client";
import type { Category, FinancialProfile, Goal, UserProfile } from "../types";
import { type AppData, type AuthClient, type DataStore, type Session, StoreError } from "./types";

// Reads go straight to Postgres through RLS; writes go through the app's API
// routes so they are validated on the server before reaching the database.
// Larger reads (transactions, totals, goal history) live in src/lib/queries.ts.

async function api<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new StoreError("Tidak ada koneksi. Coba lagi.");
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new StoreError(json.error ?? "Gagal menyimpan. Coba lagi.");
  return json;
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

export function createSupabaseStore(): DataStore {
  const sb = getBrowserSupabase();

  async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new StoreError("Gagal memuat data. Coba muat ulang.");
    return data as T;
  }

  return {
    async load(): Promise<AppData> {
      let categories = await q<Category[]>(sb.from("categories").select("id,name,type,icon,sort_order").order("sort_order"));
      if (categories.length === 0) {
        // first sign-in: seed the default categories for this user
        const { error } = await sb.rpc("seed_default_categories");
        if (error) throw new StoreError("Gagal menyiapkan kategori.");
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
        const msg = /rate|seconds/i.test(error.message)
          ? "Terlalu sering meminta tautan. Tunggu sebentar lalu coba lagi."
          : "Gagal mengirim tautan masuk. Periksa emailmu lalu coba lagi.";
        throw new StoreError(msg);
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
