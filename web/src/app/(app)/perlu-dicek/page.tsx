"use client";

import { ArrowLeftRight, Check, ChevronLeft, CircleAlert, Copy, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { useToast } from "@/components/toast";
import { CategorySheet } from "@/components/transaction-sheet";
import { Spinner } from "@/components/ui/controls";
import { CategoryIcon } from "@/components/ui/icons";
import { relativeDayLabel } from "@/lib/date";
import { toAppError } from "@/lib/errors";
import { formatRupiah } from "@/lib/money";
import { SOURCES } from "@/lib/notifications/parse";
import { api } from "@/lib/store/local";

interface InboxItem {
  id: string;
  source: string;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  counterparty: string | null;
  category_hint: string | null;
  maybe_transfer: boolean;
  occurred_date: string;
  occurred_time: string | null;
  raw_text: string | null;
  suggested_category_id: string | null;
  similar: { description: string | null; category: string } | null;
}

const appName = (source: string) => SOURCES.find((s) => s.source === source)?.label ?? source;

/** Transactions read from bank and e-wallet notifications, waiting for a yes or no. */
export default function PerluDicekPage() {
  const { today, refresh } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<InboxItem[]>("/api/inbox"));
      setError(null);
    } catch (e) {
      setError(toAppError(e, "Gagal memuat. Coba lagi.").message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load
    void load();
    // Pulled down to refresh, coming back to the app, or every 30 s: look for new items.
    const again = () => document.visibilityState === "visible" && void load();
    window.addEventListener("financer:refresh", again);
    document.addEventListener("visibilitychange", again);
    const timer = window.setInterval(again, 30_000);
    return () => {
      window.removeEventListener("financer:refresh", again);
      document.removeEventListener("visibilitychange", again);
      window.clearInterval(timer);
    };
  }, [load]);

  const done = (id: string, message: string) => {
    setItems((list) => list?.filter((i) => i.id !== id) ?? null);
    toast.success(message);
    void refresh();
  };

  return (
    <main className="scr safe" style={{ gap: 14 }}>
      <div className="row">
        <Link className="ibtn" href="/beranda" aria-label="Kembali ke Beranda">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="h3 sp" style={{ textAlign: "center" }}>
          Perlu dicek
        </h1>
        <span style={{ width: 44 }} />
      </div>
      <p className="s mut pretty" style={{ marginTop: -4 }}>
        Dibaca dari notifikasi bank dan e-wallet di HP-mu. Cek kategorinya, lalu simpan. Yang bukan transaksimu, abaikan saja.
      </p>

      {error && (
        <div className="card" role="alert">
          <p className="s">{error}</p>
          <button className="btn ghost sm" type="button" style={{ alignSelf: "flex-start" }} onClick={() => void load()}>
            Coba lagi
          </button>
        </div>
      )}
      {!items && !error && <p className="s mut">Memuat…</p>}
      {items && items.length === 0 && (
        <div className="card" style={{ alignItems: "flex-start" }}>
          <span className="icb g" aria-hidden="true">
            <Check size={20} />
          </span>
          <p className="h3">Semua sudah dicek</p>
          <p className="s mut pretty">Transaksi baru dari notifikasi bank dan e-wallet akan muncul di sini.</p>
        </div>
      )}
      {items?.map((item) => (
        <InboxCard key={item.id} item={item} today={today} onDone={done} />
      ))}
    </main>
  );
}

