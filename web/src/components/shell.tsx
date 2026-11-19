"use client";

import { House, List, LockKeyhole, Plus, RotateCcw, Sparkles, Target, TriangleAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "./app-provider";
import { ServiceDownState } from "./error-states";
import { InlineError } from "./toast";
import { TransactionSheet, type TxPrefill } from "./transaction-sheet";
import { useKeyboardClass } from "@/lib/keyboard";
import { newChat, queueAsk, selectAccount, useCoachChat } from "@/lib/coach-chat";
import { CoachPanel } from "./coach-panel";
import { PullToRefresh } from "./pull-to-refresh";
import { setPendingScan } from "@/lib/scan-client";
import { Spinner } from "./ui/controls";
import { Sheet } from "./ui/sheet";
import { formatCountdown, toAppError } from "@/lib/errors";
import type { Transaction, TxType } from "@/lib/types";

interface ShellContextValue {
  openAddTx: (opts?: { type?: TxType; edit?: Transaction; prefill?: TxPrefill }) => void;
  /** Opens the camera or the file picker, then the scan screen with the chosen file. */
  startScan: (source: "camera" | "upload") => void;
  /** Slides the AI Coach up over the current page; with a question, asks it right away. */
  openCoach: (question?: string) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside AppShell");
  return ctx;
}

const TABS = [
  { href: "/beranda", label: "Beranda", Icon: House },
  { href: "/transaksi", label: "Transaksi", Icon: List },
  null,
  { href: "/tujuan", label: "Tujuan", Icon: Target },
  { href: "/profil", label: "Profil", Icon: null },
] as const;


/** A3 offline and C5b/A2b stale-data banners, at the top of every app screen. */
function StatusBanner() {
  const { online, stale, retryAll } = useApp();
  const [busy, setBusy] = useState(false);
  if (!online) {
    return (
      <p className="banner off" role="status">
        <WifiOff size={16} aria-hidden="true" />
        <span>Kamu sedang offline. Perubahan belum bisa disimpan.</span>
      </p>
    );
  }
  if (!stale) return null;
  return (
    <p className="banner warn" role="status">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>Sebagian data belum bisa dimuat. Yang tampil mungkin belum terbaru.</span>
      <button
        type="button"
        className="act"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await retryAll();
          setBusy(false);
        }}
      >
        {busy ? "Memuat…" : "Coba lagi"}
      </button>
    </p>
  );
}

/** B1: the session expired. Keeps whatever is on screen and asks for the password again. */
function SessionExpiredSheet() {
  const { sessionExpired, dismissSessionExpired, signIn, session } = useApp();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(session?.email ?? "", password);
      setPassword("");
      dismissSessionExpired();
    } catch (e) {
      const err = toAppError(e);
      if (err.kind === "limit" && err.retryAfter) setWait(err.retryAfter);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={sessionExpired}
      onOpenChange={(open) => {
        if (!open) {
          dismissSessionExpired();
          setError(null);
        }
      }}
      title="Sesi kamu berakhir"
    >
      <span className="icb bl" style={{ width: 56, height: 56, borderRadius: 18 }}>
        <LockKeyhole size={24} aria-hidden="true" />
      </span>
      <p className="t mut">Masukkan kata sandi untuk {session?.email || "akunmu"}. Isian yang belum disimpan tetap ada di layar ini.</p>
      <form
        className="col"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (password && !busy && wait <= 0) void submit();
        }}
      >
        <input
          className="inp"
          type="password"
          autoComplete="current-password"
          placeholder="Kata sandi"
          aria-label="Kata sandi"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <InlineError message={error && wait > 0 ? `${error} Coba lagi dalam ${formatCountdown(wait)}.` : error} />
        <button className="btn" type="submit" style={{ borderRadius: 999 }} disabled={!password || busy || wait > 0}>
          {busy ? <Spinner label="Masuk" /> : wait > 0 ? `Masuk · ${formatCountdown(wait)}` : "Masuk"}
        </button>
      </form>
      <button className="lnk" type="button" style={{ alignSelf: "center", color: "var(--mut)" }} onClick={dismissSessionExpired}>
        Nanti saja
      </button>
    </Sheet>
  );
}

/** Pages with the floating "Tanya Coach" button. */
const COACH_PAGES = ["/beranda", "/transaksi", "/tujuan"];

/**
 * "Tanya Coach": floats above the tab bar on the main pages. Scrolling down
 * shrinks it to its icon so it doesn't cover the cards; scrolling up brings
 * the label back. A dot shows while an answer is still being written.
 */
function CoachButton({ onOpen }: { onOpen: () => void }) {
  const { loading } = useCoachChat();
  const [mini, setMini] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setMini(y > last && y > 80);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button type="button" className={`coach-fab${mini ? " mini" : ""}`} aria-label={loading ? "Tanya Coach, sedang menjawab" : "Tanya Coach"} onClick={onOpen}>
      <Sparkles size={20} strokeWidth={2} aria-hidden="true" />
      <span className="coach-fab-label" aria-hidden="true">
        Tanya Coach
      </span>
      {loading && <span className="coach-fab-dot" aria-hidden="true" />}
    </button>
  );
}

/** Pages that refresh when pulled down from the top. */
const PULL_PAGES = ["/beranda", "/transaksi", "/tujuan", "/perlu-dicek"];

