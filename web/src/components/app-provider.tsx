"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { todayJakarta } from "@/lib/date";
import { createSupabaseAuth, createSupabaseStore } from "@/lib/store/supabase";
import { type AppData, type AuthClient, type DataStore, EMPTY_DATA, type Session } from "@/lib/store/types";

type Status = "loading" | "signed_out" | "ready" | "error";

interface AppContextValue {
  status: Status;
  session: Session | null;
  data: AppData;
  loadError: string | null;
  today: string;
  store: DataStore;
  /** Runs a write, then refreshes session data and every cached query. Errors propagate to the caller's form. */
  mutate: <T>(fn: (store: DataStore) => Promise<T>) => Promise<T>;
  refresh: () => Promise<void>;
  signIn: (email: string) => Promise<{ sent: boolean }>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    },
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AppState queryClient={queryClient}>{children}</AppState>
    </QueryClientProvider>
  );
}

function AppState({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  const sessionRef = useRef<Session | null>(null);
  const [auth] = useState<AuthClient>(() => createSupabaseAuth());
  const [store] = useState<DataStore>(() => createSupabaseStore());
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [today, setToday] = useState(() => todayJakarta());

  const refresh = useCallback(async () => {
    if (!sessionRef.current) return;
    try {
      const d = await store.load();
      setData(d);
      setLoadError(null);
      setStatus("ready");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat data.");
      setStatus("error");
    }
  }, [store]);

  const applySession = useCallback(
    async (s: Session | null) => {
      const changed = sessionRef.current?.userId !== s?.userId;
      sessionRef.current = s;
      setSession(s);
      if (!s) {
        queryClient.clear();
        setData(EMPTY_DATA);
        setStatus("signed_out");
        return;
      }
      if (changed) {
        setStatus("loading");
        await refresh();
      }
    },
    [refresh, queryClient],
  );

  useEffect(() => {
    let alive = true;
    auth.getSession().then((s) => {
      if (alive) void applySession(s);
    });
    const off = auth.onChange((s) => void applySession(s));
    const timer = window.setInterval(() => setToday(todayJakarta()), 60_000);
    return () => {
      alive = false;
      off();
      window.clearInterval(timer);
    };
  }, [auth, applySession]);

  const mutate = useCallback(
    async <T,>(fn: (s: DataStore) => Promise<T>) => {
      const result = await fn(store);
      await Promise.all([refresh(), queryClient.invalidateQueries()]);
      return result;
    },
    [store, refresh, queryClient],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      session,
      data,
      loadError,
      today,
      store,
      mutate,
      refresh,
      signIn: (email) => auth.signIn(email),
      signOut: async () => {
        await auth.signOut();
        await applySession(null);
      },
    }),
    [status, session, data, loadError, today, store, mutate, refresh, auth, applySession],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