function InboxCard({ item, today, onDone }: { item: InboxItem; today: string; onDone: (id: string, message: string) => void }) {
  const { data } = useApp();
  const toast = useToast();
  const [type, setType] = useState(item.type);
  const [categoryId, setCategoryId] = useState<string | null>(item.suggested_category_id);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const categories = data.categories.filter((c) => c.type === type);
  const category = categories.find((c) => c.id === categoryId);
  const income = type === "income";

  const act = async (action: "accept" | "dismiss") => {
    if (action === "accept" && !categoryId) return setPick(true);
    setBusy(action);
    try {
      await api(`/api/inbox/${item.id}`, "POST", action === "accept" ? { action, category_id: categoryId, type } : { action });
      onDone(item.id, action === "accept" ? `Tersimpan: ${formatRupiah(item.amount)}.` : "Diabaikan.");
    } catch (e) {
      const err = toAppError(e, "Gagal menyimpan. Coba lagi.");
      if (err.kind !== "session") toast.error(err.message);
      setBusy(null);
    }
  };

  return (
    <article className="inbox-card" aria-label={`${income ? "Uang masuk" : "Uang keluar"} ${formatRupiah(item.amount)} dari ${appName(item.source)}`}>
      <div className="row" style={{ gap: 8 }}>
        <span className="s b sp">{appName(item.source)}</span>
        <span className="s mut num">
          {relativeDayLabel(item.occurred_date, today)}
          {item.occurred_time ? `, ${item.occurred_time}` : ""}
        </span>
      </div>
      <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
        <p className={`h2 num${income ? " pos" : ""}`}>
          {income ? "+" : "−"}
          {formatRupiah(item.amount)}
        </p>
        <button
          type="button"
          className="chip sm-chip"
          aria-label={`Jenis: ${income ? "pemasukan" : "pengeluaran"}. Ketuk untuk menukar`}
          onClick={() => {
            const next = income ? "expense" : "income";
            setType(next);
            setCategoryId(data.categories.find((c) => c.type === next && c.icon === "lainnya")?.id ?? null);
          }}
        >
          <ArrowLeftRight size={14} aria-hidden="true" />
          {income ? "Pemasukan" : "Pengeluaran"}
        </button>
      </div>
      {item.description && <p className="t">{item.description}</p>}

      {item.maybe_transfer && (
        <p className="inbox-note">
          <CircleAlert size={16} aria-hidden="true" />
          Kalau ini pindah uang antar rekening atau e-wallet milikmu sendiri, abaikan supaya tidak terhitung dua kali.
        </p>
      )}
      {item.similar && (
        <p className="inbox-note">
          <Copy size={16} aria-hidden="true" />
          Mirip yang sudah tercatat hari itu: {item.similar.description || item.similar.category}.
        </p>
      )}

      <button type="button" className="when-field" style={{ textAlign: "left", font: "inherit", color: "var(--ink)", cursor: "pointer" }} onClick={() => setPick(true)}>
        <span className="icb" aria-hidden="true">
          <CategoryIcon icon={category?.icon ?? "lainnya"} size={20} />
        </span>
        <span className="col sp" style={{ gap: 0 }}>
          <span className="s mut">Kategori</span>
          <span className="t b">{category?.name ?? "Pilih kategori"}</span>
        </span>
        <span className="lnk">Ganti</span>
      </button>

      <div className="g2">
        <button className="btn ghost" type="button" disabled={busy !== null} onClick={() => act("dismiss")}>
          {busy === "dismiss" ? <Spinner label="Mengabaikan" /> : <><X size={18} aria-hidden="true" /> Abaikan</>}
        </button>
        <button className="btn" type="button" disabled={busy !== null} onClick={() => act("accept")}>
          {busy === "accept" ? <Spinner label="Menyimpan" /> : <><Check size={18} aria-hidden="true" /> Simpan</>}
        </button>
      </div>
      {item.raw_text && (
        <button type="button" className="lnk" style={{ alignSelf: "flex-start", minHeight: 36 }} aria-expanded={showRaw} onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? "Sembunyikan notifikasi asli" : "Lihat notifikasi asli"}
        </button>
      )}
      {showRaw && item.raw_text && <p className="s mut raw-note">{item.raw_text}</p>}

      <CategorySheet
        open={pick}
        onOpenChange={setPick}
        type={type}
        categories={categories}
        value={categoryId}
        onPick={(id) => {
          setCategoryId(id);
          setPick(false);
        }}
      />
    </article>
  );
}
