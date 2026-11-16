"use client";

import { AlertTriangle, Camera, Check, ChevronLeft, CircleCheck, FileLock2, ImageUp, Lightbulb, Loader2, ScanLine, Sparkles, Split, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { useShell } from "@/components/shell";
import { useToast } from "@/components/toast";
import { AmountInput, ErrorNote, Field, Spinner } from "@/components/ui/controls";
import { CategoryIcon } from "@/components/ui/icons";
import { formatDayMonth, isValidDate } from "@/lib/date";
import { toAppError } from "@/lib/errors";
import { formatRupiah } from "@/lib/money";
import { type ScanResult, ScanFailure, type ScanTx, saveScanned, scanFile, takePendingScan } from "@/lib/scan-client";
import type { TransactionInput } from "@/lib/schemas";
import type { Category } from "@/lib/types";

type Phase =
  | { name: "reading"; step: 1 | 2 | 3 }
  | { name: "password"; wrong: boolean }
  | { name: "receipt" }
  | { name: "split" }
  | { name: "statement" }
  | { name: "fail"; message: string; total: number | null };

const sumOf = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);

export default function ScanPage() {
  const { data, today, mutate } = useApp();
  const { openAddTx, startScan } = useShell();
  const toast = useToast();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "reading", step: 1 });
  const [result, setResult] = useState<ScanResult | null>(null);
  const [password, setPassword] = useState("");
  const abort = useRef<AbortController | null>(null);

  // receipt review
  const [total, setTotal] = useState<number | null>(null);
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState<string>("");
  const [itemCats, setItemCats] = useState<string[]>([]);
  // statement review
  const [rows, setRows] = useState<(ScanTx & { keep: boolean })[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const expenseCats = useMemo(() => data.categories.filter((c) => c.type === "expense"), [data.categories]);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const run = useCallback(
    async (f: File, pw?: string) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setPhase({ name: "reading", step: 2 });
      try {
        const r = await scanFile(f, pw, ctrl.signal);
        setPhase({ name: "reading", step: 3 });
        await new Promise((x) => setTimeout(x, 450));
        if (ctrl.signal.aborted) return;
        setResult(r);
        if (r.kind === "receipt" && (r.total || r.items.length)) {
          setTotal(r.total ?? Math.max(0, sumOf(r.items)) ?? null);
          setMerchant(r.merchant ?? "");
          setDate(r.date && isValidDate(r.date) && r.date <= today ? r.date : today);
          setCategoryId(r.category_id ?? expenseCats[0]?.id ?? "");
          setItemCats(r.items.map((i) => i.category_id));
          setPhase({ name: "receipt" });
        } else if (r.transactions.length) {
          setRows(r.transactions.map((t) => ({ ...t, date: t.date && isValidDate(t.date) && t.date <= today ? t.date : null, keep: !t.duplicate })));
          setPhase({ name: "statement" });
        } else {
          setPhase({ name: "fail", message: "Struknya belum terbaca", total: r.total });
        }
      } catch (e) {
        if (ctrl.signal.aborted) return;
        if (e instanceof ScanFailure && e.code === "password") {
          setPhase({ name: "password", wrong: Boolean(pw) });
          return;
        }
        if (e instanceof ScanFailure && e.code === "session") {
          setPhase({ name: "fail", message: e.message, total: null });
          return;
        }
        const msg = e instanceof ScanFailure ? (e.code === "busy" || e.code === "limit" ? `${e.message}${e.retryAfter ? ` Coba lagi dalam ${e.retryAfter} detik.` : ""}` : e.message) : "Gagal membaca file. Coba lagi.";
        setPhase({ name: "fail", message: msg, total: null });
      }
    },
    [today, expenseCats],
  );

  // Latest `run` without re-running the mount effect when data refreshes (e.g. after saving).
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  // Pick up the file chosen in the "+" menu once on arrival, and again when a
  // new photo is taken from this screen ("Foto ulang").
  useEffect(() => {
    const pick = () => {
      const f = takePendingScan();
      if (!f) return false;
      setFile(f);
      setResult(null);
      setPassword("");
      setSaveError(null);
      void runRef.current(f);
      return true;
    };
    if (!pick()) router.replace("/beranda");
    const onNew = () => void pick();
    window.addEventListener("financer:scan", onNew);
    return () => {
      window.removeEventListener("financer:scan", onNew);
      abort.current?.abort();
    };
  }, [router]);

  const manual = (prefill?: { amount?: number; date?: string; note?: string }) => {
    abort.current?.abort();
    router.replace("/beranda");
    openAddTx({ type: "expense", prefill });
  };

  const save = async (items: TransactionInput[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const n = await mutate(() => saveScanned(items));
      toast.success(n === 1 ? "Transaksi tersimpan." : `${n} transaksi tersimpan.`);
      router.replace("/transaksi");
    } catch (e) {
      const err = toAppError(e);
      if (err.kind !== "session") setSaveError(err.message);
      setSaving(false);
    }
  };

  const isPdf = result?.source === "pdf" || Boolean(file && /pdf/i.test(file.type || file.name));
  const title =
    phase.name === "receipt" ? "Hasil scan struk" : phase.name === "split" ? "Pisah transaksi" : phase.name === "statement" ? "Hasil baca mutasi" : phase.name === "password" ? "PDF terkunci" : phase.name === "fail" ? "Scan" : isPdf ? "Membaca dokumen" : "Membaca struk";

  return (
    <main className="scr safe" style={{ gap: 16, paddingBottom: 28 }}>
      <div className="row">
        <button
          type="button"
          className="ibtn"
          aria-label="Kembali"
          onClick={() => (phase.name === "split" ? setPhase({ name: "receipt" }) : (abort.current?.abort(), router.replace("/beranda")))}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <p className="t b sp" style={{ textAlign: "center", marginRight: 44 }}>
          {title}
        </p>
      </div>

      {phase.name === "reading" && <Reading step={phase.step} pdf={isPdf} onCancel={() => manual()} />}

      {phase.name === "password" && file && (
        <form
          className="col"
          style={{ gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (password) void run(file, password);
          }}
        >
          <div className="state" style={{ alignItems: "center", textAlign: "center", gap: 10 }}>
            <span className="icb am" style={{ width: 64, height: 64, borderRadius: 20 }}>
              <FileLock2 size={28} aria-hidden="true" />
            </span>
            <h1 className="h2">Rekening koran ini dikunci</h1>
            <p className="t mut">Banyak bank mengunci e-statement dengan kata sandi, misalnya tanggal lahir. Kata sandi hanya dipakai untuk membuka file ini dan tidak disimpan.</p>
          </div>
          <Field label="Kata sandi PDF" htmlFor="pdf-pw" error={phase.wrong ? "Kata sandi salah. Coba lagi." : undefined}>
            <input id="pdf-pw" className="inp" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <button className="btn" type="submit" disabled={!password}>
            Buka PDF
          </button>
          <button className="lnk" type="button" style={{ justifyContent: "center", color: "var(--mut)" }} onClick={() => startScan("upload")}>
            Pilih file lain
          </button>
        </form>
      )}

      {phase.name === "receipt" && result && (
        <ReceiptReview
          result={result}
          total={total}
          setTotal={setTotal}
          merchant={merchant}
          setMerchant={setMerchant}
          date={date}
          setDate={setDate}
          today={today}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          expenseCats={expenseCats}
          saving={saving}
          error={saveError}
          onRetake={() => startScan("camera")}
          onSplit={() => setPhase({ name: "split" })}
          onManual={() => manual({ amount: total ?? undefined, date, note: merchant || undefined })}
          onSave={() => {
            if (!total || total <= 0) return setSaveError("Isi total pengeluaran dulu.");
            if (!categoryId) return setSaveError("Pilih kategori dulu.");
            void save([{ type: "expense", category_id: categoryId, amount: total, description: merchant.trim().slice(0, 120) || null, transaction_date: date }]);
          }}
        />
      )}

      {phase.name === "split" && result && (
        <SplitReview
          result={result}
          merchant={merchant}
          date={date}
          itemCats={itemCats}
          setItemCat={(i, id) => setItemCats((cs) => cs.map((c, k) => (k === i ? id : c)))}
          expenseCats={expenseCats}
          catById={catById}
          saving={saving}
          error={saveError}
          onSave={(groups) =>
            void save(
              groups.map((g) => ({
                type: "expense" as const,
                category_id: g.categoryId,
                amount: g.amount,
                description: `${merchant.trim() || "Belanja"} · ${g.count} barang`.slice(0, 120),
                transaction_date: date,
              })),
            )
          }
          onOne={() => setPhase({ name: "receipt" })}
        />
      )}

      {phase.name === "statement" && result && (
        <StatementReview
          result={result}
          rows={rows}
          setRows={setRows}
          categories={data.categories}
          today={today}
          saving={saving}
          error={saveError}
          onSave={() => {
            const keep = rows.filter((r) => r.keep);
            if (!keep.length) return setSaveError("Centang minimal satu transaksi.");
            void save(
              keep.map((r) => ({
                type: r.type,
                category_id: r.category_id,
                amount: r.amount,
                description: r.description.slice(0, 120) || null,
                transaction_date: r.date ?? today,
              })),
            );
          }}
        />
      )}

      {phase.name === "fail" && (
        <div className="col" style={{ gap: 16 }}>
          <div className="state" style={{ alignItems: "center", textAlign: "center", gap: 10 }}>
            <span className="icb am" style={{ width: 64, height: 64, borderRadius: 20 }}>
              <ScanLine size={28} aria-hidden="true" />
            </span>
            <h1 className="h2">{phase.message === "Struknya belum terbaca" ? "Struknya belum terbaca" : "Belum berhasil"}</h1>
            <p className="t mut">
              {phase.message === "Struknya belum terbaca"
                ? "Ini sering terjadi, apalagi kalau struknya kusut atau tintanya pudar. Coba salah satu ini:"
                : phase.message}
            </p>
          </div>
          {phase.message === "Struknya belum terbaca" && (
            <div className="card" style={{ gap: 12 }}>
              {[
                [Sun, "Foto di tempat yang lebih terang"],
                [ScanLine, "Pastikan seluruh struk masuk bingkai"],
                [Lightbulb, "Ratakan struk supaya tidak terlipat"],
              ].map(([Icon, text]) => {
                const I = Icon as typeof Sun;
                return (
                  <div key={text as string} className="row">
                    <span className="icb" style={{ width: 32, height: 32, borderRadius: 10 }}>
                      <I size={16} aria-hidden="true" />
                    </span>
                    <p className="s sp">{text as string}</p>
                  </div>
                );
              })}
            </div>
          )}
          {phase.total ? (
            <div className="card soft" style={{ gap: 8 }}>
              <p className="sec" style={{ color: "var(--onpris)" }}>
                Sempat terbaca
              </p>
              <p className="h2 num">Total {formatRupiah(phase.total)}</p>
              <button className="btn sm" type="button" style={{ alignSelf: "flex-start" }} onClick={() => manual({ amount: phase.total ?? undefined })}>
                Lanjut isi manual dengan angka ini
              </button>
            </div>
          ) : null}
          <div className="sp" />
          <button className="btn" type="button" onClick={() => startScan("camera")}>
            <Camera size={18} aria-hidden="true" />
            Foto ulang
          </button>
          <button className="btn ghost" type="button" onClick={() => startScan("upload")}>
            <ImageUp size={18} aria-hidden="true" />
            Unggah gambar lain
          </button>
          <button className="lnk" type="button" style={{ justifyContent: "center", color: "var(--mut)" }} onClick={() => manual()}>
            Isi manual saja
          </button>
        </div>
      )}
    </main>
  );
}