export function AppShell({ children }: { children: ReactNode }) {
  const { status, data, loadErrorKind, refresh, retryAll, online, session } = useApp();
  const [coachOpen, setCoachOpen] = useState(false);
  const coach = useCoachChat();
  const [retrying, setRetrying] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [sheet, setSheet] = useState<{ open: boolean; type: TxType; edit?: Transaction; prefill?: TxPrefill }>({ open: false, type: "expense" });
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);

  const needsOnboarding = status === "ready" && !data.financial?.onboarding_completed;
  // Scanning is a focused task: no tab bar or "+" that could start another scan over the one being reviewed.
  const focusTask = pathname === "/scan";
  // The tab bar steps aside while the on-screen keyboard is open.
  useKeyboardClass();
  // The conversation belongs to the signed-in account.
  useEffect(() => selectAccount(session?.userId), [session?.userId]);

  useEffect(() => {
    if (status === "signed_out") router.replace("/masuk?mode=masuk");
    else if (needsOnboarding) router.replace("/onboarding");
  }, [status, needsOnboarding, router]);

  const openAddTx = useCallback((opts?: { type?: TxType; edit?: Transaction; prefill?: TxPrefill }) => {
    setSheet({ open: true, type: opts?.edit?.type ?? opts?.type ?? "expense", edit: opts?.edit, prefill: opts?.prefill });
  }, []);

  const startScan = useCallback((source: "camera" | "upload") => {
    (source === "camera" ? cameraInput : uploadInput).current?.click();
  }, []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingScan(file);
    if (pathname === "/scan") window.dispatchEvent(new Event("financer:scan"));
    else router.push("/scan");
  };

  const openCoach = useCallback((question?: string) => {
    if (question) queueAsk(question);
    setCoachOpen(true);
  }, []);

  // Old links to /coach (bookmarks, the Android app) land on Beranda with the Coach open.
  useEffect(() => {
    if (pathname === "/coach") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to arriving at the old address
      setCoachOpen(true);
      router.replace("/beranda");
    }
  }, [pathname, router]);

  const name = data.userProfile?.display_name ?? session?.email.split("@")[0] ?? "";
  const initial = (name || "?").charAt(0).toUpperCase();

  const ctx = useMemo(() => ({ openAddTx, startScan, openCoach }), [openAddTx, startScan, openCoach]);

  if (status === "error" && loadErrorKind !== "session") {
    return (
      <ServiceDownState
        offline={!online || loadErrorKind === "offline"}
        busy={retrying}
        onRetry={async () => {
          setRetrying(true);
          await refresh();
          setRetrying(false);
        }}
      />
    );
  }

  if (status === "error") {
    return (
      <>
        <main className="scr safe" style={{ justifyContent: "center", alignItems: "center" }}>
          <p className="t mut">Sesi kamu berakhir.</p>
        </main>
        <SessionExpiredSheet />
      </>
    );
  }

  if (status !== "ready" || needsOnboarding) {
    return (
      <main className="scr safe" style={{ justifyContent: "center", alignItems: "center" }}>
        <Spinner label="Memuat data" />
      </main>
    );
  }

  return (
    <ShellContext.Provider value={ctx}>
      {/* In the app, pages are drawn under the status bar: keep scrolled content from showing behind the clock. */}
      <div className="status-cover" aria-hidden="true" />
      <StatusBanner />
      <PullToRefresh enabled={PULL_PAGES.includes(pathname)} onRefresh={retryAll} />
      {children}
      {!focusTask && <div className={COACH_PAGES.includes(pathname) ? "tab-spacer with-coach" : "tab-spacer"} aria-hidden="true" />}
      {/* Camera opens the back camera on phones; upload also takes bank-statement PDFs. */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={uploadInput} type="file" accept="image/*,application/pdf" hidden onChange={onFile} />
      <nav className="tab" aria-label="Navigasi utama" hidden={focusTask}>
        {TABS.map((t) => {
          if (!t) {
            return (
              <button
                key="plus"
                type="button"
                className="plus"
                aria-label={!online ? "Tambah transaksi, tidak tersedia saat offline" : "Tambah transaksi"}
                disabled={!online}
                style={!online ? { background: "var(--ctl)", cursor: "not-allowed" } : undefined}
                onClick={() => openAddTx()}
              >
                <Plus size={26} strokeWidth={2.2} aria-hidden="true" />
              </button>
            );
          }
          const on = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
              {t.Icon ? (
                <t.Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                // Profil shows the user's own avatar (their initial).
                <span className="tab-ava" aria-hidden="true">
                  {initial}
                </span>
              )}
              {t.label}
            </Link>
          );
        })}
      </nav>
      {COACH_PAGES.includes(pathname) && !coachOpen && <CoachButton onOpen={() => openCoach()} />}
      <Sheet
        open={coachOpen}
        onOpenChange={setCoachOpen}
        title="AI Coach"
        subtitle="Jawab pakai angkamu sendiri"
        className="tall coach-sheet"
        action={
          coach.messages.length > 0 && !coach.loading ? (
            <button className="btn ghost sm coach-new" type="button" aria-label="Mulai obrolan baru" onClick={newChat}>
              <RotateCcw size={16} aria-hidden="true" />
              Baru
            </button>
          ) : null
        }
      >
        <CoachPanel
          onAddTx={() => {
            setCoachOpen(false);
            openAddTx();
          }}
        />
      </Sheet>
      <TransactionSheet
        open={sheet.open}
        initialType={sheet.type}
        edit={sheet.edit}
        prefill={sheet.prefill}
        onScan={(source) => {
          setSheet((s) => ({ ...s, open: false }));
          startScan(source);
        }}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
      />
      <SessionExpiredSheet />
    </ShellContext.Provider>
  );
}
