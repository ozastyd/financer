"use client";

import { Calendar, Camera, Check, ChevronDown, Delete, FileUp, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./app-provider";
import { InlineError, useToast } from "./toast";
import { ErrorNote, Segmented, Spinner } from "./ui/controls";
import { CategoryIcon } from "./ui/icons";
import { Sheet } from "./ui/sheet";
import { addDays, formatLongDate, relativeDayLabel } from "@/lib/date";
import { toAppError } from "@/lib/errors";
import { MAX_AMOUNT, formatRupiah } from "@/lib/money";
import { firstError, transactionInput } from "@/lib/schemas";
import type { Category, Transaction, TxType } from "@/lib/types";

/** Values to start a new transaction with (e.g. what a scan managed to read). */
export interface TxPrefill {
  amount?: number;
  date?: string;
  note?: string;
  categoryId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType: TxType;
  edit?: Transaction;
  prefill?: TxPrefill;
  /** Opens the camera or file picker for scanning instead of typing. */
  onScan?: (source: "camera" | "upload") => void;
}

// ---------------------------------------------------------------------------
// Categories the user picks often come first (kept in this browser).
// ---------------------------------------------------------------------------

const RECENT_KEY = "financer:recent-categories";
const QUICK = 6;

function readRecent(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function rememberCategory(id: string) {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 12);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* optional */
  }
}

function orderByRecent(categories: Category[], recent: string[]): Category[] {
  const rank = new Map(recent.map((id, i) => [id, i]));
  return [...categories].sort((a, b) => (rank.get(a.id) ?? 99 + a.sort_order) - (rank.get(b.id) ?? 99 + b.sort_order));
}

// ---------------------------------------------------------------------------
// Sheet: new entry, or a transaction's details with "Ubah" / "Hapus".
// ---------------------------------------------------------------------------

export function TransactionSheet({ open, onOpenChange, initialType, edit, prefill, onScan }: Props) {
  const [mode, setMode] = useState<"detail" | "form">(edit ? "detail" : "form");
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // A new open starts from the right view.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the sheet opens
    setMode(edit ? "detail" : "form");
    setDirty(false);
    setConfirmDiscard(false);
  }, [open, edit]);

  const close = () => {
    setDirty(false);
    setConfirmDiscard(false);
    onOpenChange(false);
  };

  const title = mode === "detail" ? "Detail transaksi" : edit ? "Ubah transaksi" : "Catat transaksi";

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (o) return onOpenChange(true);
        // Tapping outside or pressing Esc must not lose what was typed.
        if (dirty && !confirmDiscard) return setConfirmDiscard(true);
        close();
      }}
      title={title}
    >
      {confirmDiscard && (
        <div className="discard pinned" role="alertdialog" aria-labelledby="discard-title">
          <p id="discard-title" className="t b">
            Buang isian ini?
          </p>
          <p className="s mut">Transaksi yang sedang kamu isi belum disimpan.</p>
          <div className="g2">
            <button type="button" className="btn ghost sm" autoFocus onClick={() => setConfirmDiscard(false)}>
              Lanjut isi
            </button>
            <button type="button" className="btn danger sm" onClick={close}>
              Buang
            </button>
          </div>
        </div>
      )}
      {mode === "detail" && edit ? (
        <TransactionDetail tx={edit} onEdit={() => setMode("form")} onDone={close} />
      ) : (
        <TransactionForm initialType={initialType} edit={edit} prefill={prefill} onDirty={setDirty} onDone={close} onScan={onScan} />
      )}
    </Sheet>
  );
}

function TransactionDetail({ tx, onEdit, onDone }: { tx: Transaction; onEdit: () => void; onDone: () => void }) {
  const { data, mutate } = useApp();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cat = data.categories.find((c) => c.id === tx.category_id);
  const income = tx.type === "income";

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { type, category_id, amount, description, transaction_date } = tx;
    try {
      await mutate((s) => s.deleteTransaction(tx.id));
      onDone();
      toast.success("Transaksi dihapus.", {
        label: "Urungkan",
        run: () => {
          mutate((s) => s.addTransaction({ type, category_id, amount, description: description ?? "", transaction_date }))
            .then(() => toast.success("Transaksi dikembalikan."))
            .catch((e) => toast.error(toAppError(e).message));
        },
      });
    } catch (e) {
      const err = toAppError(e);
      if (err.kind !== "session") setError(err.kind === "rejected" ? err.message : "Gagal menghapus. Coba lagi.");
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="tx-detail">
        <span className={`icb${income ? " g" : ""}`} style={{ width: 52, height: 52, borderRadius: 16 }}>
          <CategoryIcon icon={cat?.icon ?? "lainnya"} size={24} />
        </span>
        <p className={`num tx-detail-amt${income ? " pos" : ""}`}>
          {income ? "+" : "−"}
          {formatRupiah(tx.amount)}
        </p>
        <p className="t b">{tx.description || cat?.name || "Transaksi"}</p>
      </div>
      <dl className="tx-facts">
        <div>
          <dt>Jenis</dt>
          <dd>{income ? "Pemasukan" : "Pengeluaran"}</dd>
        </div>
        <div>
          <dt>Kategori</dt>
          <dd>{cat?.name ?? "Tanpa kategori"}</dd>
        </div>
        <div>
          <dt>Tanggal</dt>
          <dd>{formatLongDate(tx.transaction_date)}</dd>
        </div>
      </dl>
      <InlineError message={error} />
      {confirm ? (
        <div className="discard" role="alertdialog" aria-labelledby="del-title">
          <p id="del-title" className="t b">
            Hapus transaksi ini?
          </p>
          <p className="s mut">Masih bisa diurungkan sesaat setelah dihapus.</p>
          <div className="g2">
            <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>
              Batal
            </button>
            <button type="button" className="btn danger sm" onClick={remove} disabled={busy}>
              {busy ? <Spinner label="Menghapus" /> : "Ya, hapus"}
            </button>
          </div>
        </div>
      ) : (
        <div className="sheet-foot">
          <button type="button" className="btn" onClick={onEdit}>
            <Pencil size={18} aria-hidden="true" />
            Ubah
          </button>
          <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>
            <Trash2 size={18} aria-hidden="true" />
            Hapus
          </button>
        </div>
      )}
    </div>
  );
}