function Reading({ step, pdf, onCancel }: { step: 1 | 2 | 3; pdf: boolean; onCancel: () => void }) {
  const steps = [pdf ? "File diterima" : "Foto diterima", "Membaca tulisan dan angka", "Mencocokkan kategori"];
  return (
    <div className="col" style={{ gap: 20, flex: 1 }}>
      <div className="state" style={{ alignItems: "center", textAlign: "center", gap: 10, marginTop: 24 }}>
        <span className="scan-pulse">
          <Sparkles size={30} aria-hidden="true" />
        </span>
        <h1 className="h2">Sebentar, lagi dibaca</h1>
        <p className="t mut">{pdf ? "Rekening koran yang panjang bisa butuh hingga satu menit." : "Biasanya kurang dari 10 detik."}</p>
      </div>
      <div className="card" style={{ gap: 14 }} role="status" aria-live="polite">
        {steps.map((label, i) => {
          const n = i + 1;
          const state = n < step || (n === 3 && step === 3) ? "done" : n === step ? "run" : "wait";
          return (
            <div key={label} className="row">
              <span className={`icb${state === "done" ? " g" : ""}`} style={{ width: 32, height: 32, borderRadius: 10 }}>
                {state === "done" ? <Check size={16} aria-hidden="true" /> : state === "run" ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <span className="s mut b">{n}</span>}
              </span>
              <p className={`s sp${state === "wait" ? " mut" : " b"}`}>{label}</p>
              <span className="s mut">{state === "done" ? "Selesai" : state === "run" ? "Berjalan" : "Menunggu"}</span>
            </div>
          );
        })}
      </div>
      <div className="sp" />
      <button className="lnk" type="button" style={{ justifyContent: "center", color: "var(--mut)" }} onClick={onCancel}>
        Batal, isi manual saja
      </button>
    </div>
  );
}

