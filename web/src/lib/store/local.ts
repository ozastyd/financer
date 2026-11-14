"use client";

import { balanceFromContributions, statusAfterBalance } from "../goals";
import { categoryError, contributionError } from "../rules";
import {
  contributionInput,
  firstError,
  goalInput,
  goalUpdate,
  onboardingInput,
  transactionInput,
  transactionUpdate,
} from "../schemas";
import { EMPTY_FINANCIAL_PROFILE, type Category, type TxType } from "../types";
import { type AppData, type AuthClient, type DataStore, EMPTY_DATA, type Session, StoreError } from "./types";

// Local stand-in used when Supabase is not configured. Data lives in this
// browser's localStorage only; the session is simulated (no email is sent).

const SESSION_KEY = "fo:local-session";
const dataKey = (uid: string) => `fo:local-data:${uid}`;

export const DEFAULT_CATEGORIES: [string, TxType, string][] = [
  ["Makan & minum", "expense", "makan"],
  ["Transport", "expense", "transport"],
  ["Belanja", "expense", "belanja"],
  ["Hiburan", "expense", "hiburan"],
  ["Langganan", "expense", "langganan"],
  ["Pendidikan", "expense", "pendidikan"],
  ["Tempat tinggal", "expense", "rumah"],
  ["Tagihan", "expense", "tagihan"],
  ["Kesehatan", "expense", "kesehatan"],
  ["Bayar utang", "expense", "utang"],
  ["Lainnya", "expense", "lainnya"],
  ["Gaji", "income", "gaji"],
  ["Freelance", "income", "freelance"],
  ["Usaha", "income", "usaha"],
  ["Uang saku", "income", "uang_saku"],
  ["Beasiswa", "income", "beasiswa"],
  ["Lainnya", "income", "lainnya"],
];

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new StoreError("Penyimpanan browser penuh atau diblokir.");
  }
}

export function createLocalStore(): DataStore {
  const userId = () => {
    const s = readJSON<Session>(SESSION_KEY);
    if (!s) throw new StoreError("Sesi berakhir. Silakan masuk lagi.");
    return s.userId;
  };
  const read = (): AppData => {
    const id = userId();
    const d = readJSON<AppData>(dataKey(id)) ?? { ...EMPTY_DATA };
    if (d.categories.length === 0) {
      d.categories = DEFAULT_CATEGORIES.map(([name, type, icon], i): Category => ({ id: uid(), name, type, icon, sort_order: i + 1 }));
      writeJSON(dataKey(id), d);
    }
    return d;
  };
  const write = (d: AppData) => writeJSON(dataKey(userId()), d);
  const parse = <T,>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: import("zod").ZodError } }, v: unknown): T => {
    const r = schema.safeParse(v);
    if (!r.success) throw new StoreError(firstError(r.error));
    return r.data;
  };
  const now = () => new Date().toISOString();

  return {
    async load() {
      return read();
    },
    async saveOnboarding(raw) {
      const input = parse(onboardingInput, raw);
      const d = read();
      if (input.profile) {
        d.userProfile = {
          display_name: input.profile.display_name,
          age_range: input.profile.age_range ?? null,
          occupation: input.profile.occupation ?? null,
          financial_experience: input.profile.financial_experience ?? null,
        };
      }
      const base = d.financial ?? { ...EMPTY_FINANCIAL_PROFILE };
      d.financial = {
        ...base,
        ...Object.fromEntries(Object.entries(input.financial ?? {}).map(([k, v]) => [k, v ?? null])),
        monthly_income: input.financial?.monthly_income ?? base.monthly_income,
        additional_income: input.financial?.additional_income ?? base.additional_income,
        current_savings: input.financial?.current_savings ?? base.current_savings,
        monthly_expenses: input.financial?.monthly_expenses ?? base.monthly_expenses,
        existing_debt: input.financial?.existing_debt ?? base.existing_debt,
        monthly_obligations: input.financial?.monthly_obligations ?? base.monthly_obligations,
        goal_choices: input.financial?.goal_choices ?? base.goal_choices,
        onboarding_step: Math.max(base.onboarding_completed ? 6 : 1, input.step),
        onboarding_completed: base.onboarding_completed || input.completed,
      };
      write(d);
    },
    async addTransaction(raw) {
      const input = parse(transactionInput, raw);
      const d = read();
      const err = categoryError(d.categories.find((c) => c.id === input.category_id), input.type);
      if (err) throw new StoreError(err);
      d.transactions.unshift({ id: uid(), ...input, created_at: now() });
      write(d);
    },
    async updateTransaction(id, raw) {
      const input = parse(transactionUpdate, raw);
      const d = read();
      const t = d.transactions.find((x) => x.id === id);
      if (!t) throw new StoreError("Transaksi tidak ditemukan.");
      const next = { ...t, ...input };
      const err = categoryError(d.categories.find((c) => c.id === next.category_id), next.type);
      if (err) throw new StoreError(err);
      Object.assign(t, next);
      write(d);
    },
    async deleteTransaction(id) {
      const d = read();
      d.transactions = d.transactions.filter((x) => x.id !== id);
      write(d);
    },
    async addGoal(raw) {
      const input = parse(goalInput, raw);
      const d = read();
      const id = uid();
      d.goals.push({ id, ...input, current_amount: 0, status: "active", paused_at: null, completed_at: null, created_at: now() });
      write(d);
      return id;
    },
    async updateGoal(id, raw) {
      const input = parse(goalUpdate, raw);
      const d = read();
      const g = d.goals.find((x) => x.id === id);
      if (!g) throw new StoreError("Tujuan tidak ditemukan.");
      if (input.status && g.status === "completed") throw new StoreError("Tujuan yang sudah tercapai tidak bisa dijeda.");
      Object.assign(g, input);
      if (input.status === "paused") g.paused_at = now();
      if (input.status === "active") g.paused_at = null;
      if (input.target_amount !== undefined) Object.assign(g, statusAfterBalance(g, g.current_amount));
      write(d);
    },
    async deleteGoal(id) {
      const d = read();
      d.goals = d.goals.filter((x) => x.id !== id);
      d.contributions = d.contributions.filter((c) => c.goal_id !== id);
      write(d);
    },
    async addContribution(goalId, raw) {
      const input = parse(contributionInput, raw);
      const d = read();
      const g = d.goals.find((x) => x.id === goalId);
      if (!g) throw new StoreError("Tujuan tidak ditemukan.");
      const err = contributionError(g, input);
      if (err) throw new StoreError(err);
      d.contributions.unshift({ id: uid(), goal_id: goalId, ...input, created_at: now() });
      const balance = balanceFromContributions(d.contributions.filter((c) => c.goal_id === goalId));
      g.current_amount = balance;
      Object.assign(g, statusAfterBalance(g, balance));
      write(d);
    },
  };
}

export function createLocalAuth(): AuthClient {
  const listeners = new Set<(s: Session | null) => void>();
  const emit = (s: Session | null) => listeners.forEach((l) => l(s));
  return {
    async getSession() {
      return readJSON<Session>(SESSION_KEY);
    },
    async signIn(email) {
      const existing = readJSON<Record<string, string>>("fo:local-users") ?? {};
      const key = email.trim().toLowerCase();
      const id = existing[key] ?? uid();
      existing[key] = id;
      writeJSON("fo:local-users", existing);
      const s = { userId: id, email: key };
      writeJSON(SESSION_KEY, s);
      emit(s);
      return { sent: false };
    },
    async signOut() {
      window.localStorage.removeItem(SESSION_KEY);
      emit(null);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