function TransactionForm({
  initialType,
  edit,
  prefill,
  onDirty,
  onDone,
  onScan,
}: {
  initialType: TxType;
  edit?: Transaction;
  prefill?: TxPrefill;
  onDirty: (d: boolean) => void;
  onDone: () => void;
  onScan?: (source: "camera" | "upload") => void;
}) {
  const { data, today, mutate, online } = useApp();
  const toast = useToast();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [type, setType] = useState<TxType>(edit?.type ?? initialType);
  const [amount, setAmount] = useState<string>(edit ? String(edit.amount) : prefill?.amount ? String(prefill.amount) : "");
  // When editing, the first key press replaces the amount instead of adding digits to it.
  const [fresh, setFresh] = useState(Boolean(edit));
  const [categoryId, setCategoryId] = useState<string | null>(edit?.category_id ?? prefill?.categoryId ?? null);
  const [date, setDate] = useState(edit?.transaction_date ?? prefill?.date ?? today);
  const [pickDate, setPickDate] = useState(false);
  const [note, setNote] = useState(edit?.description ?? prefill?.note ?? "");
  const [error, setError] = useState<{ field: "amount" | "category" | "other"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [recent] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecent()));

  const categories = useMemo(() => orderByRecent(data.categories.filter((c) => c.type === type), recent), [data.categories, type, recent]);
  const quick = categories.slice(0, QUICK);
  const chosenHidden = categoryId && !quick.some((c) => c.id === categoryId);
  const shown = showAll || chosenHidden ? categories : quick;
  const value = amount ? Number(amount) : 0;
  const yesterday = addDays(today, -1);

  const touch = () => onDirty(true);

  const press = (k: string) => {
    setError(null);
    touch();
    setAmount((a) => {
      const base = fresh ? "" : a;
      if (k === "del") return fresh ? "" : base.slice(0, -1);
      const next = (base + k).replace(/^0+/, "");
      return next && Number(next) <= MAX_AMOUNT ? next : base;
    });
    setFresh(false);
  };

  // Switching between expense and income keeps a same-named category (e.g. "Lainnya").
  const switchType = (t: TxType) => {
    const name = data.categories.find((c) => c.id === categoryId)?.name;
    setType(t);
    setCategoryId(data.categories.find((c) => c.type === t && c.name === name)?.id ?? null);
    touch();
  };

  const submit = async (again = false) => {
    if (!value) return setError({ field: "amount", message: "Masukkan jumlahnya dulu." });
    if (!categoryId) return setError({ field: "category", message: "Pilih kategorinya dulu." });
    const parsed = transactionInput.safeParse({ type, category_id: categoryId, amount: value, description: note, transaction_date: date });
    if (!parsed.success) return setError({ field: "other", message: firstError(parsed.error) });
    setBusy(true);
    setError(null);
    setRequestError(null);
    try {
      await mutate((s) => (edit ? s.updateTransaction(edit.id, parsed.data) : s.addTransaction(parsed.data)));
      rememberCategory(categoryId);
      if (edit) {
        const before = { type: edit.type, category_id: edit.category_id, amount: edit.amount, description: edit.description ?? "", transaction_date: edit.transaction_date };
        toast.success("Perubahan tersimpan.", {
          label: "Urungkan",
          run: () => {
            mutate((s) => s.updateTransaction(edit.id, before))
              .then(() => toast.success("Perubahan dibatalkan."))
              .catch((e) => toast.error(toAppError(e).message));
          },
        });
        onDone();
      } else if (again) {
        toast.success(`Tersimpan: ${formatRupiah(value)}. Lanjut catat yang berikutnya.`);
        setAmount("");
        setNote("");
        setCategoryId(null);
        onDirty(false);
      } else {
        toast.success("Transaksi tersimpan.");
        onDone();
      }
    } catch (e) {
      const err = toAppError(e);
      if (err.kind === "rejected") setError({ field: "other", message: err.message });
      else if (err.kind !== "session") setRequestError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {!edit && onScan && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="chip scan-shortcut" onClick={() => onScan("camera")}>
            <Camera size={16} aria-hidden="true" /> Scan struk
          </button>
          <button type="button" className="chip scan-shortcut" onClick={() => onScan("upload")}>
            <FileUp size={16} aria-hidden="true" /> Unggah file
          </button>
        </div>
      )}

      <Segmented
        label="Jenis transaksi"
        value={type}
        onChange={switchType}
        options={[
          { value: "expense", label: "Pengeluaran" },
          { value: "income", label: "Pemasukan" },
        ]}
      />

      <div className="col" style={{ alignItems: "center", gap: 2, padding: "2px 0" }}>
        <label className="s mut" htmlFor="tx-amount">
          Jumlah
        </label>
        <input
          id="tx-amount"
          className="big num tx-amount"
          inputMode="none"
          autoComplete="off"
          aria-invalid={error?.field === "amount"}
          aria-describedby={`tx-amount-hint${error?.field === "amount" ? " tx-error" : ""}`}
          value={formatRupiah(value)}
          onChange={(e) => {
            // typing, pasting and deleting all edit the formatted text; keep only the digits
            setError(null);
            touch();
            setFresh(false);
            const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
            if (!digits || Number(digits) <= MAX_AMOUNT) setAmount(digits);
          }}
          style={{ color: value ? "var(--ink)" : "var(--mut)" }}
        />
        <span id="tx-amount-hint" className="sr-only">
          Ketik dengan papan angka di bawah.
        </span>
        {edit && value !== edit.amount && <p className="s mut num">Sebelumnya {formatRupiah(edit.amount)}</p>}
      </div>

      <div className="col" style={{ gap: 8 }}>
        <p className="sec" id="tx-cat-label">
          Kategori
        </p>
        <div className="wrap" role="group" aria-labelledby="tx-cat-label" aria-describedby={error?.field === "category" ? "tx-error" : undefined}>
          {shown.map((c) => {
            const on = categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`chip${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => {
                  setCategoryId(c.id);
                  setError(null);
                  touch();
                }}
              >
                {on ? <Check size={16} aria-hidden="true" /> : <CategoryIcon icon={c.icon} size={16} />}
                {c.name}
              </button>
            );
          })}
          {!showAll && !chosenHidden && categories.length > QUICK && (
            <button type="button" className="chip" aria-expanded={false} onClick={() => setShowAll(true)}>
              Lainnya
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="wrap" role="group" aria-label="Tanggal">
        {[
          [today, "Hari ini"],
          [yesterday, "Kemarin"],
        ].map(([d, l]) => (
          <button
            key={d}
            type="button"
            className={`chip${date === d && !pickDate ? " on" : ""}`}
            aria-pressed={date === d && !pickDate}
            onClick={() => {
              setDate(d);
              setPickDate(false);
              touch();
            }}
          >
            {l}
          </button>
        ))}
        {pickDate || (date !== today && date !== yesterday) ? (
          <input
            type="date"
            className="inp"
            aria-label="Tanggal transaksi"
            value={date}
            max={today}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
              touch();
            }}
            style={{ height: 44, width: 168, flex: "none" }}
          />
        ) : (
          <button type="button" className="chip" onClick={() => setPickDate(true)} aria-label={`Tanggal lain. Sekarang: ${relativeDayLabel(date, today)}`}>
            <Calendar size={16} aria-hidden="true" />
            Tanggal lain
          </button>
        )}
      </div>

      <input
        className="inp"
        type="text"
        aria-label="Catatan (opsional)"
        placeholder="Catatan (opsional), misalnya: makan siang"
        maxLength={120}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          touch();
        }}
        style={{ height: 46 }}
      />

      <div className="g3" role="group" aria-label="Papan angka">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0"].map((k) => (
          <button key={k} type="button" className="key" onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button type="button" className="key" aria-label="Hapus angka" onClick={() => press("del")}>
          <Delete size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="sheet-foot">
        <div id="tx-error">
          <ErrorNote message={error?.message ?? null} />
        </div>
        <InlineError message={requestError} onRetry={requestError ? () => void submit() : undefined} />
        {!online && <p className="s mut" style={{ textAlign: "center" }}>Kamu sedang offline. Isianmu tetap di sini; simpan setelah online lagi.</p>}
        <button className="btn" type="submit" disabled={busy || !online}>
          {busy ? <Spinner label="Menyimpan" /> : edit ? "Simpan perubahan" : value ? `Simpan ${formatRupiah(value)}` : "Simpan"}
        </button>
        {!edit && (
          <button className="lnk sheet-foot-link" type="button" disabled={busy || !online} onClick={() => void submit(true)}>
            Simpan & tambah lagi
          </button>
        )}
      </div>
    </form>
  );
}