function CategoryPicker({ value, onChange, categories, suggested }: { value: string; onChange: (id: string) => void; categories: Category[]; suggested: string | null }) {
  const names = ["Makan & minum", "Belanja", "Lainnya"];
  const quick = [suggested, ...names.map((n) => categories.find((c) => c.name === n)?.id)].filter((x, i, a): x is string => Boolean(x) && a.indexOf(x) === i).slice(0, 3);
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="wrap" role="group" aria-label="Kategori">
        {quick.map((id) => {
          const c = categories.find((x) => x.id === id);
          if (!c) return null;
          return (
            <button key={id} type="button" className={`chip${value === id ? " on" : ""}`} aria-pressed={value === id} onClick={() => onChange(id)}>
              <CategoryIcon icon={c.icon} size={16} />
              {c.name}
            </button>
          );
        })}
      </div>
      <select className="inp" aria-label="Kategori lain" value={quick.includes(value) ? "" : value} onChange={(e) => e.target.value && onChange(e.target.value)}>
        <option value="">Kategori lain…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReceiptReview(p: {
  result: ScanResult;
  total: number | null;
  setTotal: (v: number | null) => void;
  merchant: string;
  setMerchant: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  today: string;
  categoryId: string;
  setCategoryId: (v: string) => void;
  expenseCats: Category[];
  saving: boolean;
  error: string | null;
  onRetake: () => void;
  onSplit: () => void;
  onManual: () => void;
  onSave: () => void;
}) {
  const items = p.result.items;
  const itemsSum = sumOf(items);
  const goods = items.filter((i) => i.amount > 0);
  const matches = items.length > 0 && itemsSum === p.total;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span className="tag blu">
          <Sparkles size={12} aria-hidden="true" /> Dibaca AI
        </span>
        <div className="col sp" style={{ gap: 2 }}>
          <p className="t b">Cek dulu sebelum disimpan</p>
          <p className="s mut">Hasil baca bisa salah. Semua kolom di bawah bisa kamu ubah.</p>
        </div>
        <button className="lnk" type="button" onClick={p.onRetake}>
          Ganti foto
        </button>
      </div>

      <div className="card hero" style={{ gap: 6 }}>
        <label className="s mut" htmlFor="scan-total">
          Total pengeluaran
        </label>
        <AmountInput id="scan-total" className="big-input" value={p.total} onValueChange={p.setTotal} placeholder="0" />
        {items.length > 0 && (
          <p className="s mut">{matches ? `Sama dengan jumlah ${goods.length} barang di struk` : `Jumlah barang ${formatRupiah(itemsSum)}. Cek lagi totalnya.`}</p>
        )}
      </div>

      <Field label="Toko" htmlFor="scan-merchant">
        <input id="scan-merchant" className="inp" maxLength={80} value={p.merchant} onChange={(e) => p.setMerchant(e.target.value)} placeholder="Nama toko" />
      </Field>
      <Field label="Tanggal" htmlFor="scan-date" hint={p.result.dateClear ? undefined : "Tanggal di struk kurang jelas. Pastikan sudah benar."}>
        <input id="scan-date" className="inp" type="date" max={p.today} value={p.date} onChange={(e) => e.target.value && p.setDate(e.target.value)} />
      </Field>
      <div className="col" style={{ gap: 6 }}>
        <p className="lbl" style={{ marginBottom: 0 }}>
          Kategori
        </p>
        <CategoryPicker value={p.categoryId} onChange={p.setCategoryId} categories={p.expenseCats} suggested={p.result.category_id} />
        <p className="s mut">Saran dari isi struk. Ganti kalau kurang pas.</p>
      </div>

      {items.length > 0 && (
        <div className="card" style={{ gap: 10 }}>
          <div className="row">
            <p className="sec sp">Barang di struk</p>
            <span className="s mut">{goods.length} barang</span>
          </div>
          {items.map((it, i) => (
            <div key={`${it.name}-${i}`} className="row">
              <p className="s sp">
                {it.name}
                {it.qty ? <span className="mut"> × {it.qty}</span> : null}
              </p>
              <p className={`s b num${it.amount < 0 ? " pos" : ""}`}>{it.amount < 0 ? `−${formatRupiah(-it.amount)}` : formatRupiah(it.amount)}</p>
            </div>
          ))}
        </div>
      )}

      <ErrorNote message={p.error} />
      {goods.length > 1 && (
        <button className="btn ghost" type="button" onClick={p.onSplit} disabled={p.saving}>
          <Split size={18} aria-hidden="true" />
          Pisah jadi beberapa transaksi
        </button>
      )}
      <button className="btn" type="button" onClick={p.onSave} disabled={p.saving}>
        {p.saving ? <Spinner label="Menyimpan" /> : "Simpan transaksi"}
      </button>
      <button className="lnk" type="button" style={{ justifyContent: "center", color: "var(--mut)" }} onClick={p.onManual} disabled={p.saving}>
        Isi manual saja
      </button>
    </div>
  );
}

