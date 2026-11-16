"use client";

import { Calendar, Delete, Trash2 } from "lucide-react";
import { useState } from "react";
import { useApp } from "./app-provider";
import { InlineError, useToast } from "./toast";
import { Chip, ErrorNote, Segmented, Spinner } from "./ui/controls";
import { toAppError } from "@/lib/errors";
import { Sheet } from "./ui/sheet";
import { relativeDayLabel } from "@/lib/date";
import { MAX_AMOUNT, formatRupiah } from "@/lib/money";
import { transactionInput, firstError } from "@/lib/schemas";
import type { Transaction, TxType } from "@/lib/types";

/** Values to start a new transaction with (e.g. what a scan managed to read). */
export interface TxPrefill {
  amount?: number;
  date?: string;
  note?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType: TxType;
  edit?: Transaction;
  prefill?: TxPrefill;
}

export function TransactionSheet({ open, onOpenChange, initialType, edit, prefill }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={edit ? "Ubah transaksi" : "Input manual"}>
      <TransactionForm initialType={initialType} edit={edit} prefill={prefill} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

function TransactionForm({ initialType, edit, prefill, onDone }: { initialType: TxType; edit?: Transaction; prefill?: TxPrefill; onDone: () => void }) {
  const { data, today, mutate, online } = useApp();
  const toast = useToast();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [type, setType] = useState<TxType>(edit?.type ?? initialType);
  const [amount, setAmount] = useState<string>(edit ? String(edit.amount) : prefill?.amount ? String(prefill.amount) : "");
  const [categoryId, setCategoryId] = useState<string | null>(edit?.category_id ?? null);
  const [date, setDate] = useState(edit?.transaction_date ?? prefill?.date ?? today);
  const [showDate, setShowDate] = useState(false);
  const [note, setNote] = useState(edit?.description ?? prefill?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categories = data.categories.filter((c) => c.type === type);
  const value = amount ? Number(amount) : 0;

  const press = (k: string) => {
    setError(null);
    setAmount((a) => {
      if (k === "del") return a.slice(0, -1);
      const next = (a + k).replace(/^0+/, "");
      return next && Number(next) <= MAX_AMOUNT ? next : a;
    });
  };

  const switchType = (t: TxType) => {
    setType(t);
    setCategoryId(null);
  };

  const submit = async () => {
    const parsed = transactionInput.safeParse({ type, category_id: categoryId ?? "", amount: value, description: note, transaction_date: date });
    if (!value) return setError("Masukkan jumlahnya dulu.");
    if (!categoryId) return setError("Pilih kategorinya dulu.");
    if (!parsed.success) return setError(firstError(parsed.error));
    setBusy(true);
    setError(null);
    setRequestError(null);
    try {
      await mutate((s) => (edit ? s.updateTransaction(edit.id, parsed.data) : s.addTransaction(parsed.data)));
      toast.success(edit ? "Perubahan tersimpan." : "Transaksi tersimpan.");
      onDone();
    } catch (e) {
      const err = toAppError(e);
      if (err.kind === "rejected") setError(err.message);
      else if (err.kind !== "session") setRequestError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!edit) return;
    setBusy(true);
    setRequestError(null);
    const { type: t, category_id, amount: a, description, transaction_date } = edit;
    try {
      await mutate((s) => s.deleteTransaction(edit.id));
      onDone();
      toast.success("Transaksi dihapus.", {
        label: "Urungkan",
        run: () => {
          mutate((s) => s.addTransaction({ type: t, category_id, amount: a, description: description ?? "", transaction_date }))
            .then(() => toast.success("Transaksi dikembalikan."))
            .catch((e) => toast.error(toAppError(e).message));
        },
      });
    } catch (e) {
      const err = toAppError(e);
      if (err.kind !== "session") setRequestError(err.kind === "rejected" ? err.message : "Gagal menghapus. Coba lagi.");
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
      <Segmented
        label="Jenis transaksi"
        value={type}
        onChange={switchType}
        options={[
          { value: "expense", label: "Pengeluaran" },
          { value: "income", label: "Pemasukan" },
        ]}
      />

      <div className="col" style={{ alignItems: "center", gap: 2, padding: "4px 0" }}>
        <label className="s mut" htmlFor="tx-amount">
          Jumlah
        </label>
        <input
          id="tx-amount"
          className="big num"
          inputMode="none"
          autoComplete="off"
          value={formatRupiah(value)}
          onChange={(e) => {
            // typing, pasting and deleting all edit the formatted text; keep only the digits
            setError(null);
            const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
            if (!digits || Number(digits) <= MAX_AMOUNT) setAmount(digits);
          }}
          style={{ fontSize: 40, textAlign: "center", border: 0, background: "transparent", color: value ? "var(--ink)" : "var(--mut)", width: "100%", padding: 0 }}
        />
      </div>

      <div className="col" style={{ gap: 8 }}>
        <p className="sec" id="tx-cat-label">
          Kategori
        </p>
        <div className="wrap" role="group" aria-labelledby="tx-cat-label">
          {categories.map((c) => (
            <Chip key={c.id} on={categoryId === c.id} check onClick={() => setCategoryId(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        {showDate ? (
          <input
            type="date"
            className="inp"
            aria-label="Tanggal transaksi"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            style={{ height: 44, width: 170, flex: "none", fontSize: 15 }}
          />
        ) : (
          <button type="button" className="chip" style={{ borderRadius: 14, flex: "none" }} onClick={() => setShowDate(true)} aria-label={`Tanggal: ${relativeDayLabel(date, today)}. Ubah tanggal`}>
            <Calendar size={16} aria-hidden="true" />
            {relativeDayLabel(date, today)}
          </button>
        )}
        <input className="inp" type="text" aria-label="Catatan (opsional)" placeholder="Catatan (opsional)" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} style={{ height: 44, fontSize: 15 }} />
      </div>

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

      <ErrorNote message={error} />
      <InlineError message={requestError} onRetry={requestError ? () => void submit() : undefined} />
      {!online && <p className="s mut" style={{ textAlign: "center" }}>Kamu sedang offline. Isianmu tetap di sini; simpan setelah online lagi.</p>}
      <button className="btn" type="submit" disabled={busy || !online}>
        {busy ? <Spinner label="Menyimpan" /> : edit ? "Simpan perubahan" : "Simpan"}
      </button>

      {edit &&
        (confirmDelete ? (
          <div className="card amb" style={{ gap: 10 }}>
            <p className="s b">Hapus transaksi ini? Tidak bisa dibatalkan.</p>
            <div className="g2">
              <button type="button" className="btn ghost sm" style={{ width: "100%" }} onClick={() => setConfirmDelete(false)}>
                Batal
              </button>
              <button type="button" className="btn danger sm" style={{ width: "100%" }} onClick={remove} disabled={busy}>
                Ya, hapus
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} aria-hidden="true" />
            Hapus transaksi
          </button>
        ))}
    </form>
  );
}
