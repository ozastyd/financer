"use client";

import { Camera, House, ImageUp, List, Pencil, Plus, Sparkles, Target, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "./app-provider";
import { TransactionSheet } from "./transaction-sheet";
import { Spinner } from "./ui/controls";
import type { Transaction, TxType } from "@/lib/types";

interface ShellContextValue {
  openAddTx: (opts?: { type?: TxType; edit?: Transaction }) => void;
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
  { href: "/coach", label: "AI Coach", Icon: Sparkles },
] as const;

function PlusMenu({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" style={{ zIndex: 29 }} onClick={onClose} aria-hidden="true" />
      <div className="dial" role="menu" aria-label="Cara mencatat transaksi" id="plus-menu">
        <p className="s b" style={{ color: "#FFFFFF" }}>
          Catat transaksi lewat
        </p>
        <button ref={firstRef} type="button" role="menuitem" className="dial-item" onClick={onManual}>
          <span className="icb g">
            <Pencil size={20} aria-hidden="true" />
          </span>
          Input manual
        </button>
        <button type="button" role="menuitem" className="dial-item" disabled aria-disabled="true">
          <span className="icb">
            <Camera size={20} aria-hidden="true" />
          </span>
          <span className="sp" style={{ textAlign: "left" }}>
            Ambil foto
          </span>
          <span className="tag neu">segera hadir</span>
        </button>
        <button type="button" role="menuitem" className="dial-item" disabled aria-disabled="true">
          <span className="icb">
            <ImageUp size={20} aria-hidden="true" />
          </span>
          <span className="sp" style={{ textAlign: "left" }}>
            Unggah gambar
          </span>
          <span className="tag neu">segera hadir</span>
        </button>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status, data, loadError, refresh } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [plusOpen, setPlusOpen] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; type: TxType; edit?: Transaction }>({ open: false, type: "expense" });

  const needsOnboarding = status === "ready" && !data.financial?.onboarding_completed;

  useEffect(() => {
    if (status === "signed_out") router.replace("/masuk");
    else if (needsOnboarding) router.replace("/onboarding");
  }, [status, needsOnboarding, router]);

  const openAddTx = useCallback((opts?: { type?: TxType; edit?: Transaction }) => {
    setPlusOpen(false);
    setSheet({ open: true, type: opts?.edit?.type ?? opts?.type ?? "expense", edit: opts?.edit });
  }, []);

  const ctx = useMemo(() => ({ openAddTx }), [openAddTx]);

  if (status === "error") {
    return (
      <main className="scr safe" style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <p className="h2">Data belum bisa dimuat</p>
        <p className="s mut">{loadError}</p>
        <button className="btn sm" type="button" onClick={() => void refresh()}>
          Coba lagi
        </button>
      </main>
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
      {children}
      <div className="tab-spacer" aria-hidden="true" />
      {plusOpen && <PlusMenu onClose={() => setPlusOpen(false)} onManual={() => openAddTx()} />}
      <nav className="tab" aria-label="Navigasi utama">
        {TABS.map((t) => {
          if (!t) {
            return (
              <button
                key="plus"
                type="button"
                className={`plus${plusOpen ? " open" : ""}`}
                aria-label={plusOpen ? "Tutup menu" : "Tambah transaksi"}
                aria-expanded={plusOpen}
                aria-controls="plus-menu"
                onClick={() => setPlusOpen((o) => !o)}
              >
                {plusOpen ? <X size={26} strokeWidth={2.2} aria-hidden="true" /> : <Plus size={26} strokeWidth={2.2} aria-hidden="true" />}
              </button>
            );
          }
          const on = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined} onClick={() => setPlusOpen(false)}>
              <t.Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <TransactionSheet
        open={sheet.open}
        initialType={sheet.type}
        edit={sheet.edit}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
      />
    </ShellContext.Provider>
  );
}