interface Group {
  categoryId: string;
  amount: number;
  count: number;
}

/** Groups items by chosen category; a group left at zero or below (only discounts) folds into the largest. */
function groupItems(items: ScanResult["items"], cats: string[]): Group[] {
  const map = new Map<string, Group>();
  items.forEach((it, i) => {
    const id = cats[i];
    const g = map.get(id) ?? { categoryId: id, amount: 0, count: 0 };
    g.amount += it.amount;
    if (it.amount > 0) g.count += 1;
    map.set(id, g);
  });
  const groups = [...map.values()].sort((a, b) => b.amount - a.amount);
  const keep = groups.filter((g) => g.amount > 0);
  const rest = groups.filter((g) => g.amount <= 0);
  if (keep.length) for (const g of rest) keep[0].amount += g.amount;
  return keep.filter((g) => g.amount > 0);
}

function SplitReview(p: {
  result: ScanResult;
  merchant: string;
  date: string;
  itemCats: string[];
  setItemCat: (i: number, id: string) => void;
  expenseCats: Category[];
  catById: Map<string, Category>;
  saving: boolean;
  error: string | null;
  onSave: (groups: Group[]) => void;
  onOne: () => void;
}) {
  const groups = groupItems(p.result.items, p.itemCats);
  const total = sumOf(groups);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 4 }}>
        <h1 className="h2">Barang ini masuk kategori apa?</h1>
        <p className="s mut">
          {[p.merchant || null, formatDayMonth(p.date), `total ${formatRupiah(total)}`].filter(Boolean).join(" · ")}. Ganti kategori tiap barang di bawah.
        </p>
      </div>
      <div className="col" style={{ gap: 10 }}>
        {p.result.items.map((it, i) =>
          it.amount < 0 ? null : (
            <div key={`${it.name}-${i}`} className="opt" style={{ cursor: "default" }}>
              <span className="opt-text">
                <span className="opt-label">
                  {it.name}
                  {it.qty ? ` × ${it.qty}` : ""}
                </span>
                <span className="opt-desc num">{formatRupiah(it.amount)}</span>
              </span>
              <select className="inp" style={{ width: 150, minHeight: 40 }} aria-label={`Kategori ${it.name}`} value={p.itemCats[i]} onChange={(e) => p.setItemCat(i, e.target.value)}>
                {p.expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ),
        )}
      </div>
      <div className="card" style={{ gap: 10 }}>
        <p className="sec">Jadi {groups.length} transaksi</p>
        {groups.map((g) => {
          const c = p.catById.get(g.categoryId);
          return (
            <div key={g.categoryId} className="row">
              <span className="icb" style={{ width: 32, height: 32, borderRadius: 10 }}>
                <CategoryIcon icon={c?.icon ?? "lainnya"} size={16} />
              </span>
              <p className="s sp">
                <span className="b">{c?.name ?? "Lainnya"}</span> <span className="mut">· {g.count} barang</span>
              </p>
              <p className="s b num">{formatRupiah(g.amount)}</p>
            </div>
          );
        })}
        <hr className="div" />
        <div className="row">
          <p className="s sp mut">Total tetap</p>
          <p className="s b num">{formatRupiah(total)}</p>
        </div>
      </div>
      <ErrorNote message={p.error} />
      <button className="btn" type="button" disabled={p.saving || !groups.length} onClick={() => p.onSave(groups)}>
        {p.saving ? <Spinner label="Menyimpan" /> : `Simpan ${groups.length} transaksi`}
      </button>
      <button className="lnk" type="button" style={{ justifyContent: "center", color: "var(--mut)" }} onClick={p.onOne} disabled={p.saving}>
        Jadikan 1 transaksi saja
      </button>
    </div>
  );
}

