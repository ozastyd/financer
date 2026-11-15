"use client";

import { AppError, MESSAGES, errorFromFetchFailure, errorFromResponse, isOffline } from "../errors";
import type { AppData, AuthClient, DataStore, Session } from "./types";

// Single-user build: all reads and writes go through the app's API routes,
// which read and write the server's SQLite database.

export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (isOffline()) throw new AppError("offline", MESSAGES.offline);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw errorFromFetchFailure();
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw errorFromResponse(res.status, json.error, res.headers.get("retry-after"));
  return json;
}

export function createLocalStore(): DataStore {
  return {
    async load(): Promise<AppData> {
      try {
        return await api<AppData>("/api/data");
      } catch (e) {
        if (e instanceof AppError && (e.kind === "offline" || e.kind === "session")) throw e;
        throw new AppError("server", MESSAGES.load);
      }
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

/** One owner who signs in with the app password; the session is an httpOnly cookie. */
const OWNER_SESSION: Session = { userId: "owner", email: "" };

export function createLocalAuth(): AuthClient {
  const listeners = new Set<(s: Session | null) => void>();
  const emit = (s: Session | null) => listeners.forEach((cb) => cb(s));
  return {
    async getSession() {
      try {
        const r = await api<{ signedIn: boolean }>("/api/session");
        return r.signedIn ? OWNER_SESSION : null;
      } catch {
        return null;
      }
    },
    async signIn(password) {
      await api("/api/login", "POST", { password });
      emit(OWNER_SESSION);
    },
    async createPassword(password) {
      await api("/api/setup", "POST", { password });
      emit(OWNER_SESSION);
    },
    async needsSetup() {
      const r = await api<{ needsSetup: boolean }>("/api/session");
      return r.needsSetup;
    },
    async signOut() {
      await api("/api/logout", "POST").catch(() => undefined);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
