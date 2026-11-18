"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { todayJakarta } from "@/lib/date";
import { AppError, type ErrorKind, toAppError } from "@/lib/errors";
import { createLocalAuth, createLocalStore } from "@/lib/store/local";
import { type AppData, type AuthClient, type DataStore, EMPTY_DATA, type Session, type SignUpExtras } from "@/lib/store/types";
import { SplashScreen } from "./brand";
import { ToastProvider, useToast } from "./toast";

type Status = "loading" | "signed_out" | "ready" | "error";

interface AppContextValue {
  status: Status;
  session: Session | null;
  data: AppData;
  loadError: string | null;
  /** Why the first load failed, to pick the right full-screen state. */
  loadErrorKind: ErrorKind | null;
  today: string;
  store: DataStore;
  /** False while the device has no connection (catalogue A3). */
  online: boolean;
  /** True when a save worked but refreshing the screen afterwards failed (C5b). */
  stale: boolean;
  /** True after a request came back with an expired session (B1). */
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
  /** For requests made outside mutate (e.g. the coach) that hit a 401. */
  notifySessionExpired: () => void;
  /**
   * Runs a write, then refreshes session data and cached queries.
   * The write's own error propagates to the form; a failed refresh after a
   * successful write does not (it shows the stale-data banner instead).
   */
  mutate: <T>(fn: (store: DataStore) => Promise<T>) => Promise<T>;
  refresh: () => Promise<void>;
  /** Retries everything after the stale-data banner or a reconnect. */
  retryAll: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, extras?: SignUpExtras) => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // no point retrying an expired session or while offline
        retry: (count, err) => count < 1 && !(err instanceof AppError && (err.kind === "session" || err.kind === "offline")),
      },
    },
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppState queryClient={queryClient}>
          <Splash />
          {children}
        </AppState>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** The splash stays until the account check finishes (at least SPLASH_MIN_MS after page start), then fades out once. */
const SPLASH_MIN_MS = 700;
const SPLASH_FADE_MS = 400;

function Splash() {
  const { status } = useApp();
  const [phase, setPhase] = useState<"show" | "leaving" | "gone">("show");

  useEffect(() => {
    if (status === "loading" || phase !== "show") return;
    const wait = Math.max(0, SPLASH_MIN_MS - performance.now());
    const t = window.setTimeout(() => setPhase("leaving"), wait);
    return () => window.clearTimeout(t);
  }, [status, phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const t = window.setTimeout(() => setPhase("gone"), SPLASH_FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  return phase === "gone" ? null : <SplashScreen leaving={phase === "leaving"} />;
}

/** Tracks the connection; calls onReconnect when it comes back after being lost. */
function useOnline(onReconnect: () => void): boolean {
  const [online, setOnline] = useState(true);
  const callback = useRef(onReconnect);
  useEffect(() => {
    callback.current = onReconnect;
  });
  useEffect(() => {
    let wasOnline = navigator.onLine;
    const update = () => {
      const now = navigator.onLine;
      setOnline(now);
      if (now && !wasOnline) callback.current();
      wasOnline = now;
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function AppState({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  const sessionRef = useRef<Session | null>(null);
  const [auth] = useState<AuthClient>(() => createLocalAuth());
  const [store] = useState<DataStore>(() => createLocalStore());
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorKind, setLoadErrorKind] = useState<ErrorKind | null>(null);
  const [today, setToday] = useState(() => todayJakarta());
  const [stale, setStale] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const toast = useToast();
  const statusRef = useRef<Status>("loading");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const loadSessionData = useCallback(async () => {
    const d = await store.load();
    setData(d);
  }, [store]);

  const refresh = useCallback(async () => {
    if (!sessionRef.current) return;
    try {
      await loadSessionData();
      setLoadError(null);
      setLoadErrorKind(null);
      setStatus("ready");
    } catch (e) {
      const err = toAppError(e);
      if (err.kind === "session") setSessionExpired(true);
      setLoadError(err.message);
      setLoadErrorKind(err.kind);
      setStatus("error");
    }
  }, [loadSessionData]);

  const applySession = useCallback(
    async (s: Session | null) => {
      const changed = sessionRef.current?.userId !== s?.userId;
      sessionRef.current = s;
      setSession(s);
      if (!s) {
        queryClient.clear();
        setData(EMPTY_DATA);
        setStale(false);
        setSessionExpired(false);
        setStatus("signed_out");
        return;
      }
      if (changed) {
        setStatus("loading");
        setSessionExpired(false);
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

  const retryAll = useCallback(async () => {
    setStale(false);
    try {
      if (sessionRef.current) await loadSessionData();
      await queryClient.refetchQueries({ type: "active" });
      if (queryClient.getQueryCache().getAll().some((q) => q.state.status === "error" && q.getObserversCount() > 0)) setStale(true);
    } catch {
      setStale(true);
    }
  }, [loadSessionData, queryClient]);

  // Coming back to the app (or tab), and every 30 s while it is on screen:
  // quietly reload, so new "Perlu dicek" items and changes from other
  // devices show up without navigating around. Errors stay silent here.
  useEffect(() => {
    let last = 0;
    const sync = () => {
      if (document.visibilityState !== "visible" || statusRef.current !== "ready" || !sessionRef.current) return;
      const t = Date.now();
      if (t - last < 10_000) return;
      last = t;
      loadSessionData().catch(() => undefined);
      void queryClient.invalidateQueries({ refetchType: "active" });
    };
    const onShow = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", sync);
    const timer = window.setInterval(sync, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", sync);
      window.clearInterval(timer);
    };
  }, [loadSessionData, queryClient]);

  // Back online: refresh what is on screen and say so once.
  const online = useOnline(() => {
    toast.info("Kembali online.");
    if (statusRef.current === "error") void refresh();
    else void retryAll();
  });

  const mutate = useCallback(
    async <T,>(fn: (s: DataStore) => Promise<T>) => {
      let result: T;
      try {
        result = await fn(store);
      } catch (e) {
        const err = toAppError(e);
        if (err.kind === "session") setSessionExpired(true);
        throw err;
      }
      try {
        await loadSessionData();
        await queryClient.invalidateQueries();
        setStale(false);
      } catch {
        setStale(true);
      }
      return result;
    },
    [store, loadSessionData, queryClient],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      session,
      data,
      loadError,
      loadErrorKind,
      today,
      store,
      online,
      stale,
      sessionExpired,
      dismissSessionExpired: () => setSessionExpired(false),
      notifySessionExpired: () => setSessionExpired(true),
      mutate,
      refresh,
      retryAll,
      signIn: (email, password) => auth.signIn(email, password),
      signUp: (email, password, extras) => auth.signUp(email, password, extras),
      signOut: async () => {
        await auth.signOut();
        await applySession(null);
      },
    }),
    [status, session, data, loadError, loadErrorKind, today, store, online, stale, sessionExpired, mutate, refresh, retryAll, auth, applySession],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