function StatementReview(p: {
  result: ScanResult;
  rows: (ScanTx & { keep: boolean })[];
  setRows: React.Dispatch<React.SetStateAction<(ScanTx & { keep: boolean })[]>>;
  categories: Category[];
  today: string;
  saving: boolean;
  error: string | null;
  onSave: () => void;
}) {
  const kept = p.rows.filter((r) => r.keep);
  const income = sumOf(kept.filter((r) => r.type === "income"));
  const expense = sumOf(kept.filter((r) => r.type === "expense"));
  const dups = p.rows.filter((r) => r.duplicate).length;
  const noDate = p.rows.filter((r) => !r.date).length;
  const update = (i: number, patch: Partial<ScanTx & { keep: boolean }>) => p.setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const allOn = kept.length === p.rows.length;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span className="tag blu">
          <Sparkles size={12} aria-hidden="true" /> Dibaca AI
        </span>
        <div className="col sp" style={{ gap: 2 }}>
          <p className="t b">Ketemu {p.rows.length} transaksi</p>
          <p className="s mut">Cek dulu. Hilangkan centang untuk yang tidak mau disimpan, dan ganti kategori kalau kurang pas.</p>
        </div>
      </div>

      <div className="card hero" style={{ gap: 8 }}>
        <div className="row">
          <p className="s mut sp">Masuk</p>
          <p className="b num" style={{ color: "#5ee0b0" }}>
            +{formatRupiah(income)}
          </p>
        </div>
        <div className="row">
          <p className="s mut sp">Keluar</p>
          <p className="b num">−{formatRupiah(expense)}</p>
        </div>
      </div>

      {dups > 0 && (
        <p className="s note-amb" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: 12, borderRadius: 14 }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ flex: "none", marginTop: 2 }} />
          {dups} transaksi sepertinya sudah pernah kamu catat (tanggal dan jumlahnya sama), jadi tidak dicentang.
        </p>
      )}
      {noDate > 0 && <p className="s mut">{noDate} transaksi tanpa tanggal jelas akan dicatat hari ini. Ubah tanggalnya kalau perlu.</p>}
      {p.result.partial && (
        <p className="s mut">
          Baru {p.result.partial.read} dari {p.result.partial.of} bagian dokumen yang terbaca karena layanan sedang ramai. Unggah lagi nanti untuk sisanya.
        </p>
      )}

      <button className="lnk" type="button" style={{ alignSelf: "flex-start" }} onClick={() => p.setRows((rs) => rs.map((r) => ({ ...r, keep: !allOn })))}>
        {allOn ? "Hapus semua centang" : "Centang semua"}
      </button>

      <div className="col" style={{ gap: 10 }}>
        {p.rows.map((r, i) => {
          const cats = p.categories.filter((c) => c.type === r.type);
          return (
            <div key={i} className="opt" style={{ alignItems: "flex-start", cursor: "default", opacity: r.keep ? 1 : 0.6 }}>
              <input
                type="checkbox"
                aria-label={`Simpan ${r.description}`}
                checked={r.keep}
                onChange={(e) => update(i, { keep: e.target.checked })}
                style={{ width: 22, height: 22, marginTop: 2, accentColor: "var(--pri)", flex: "none" }}
              />
              <span className="opt-text" style={{ gap: 6 }}>
                <span className="row" style={{ gap: 8 }}>
                  <span className="opt-label sp" style={{ overflowWrap: "anywhere" }}>
                    {r.description}
                  </span>
                  <span className={`s b num ${r.type === "income" ? "pos" : "neg"}`}>
                    {r.type === "income" ? "+" : "−"}
                    {formatRupiah(r.amount)}
                  </span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <input
                    className="inp"
                    type="date"
                    aria-label={`Tanggal ${r.description}`}
                    max={p.today}
                    value={r.date ?? p.today}
                    onChange={(e) => e.target.value && update(i, { date: e.target.value })}
                    style={{ minHeight: 36, padding: "0 8px", fontSize: 13, width: 138 }}
                  />
                  <select
                    className="inp sp"
                    aria-label={`Kategori ${r.description}`}
                    value={r.category_id}
                    onChange={(e) => update(i, { category_id: e.target.value })}
                    style={{ minHeight: 36, padding: "0 8px", fontSize: 13 }}
                  >
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </span>
                {r.duplicate && (
                  <span className="s" style={{ color: "var(--amb)" }}>
                    Mungkin sudah tercatat
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <ErrorNote message={p.error} />
      <button className="btn" type="button" disabled={p.saving || !kept.length} onClick={p.onSave}>
        {p.saving ? <Spinner label="Menyimpan" /> : (
          <>
            <CircleCheck size={18} aria-hidden="true" />
            Simpan {kept.length} transaksi
          </>
        )}
      </button>
    </div>
  );
}
