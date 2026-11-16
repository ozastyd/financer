"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  ArrowLeftRight,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleCheck,
  FileLock2,
  FileText,
  ImageUp,
  Lightbulb,
  Pencil,
  ScanLine,
  Split,
  Sun,
  Tags,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { useShell } from "@/components/shell";
import { useToast } from "@/components/toast";
import { AmountInput, ErrorNote, Field, Segmented, Spinner } from "@/components/ui/controls";
import { CategoryIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { formatDayHeading, formatDayMonth, isValidDate } from "@/lib/date";
import { toAppError } from "@/lib/errors";
import { formatRupiah } from "@/lib/money";
import {
  type ScanMatch,
  type ScanResult,
  ScanFailure,
  type ScanTx,
  clearScanSession,
  loadScanSession,
  makePreview,
  saveScanSession,
  saveScanned,
  scanFile,
  setTransaksiJump,
  takePendingScan,
  undoScanned,
} from "@/lib/scan-client";
import type { TransactionInput } from "@/lib/schemas";
import type { Category, TxType } from "@/lib/types";

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

type Row = ScanTx & { keep: boolean };

type Phase =
  | { name: "reading"; step: 1 | 2 | 3 }
  | { name: "password"; wrong: boolean }
  | { name: "receipt" }
  | { name: "split" }
  | { name: "statement" }
  | { name: "fail"; reason: "unreadable" | "busy" | "other"; message: string; total: number | null; retryAt: number | null };

/** What the user changed during review; kept with the result so a reload restores it. */
interface Edits {
  phase: "receipt" | "split" | "statement";
  total: number | null;
  merchant: string;
  date: string;
  categoryId: string;
  itemCats: string[];
  rows: Row[];
  editing: boolean;
  dirty: boolean;
}

const sumOf = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);

/** "TRSF E-BANKING DB GOPAY TOPUP" -> "Trsf E-Banking DB Gopay Topup": bank lines are shouted in caps. */
const KEEP_CAPS = /^(ATM|QRIS|OVO|PLN|BCA|BRI|BNI|BSI|BTN|CIMB|PT|CV|DB|CR|BPJS|PDAM|VA|ID)$/;
function prettyDesc(s: string): string {
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => (KEEP_CAPS.test(w.toUpperCase()) ? w.toUpperCase() : w.replace(/(^|[*\-/(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())))
    .join("");
}

const TRANSFER_REASON: Record<NonNullable<ScanTx["transfer"]>, string> = {
  topup: "Top-up e-wallet, bukan pengeluaran. Catat belanjanya saja.",
  atm: "Tarik tunai, uangnya belum terpakai.",
  own: "Pindah ke rekening sendiri, bukan pengeluaran.",
};

function matchText(m: ScanMatch) {
  return `Sudah ada: ${m.description ? `${m.description} · ` : ""}${m.category}`;
}

const needsCheck = (r: Row) => r.duplicate || Boolean(r.transfer) || !r.date;

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export default function ScanPage() {
  const { data, today, mutate } = useApp();
  const { openAddTx, startScan } = useShell();
  const toast = useToast();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [isPdf, setIsPdf] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "reading", step: 1 });
  const [result, setResult] = useState<ScanResult | null>(null);
  const [password, setPassword] = useState("");
  const abort = useRef<AbortController | null>(null);

  const [total, setTotal] = useState<number | null>(null);
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [itemCats, setItemCats] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState<null | (() => void)>(null);
  const [zoom, setZoom] = useState(false);

  const expenseCats = useMemo(() => data.categories.filter((c) => c.type === "expense"), [data.categories]);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  /** Start a review from a fresh scan result. */
  const startReview = useCallback(
    (r: ScanResult) => {
      setResult(r);
      setDirty(false);
      setEditing(false);
      if (r.kind === "receipt" && (r.total || r.items.length)) {
        setTotal(r.total ?? (r.items.length ? Math.max(0, sumOf(r.items)) : null));
        setMerchant(r.merchant ?? "");
        setDate(r.date && isValidDate(r.date) && r.date <= today ? r.date : today);
        setCategoryId(r.category_id ?? expenseCats[0]?.id ?? "");
        setItemCats(r.items.map((i) => i.category_id));
        setPhase({ name: "receipt" });
      } else if (r.transactions.length) {
        setRows(
          r.transactions.map((t) => ({
            ...t,
            description: prettyDesc(t.description),
            date: t.date && isValidDate(t.date) && t.date <= today ? t.date : null,
            keep: !t.duplicate && !t.transfer,
          })),
        );
        setPhase({ name: "statement" });
      } else {
        setPhase({ name: "fail", reason: "unreadable", message: "", total: r.total, retryAt: null });
      }
    },
    [today, expenseCats],
  );

  const run = useCallback(
    async (f: File, pw?: string) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setPhase({ name: "reading", step: 2 });
      try {
        const r = await scanFile(f, pw, ctrl.signal);
        setPhase({ name: "reading", step: 3 });
        await new Promise((x) => setTimeout(x, 350));
        if (ctrl.signal.aborted) return;
        startReview(r);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        if (e instanceof ScanFailure && e.code === "password") return setPhase({ name: "password", wrong: Boolean(pw) });
        const busy = e instanceof ScanFailure && (e.code === "busy" || e.code === "limit");
        const retryAt = busy ? Date.now() + ((e as ScanFailure).retryAfter ?? 60) * 1000 : null;
        setPhase({
          name: "fail",
          reason: busy ? "busy" : e instanceof ScanFailure && e.code === "unreadable" ? "unreadable" : "other",
          message: e instanceof ScanFailure ? e.message : "Gagal membaca file. Coba lagi.",
          total: null,
          retryAt,
        });
      }
    },
    [startReview],
  );

  // Latest `run` without re-running the mount effect when data refreshes.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  // Arrival: a new file from the "+" menu, else the review saved before a reload, else home.
  useEffect(() => {
    const begin = (f: File) => {
      clearScanSession();
      setFile(f);
      setFileName(f.name);
      setIsPdf(/pdf/i.test(f.type) || /\.pdf$/i.test(f.name));
      setPreview(null);
      setResult(null);
      setPassword("");
      setSaveError(null);
      void makePreview(f).then(setPreview);
      void runRef.current(f);
    };
    const restore = (saved: NonNullable<ReturnType<typeof loadScanSession<Edits>>>) => {
      const e = saved.edits;
      setFileName(saved.fileName);
      setIsPdf(saved.isPdf);
      setPreview(saved.preview);
      setResult(saved.result);
      setTotal(e.total);
      setMerchant(e.merchant);
      setDate(e.date);
      setCategoryId(e.categoryId);
      setItemCats(e.itemCats);
      setRows(e.rows);
      setEditing(e.editing);
      setDirty(e.dirty);
      setPhase({ name: e.phase } as Phase);
    };
    const pending = takePendingScan();
    const saved = pending ? null : loadScanSession<Edits>();
    if (pending) begin(pending);
    else if (saved) restore(saved);
    else router.replace("/beranda");
    const onNew = () => {
      const f = takePendingScan();
      if (f) begin(f);
    };
    window.addEventListener("financer:scan", onNew);
    return () => {
      window.removeEventListener("financer:scan", onNew);
      abort.current?.abort();
    };
  }, [router]);

  // Keep the review in this tab's session so a reload or app switch doesn't lose it.
  useEffect(() => {
    if (!result || (phase.name !== "receipt" && phase.name !== "split" && phase.name !== "statement")) return;
    saveScanSession<Edits>({
      fileName,
      isPdf,
      preview,
      result,
      edits: { phase: phase.name, total, merchant, date, categoryId, itemCats, rows, editing, dirty },
    });
  }, [result, phase.name, fileName, isPdf, preview, total, merchant, date, categoryId, itemCats, rows, editing, dirty]);

  const touch = () => setDirty(true);
  const reviewing = phase.name === "receipt" || phase.name === "split" || phase.name === "statement";

  /** Leaving a review with changes asks first. */
  const guard = (go: () => void) => (reviewing && dirty ? setConfirmLeave(() => go) : go());

  const leave = () => {
    abort.current?.abort();
    clearScanSession();
    router.replace("/beranda");
  };

  const manual = (prefill?: { amount?: number; date?: string; note?: string; categoryId?: string }) => {
    abort.current?.abort();
    clearScanSession();
    router.replace("/beranda");
    openAddTx({ type: "expense", prefill });
  };

  const save = async (items: TransactionInput[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const ids = await mutate(() => saveScanned(items));
      clearScanSession();
      const latest = items.reduce((m, i) => (i.transaction_date > m ? i.transaction_date : m), items[0].transaction_date);
      setTransaksiJump(latest, ids);
      toast.success(ids.length === 1 ? "Transaksi tersimpan." : `${ids.length} transaksi tersimpan.`, {
        label: "Batalkan",
        run: () => {
          void mutate(() => undoScanned(ids))
            .then(() => toast.info("Dibatalkan, tidak ada yang disimpan."))
            .catch(() => toast.error("Gagal membatalkan. Hapus manual dari daftar transaksi."));
        },
      });
      router.replace("/transaksi");
    } catch (e) {
      const err = toAppError(e);
      if (err.kind !== "session") setSaveError(err.message);
      setSaving(false);
    }
  };

  const titles: Record<Phase["name"], string> = {
    reading: isPdf ? "Membaca rekening" : "Membaca struk",
    password: "PDF terkunci",
    receipt: "Cek struk",
    split: "Pisah per kategori",
    statement: "Cek mutasi",
    fail: phase.name === "fail" && phase.reason === "busy" ? "Lagi ramai" : "Belum terbaca",
  };

  return (
    <main className="scr safe scan" style={{ gap: 18 }}>
      <header className="row scan-head">
        <button
          type="button"
          className="ibtn"
          aria-label={phase.name === "split" ? "Kembali ke struk" : "Keluar dari scan"}
          onClick={() => (phase.name === "split" ? setPhase({ name: "receipt" }) : guard(leave))}
        >
          {phase.name === "split" ? <ChevronLeft size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
        </button>
        <h1 className="t b sp" style={{ textAlign: "center" }}>
          {titles[phase.name]}
        </h1>
        <span style={{ width: 44, flex: "none" }} aria-hidden="true" />
      </header>

      {phase.name === "reading" && <Reading step={phase.step} pdf={isPdf} fileName={fileName} preview={preview} onCancel={() => manual()} />}

      {phase.name === "password" && file && (
        <PasswordForm
          wrong={phase.wrong}
          password={password}
          setPassword={setPassword}
          onSubmit={() => password && void run(file, password)}
          onOther={() => startScan("upload")}
        />
      )}

      {phase.name === "receipt" && result && (
        <ReceiptReview
          result={result}
          preview={preview}
          onZoom={() => setZoom(true)}
          total={total}
          setTotal={(v) => (setTotal(v), touch())}
          merchant={merchant}
          setMerchant={(v) => (setMerchant(v), touch())}
          date={date}
          setDate={(v) => (setDate(v), touch())}
          today={today}
          categoryId={categoryId}
          setCategoryId={(v) => (setCategoryId(v), touch())}
          expenseCats={expenseCats}
          catById={catById}
          editing={editing}
          setEditing={setEditing}
          saving={saving}
          error={saveError}
          onRetake={() => guard(() => startScan("camera"))}
          onSplit={() => setPhase({ name: "split" })}
          onManual={() => manual({ amount: total ?? undefined, date, note: merchant || undefined, categoryId })}
          onSave={() => {
            if (!total || total <= 0) {
              setEditing(true);
              return setSaveError("Isi total pengeluaran dulu.");
            }
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
          setItemCat={(i, id) => (setItemCats((cs) => cs.map((c, k) => (k === i ? id : c))), touch())}
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
                description: `${merchant.trim() || "Belanja"} · ${g.names.slice(0, 3).join(", ")}${g.names.length > 3 ? ", …" : ""}`.slice(0, 120),
                transaction_date: date,
              })),
            )
          }
        />
      )}

      {phase.name === "statement" && result && (
        <StatementReview
          result={result}
          fileName={fileName}
          isPdf={isPdf}
          preview={preview}
          onZoom={() => setZoom(true)}
          rows={rows}
          setRows={(fn) => (setRows(fn), touch())}
          categories={data.categories}
          catById={catById}
          today={today}
          saving={saving}
          error={saveError}
          onDone={() => {
            clearScanSession();
            router.replace("/transaksi");
          }}
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
        <Fail
          phase={phase}
          canRetry={Boolean(file)}
          onRetry={() => file && void run(file, password || undefined)}
          onRetake={() => startScan("camera")}
          onUpload={() => startScan("upload")}
          onManual={(amount) => manual(amount ? { amount } : undefined)}
        />
      )}

      <Sheet open={Boolean(confirmLeave)} onOpenChange={(o) => !o && setConfirmLeave(null)} title="Buang hasil scan ini?">
        <p className="t mut">Perubahan yang sudah kamu buat di sini belum disimpan dan akan hilang.</p>
        <div className="col" style={{ gap: 10 }}>
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              const go = confirmLeave;
              setConfirmLeave(null);
              clearScanSession();
              go?.();
            }}
          >
            Buang
          </button>
          <button className="btn ghost" type="button" onClick={() => setConfirmLeave(null)}>
            Lanjut cek
          </button>
        </div>
      </Sheet>

      {preview && <PhotoViewer src={preview} open={zoom} onOpenChange={setZoom} />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------

/** Fixed action bar in the thumb zone; the spacer keeps the last content clear of it. */
function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="scan-bar-spacer" aria-hidden="true" />
      <div className="scan-bar">{children}</div>
    </>
  );
}

function PhotoViewer({ src, open, onOpenChange }: { src: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="photo-viewer-scrim" />
        <Dialog.Content className="photo-viewer" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Foto yang dibaca</Dialog.Title>
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
          <img src={src} alt="Foto struk atau mutasi yang kamu unggah" />
          <Dialog.Close className="ibtn photo-viewer-close" aria-label="Tutup foto">
            <X size={20} aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Thumb({ preview, onZoom, size = 72 }: { preview: string | null; onZoom: () => void; size?: number }) {
  if (!preview) {
    return (
      <span className="scan-thumb is-file" style={{ width: size, height: size * 1.3 }} aria-hidden="true">
        <FileText size={24} />
      </span>
    );
  }
  return (
    <button type="button" className="scan-thumb" style={{ width: size, height: size * 1.3 }} onClick={onZoom} aria-label="Lihat foto lebih besar">
      {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
      <img src={preview} alt="" />
    </button>
  );
}

function Reading({ step, pdf, fileName, preview, onCancel }: { step: 1 | 2 | 3; pdf: boolean; fileName: string; preview: string | null; onCancel: () => void }) {
  const steps = [pdf ? "File diterima" : "Foto diterima", "Membaca tulisan dan angka", "Mencocokkan kategori"];
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="col" style={{ gap: 22, flex: 1 }}>
      <div className="scan-stage">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
          <img src={preview} alt="" />
        ) : (
          <span className="scan-stage-file">
            <FileText size={40} aria-hidden="true" />
            <span className="s b">{fileName || "Dokumen"}</span>
          </span>
        )}
        <span className="scan-sweep" aria-hidden="true" />
      </div>
      <div className="col" style={{ gap: 6, alignItems: "center", textAlign: "center" }}>
        <h2 className="h2">Sebentar, lagi dibaca</h2>
        <p className="s mut">
          {pdf
            ? seconds < 8
              ? "Rekening koran yang panjang bisa butuh hingga satu menit."
              : `Sudah ${seconds} detik. Masih dibaca, jangan tutup halaman ini.`
            : seconds < 12
              ? "Biasanya kurang dari 10 detik."
              : `Sudah ${seconds} detik, sedikit lagi.`}
        </p>
      </div>
      <ol className="scan-steps">
        {steps.map((label, i) => {
          const n = i + 1;
          const state = n < step || (n === 3 && step === 3) ? "done" : n === step ? "run" : "wait";
          return (
            <li key={label} className={state}>
              <span className="scan-step-dot" aria-hidden="true">
                {state === "done" ? <Check size={14} strokeWidth={3} /> : null}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {steps[Math.min(step, 3) - 1]}
      </p>
      <ActionBar>
        <button className="btn ghost" type="button" onClick={onCancel}>
          Batal, isi manual saja
        </button>
      </ActionBar>
    </div>
  );
}

function PasswordForm({ wrong, password, setPassword, onSubmit, onOther }: { wrong: boolean; password: string; setPassword: (v: string) => void; onSubmit: () => void; onOther: () => void }) {
  return (
    <form
      className="col"
      style={{ gap: 18 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 10, marginTop: 12 }}>
        <span className="icb am" style={{ width: 64, height: 64, borderRadius: 20 }}>
          <FileLock2 size={28} aria-hidden="true" />
        </span>
        <h2 className="h2">Rekening koran ini dikunci</h2>
        <p className="t mut">Kata sandi hanya dipakai untuk membuka file ini, tidak disimpan.</p>
      </div>
      <Field label="Kata sandi PDF" htmlFor="pdf-pw" error={wrong ? "Kata sandi salah. Coba format lain di bawah." : undefined}>
        <input id="pdf-pw" className="inp" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <div className="scan-hint">
        <Lightbulb size={16} aria-hidden="true" />
        <p className="s">
          Biasanya tanggal lahir, misalnya <b>17081999</b> (DDMMYYYY) atau <b>170899</b>. Beberapa bank menambah angka akhir nomor rekening, cek email dari bankmu.
        </p>
      </div>
      <ActionBar>
        <button className="btn" type="submit" disabled={!password}>
          Buka PDF
        </button>
        <button className="lnk scan-bar-link" type="button" onClick={onOther}>
          Pilih file lain
        </button>
      </ActionBar>
    </form>
  );
}

function CategoryChip({ cat, onClick, label }: { cat: Category | undefined; onClick?: () => void; label?: string }) {
  const inner = (
    <>
      <CategoryIcon icon={cat?.icon ?? "lainnya"} size={15} />
      <span>{cat?.name ?? "Lainnya"}</span>
      {onClick && <ChevronDown size={14} aria-hidden="true" />}
    </>
  );
  return onClick ? (
    <button type="button" className="cat-chip" onClick={onClick} aria-label={label ?? `Kategori: ${cat?.name ?? "Lainnya"}. Ganti`}>
      {inner}
    </button>
  ) : (
    <span className="cat-chip">{inner}</span>
  );
}

/** One place to pick a category: a sheet listing the user's categories of one type. */
function CategorySheet({ open, onOpenChange, categories, value, onPick, title }: { open: boolean; onOpenChange: (o: boolean) => void; categories: Category[]; value: string; onPick: (id: string) => void; title: string }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="cat-grid" role="group" aria-label="Kategori">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className="opt"
            aria-pressed={value === c.id}
            onClick={() => {
              onPick(c.id);
              onOpenChange(false);
            }}
          >
            <span className="opt-icon" style={{ background: "var(--pris)", color: "var(--onpris)" }}>
              <CategoryIcon icon={c.icon} size={18} />
            </span>
            <span className="opt-label">{c.name}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function ReceiptReview(p: {
  result: ScanResult;
  preview: string | null;
  onZoom: () => void;
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
  catById: Map<string, Category>;
  editing: boolean;
  setEditing: (v: boolean) => void;
  saving: boolean;
  error: string | null;
  onRetake: () => void;
  onSplit: () => void;
  onManual: () => void;
  onSave: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const items = p.result.items;
  const goods = items.filter((i) => i.amount > 0);
  const itemsSum = sumOf(items);
  const matches = items.length > 0 && itemsSum === p.total;
  const cat = p.catById.get(p.categoryId);

  return (
    <div className="col" style={{ gap: 16 }}>
      <section className="receipt-card" aria-label="Hasil baca struk">
        <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
          <Thumb preview={p.preview} onZoom={p.onZoom} />
          <div className="col sp" style={{ gap: 6, minWidth: 0 }}>
            <h2 className="h2" style={{ overflowWrap: "anywhere" }}>
              {p.merchant || "Toko tidak terbaca"}
            </h2>
            <p className="s mut">
              {formatDayHeading(p.date, p.today)}
              {!p.result.dateClear && <span className="warn-inline"> · cek tanggal</span>}
            </p>
            <CategoryChip cat={cat} onClick={() => setPicking(true)} />
          </div>
        </div>
        <div className="receipt-total">
          <p className="num">{p.total ? formatRupiah(p.total) : "Rp —"}</p>
          {items.length > 0 && (
            <p className={`s ${matches ? "ok-inline" : "warn-inline"}`}>
              {matches ? (
                <>
                  <Check size={14} strokeWidth={3} aria-hidden="true" /> Cocok dengan {goods.length} barang di struk
                </>
              ) : (
                `Jumlah barang ${formatRupiah(itemsSum)}, beda dari total. Cek lagi.`
              )}
            </p>
          )}
        </div>
        {items.length > 0 && (
          <div className="receipt-items">
            <button type="button" className="lnk" aria-expanded={showItems} onClick={() => setShowItems((s) => !s)}>
              {showItems ? "Sembunyikan barang" : `Lihat ${goods.length} barang`}
              <ChevronDown size={16} aria-hidden="true" style={{ rotate: showItems ? "180deg" : "0deg", transition: "rotate .2s" }} />
            </button>
            {showItems && (
              <ul>
                {items.map((it, i) => (
                  <li key={`${it.name}-${i}`}>
                    <span>
                      {it.name}
                      {it.qty ? <span className="mut"> × {it.qty}</span> : null}
                    </span>
                    <span className={`num b${it.amount < 0 ? " pos" : ""}`}>{it.amount < 0 ? `−${formatRupiah(-it.amount)}` : formatRupiah(it.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {p.result.receiptMatch && (
        <p className="scan-note warn" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            Struk ini sepertinya sudah kamu catat ({p.result.receiptMatch.description || p.result.receiptMatch.category}, {formatRupiah(p.total ?? 0)}, {formatDayMonth(p.date)}). Simpan lagi hanya kalau ini belanja yang berbeda.
          </span>
        </p>
      )}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className={`chip${p.editing ? " on" : ""}`} aria-expanded={p.editing} onClick={() => p.setEditing(!p.editing)}>
          {p.editing ? <Check size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />} {p.editing ? "Selesai ubah" : "Ubah"}
        </button>
        {goods.length > 1 && (
          <button type="button" className="chip" onClick={p.onSplit}>
            <Split size={15} aria-hidden="true" /> Pisah per kategori
          </button>
        )}
        <button type="button" className="chip" onClick={p.onRetake}>
          <Camera size={15} aria-hidden="true" /> Foto ulang
        </button>
      </div>

      {p.editing && (
        <section className="col" style={{ gap: 14 }} aria-label="Ubah hasil baca">
          <Field label="Total" htmlFor="scan-total">
            <AmountInput id="scan-total" value={p.total} onValueChange={p.setTotal} placeholder="0" />
          </Field>
          <Field label="Toko" htmlFor="scan-merchant">
            <input id="scan-merchant" className="inp" maxLength={80} value={p.merchant} onChange={(e) => p.setMerchant(e.target.value)} placeholder="Nama toko" />
          </Field>
          <Field label="Tanggal" htmlFor="scan-date" hint={p.result.dateClear ? undefined : "Tanggal di struk kurang jelas, pastikan sudah benar."}>
            <input id="scan-date" className="inp" type="date" max={p.today} value={p.date} onChange={(e) => e.target.value && p.setDate(e.target.value)} />
          </Field>
        </section>
      )}

      <ErrorNote message={p.error} />

      <ActionBar>
        <button className="btn" type="button" onClick={p.onSave} disabled={p.saving}>
          {p.saving ? <Spinner label="Menyimpan" /> : p.total ? `Simpan ${formatRupiah(p.total)}` : "Simpan"}
        </button>
        <button className="lnk scan-bar-link" type="button" onClick={p.onManual} disabled={p.saving}>
          Isi manual saja
        </button>
      </ActionBar>

      <CategorySheet open={picking} onOpenChange={setPicking} categories={p.expenseCats} value={p.categoryId} onPick={p.setCategoryId} title="Kategori struk ini" />
    </div>
  );
}

interface Group {
  categoryId: string;
  amount: number;
  names: string[];
}

/** Groups items by chosen category; discounts reduce the group of their own category, or the largest one. */
function groupItems(items: ScanResult["items"], cats: string[]): { groups: Group[]; discount: number } {
  const map = new Map<string, Group>();
  let discount = 0;
  items.forEach((it, i) => {
    if (it.amount < 0) {
      discount += -it.amount;
      return;
    }
    const g = map.get(cats[i]) ?? { categoryId: cats[i], amount: 0, names: [] };
    g.amount += it.amount;
    g.names.push(it.name);
    map.set(cats[i], g);
  });
  const groups = [...map.values()].sort((a, b) => b.amount - a.amount);
  if (groups.length && discount) groups[0].amount = Math.max(1, groups[0].amount - discount);
  return { groups, discount };
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
}) {
  const [picking, setPicking] = useState<number | null>(null);
  const { groups, discount } = groupItems(p.result.items, p.itemCats);
  const total = sumOf(groups);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 4 }}>
        <h2 className="h2">Barang mana masuk kategori apa?</h2>
        <p className="s mut">Ketuk kategori sebuah barang untuk memindahkannya. Tiap kategori jadi satu transaksi.</p>
      </div>
      <ul className="split-list">
        {p.result.items.map((it, i) =>
          it.amount < 0 ? null : (
            <li key={`${it.name}-${i}`}>
              <div className="col sp" style={{ gap: 2, minWidth: 0 }}>
                <span className="b" style={{ overflowWrap: "anywhere" }}>
                  {it.name}
                  {it.qty ? <span className="mut"> × {it.qty}</span> : null}
                </span>
                <span className="s mut num">{formatRupiah(it.amount)}</span>
              </div>
              <CategoryChip cat={p.catById.get(p.itemCats[i])} onClick={() => setPicking(i)} label={`Kategori ${it.name}: ${p.catById.get(p.itemCats[i])?.name}. Ganti`} />
            </li>
          ),
        )}
      </ul>
      <section className="split-summary" aria-label="Ringkasan">
        <p className="s b">
          Jadi {groups.length} transaksi · {p.merchant || "Belanja"} · {formatDayMonth(p.date)}
        </p>
        {groups.map((g) => {
          const c = p.catById.get(g.categoryId);
          return (
            <div key={g.categoryId} className="row">
              <span className="icb" style={{ width: 32, height: 32, borderRadius: 10 }}>
                <CategoryIcon icon={c?.icon ?? "lainnya"} size={16} />
              </span>
              <p className="s sp">
                {c?.name ?? "Lainnya"} <span className="mut">· {g.names.length} barang</span>
              </p>
              <p className="s b num">{formatRupiah(g.amount)}</p>
            </div>
          );
        })}
        {discount > 0 && groups[0] && (
          <p className="s mut">
            Diskon {formatRupiah(discount)} dikurangkan dari {p.catById.get(groups[0].categoryId)?.name ?? "kategori terbesar"}.
          </p>
        )}
      </section>
      <ErrorNote message={p.error} />
      <ActionBar>
        <button className="btn" type="button" disabled={p.saving || !groups.length} onClick={() => p.onSave(groups)}>
          {p.saving ? <Spinner label="Menyimpan" /> : groups.length > 1 ? `Simpan ${groups.length} transaksi · ${formatRupiah(total)}` : `Simpan ${formatRupiah(total)}`}
        </button>
      </ActionBar>
      <CategorySheet
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
        categories={p.expenseCats}
        value={picking !== null ? p.itemCats[picking] : ""}
        onPick={(id) => picking !== null && p.setItemCat(picking, id)}
        title={picking !== null ? (p.result.items[picking]?.name ?? "Kategori") : "Kategori"}
      />
    </div>
  );
}

type Filter = "all" | "check" | "expense" | "income";

function StatementReview(p: {
  result: ScanResult;
  fileName: string;
  isPdf: boolean;
  preview: string | null;
  onZoom: () => void;
  rows: Row[];
  setRows: (fn: (rs: Row[]) => Row[]) => void;
  categories: Category[];
  catById: Map<string, Category>;
  today: string;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDone: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [bulk, setBulk] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const kept = p.rows.filter((r) => r.keep);
  const income = sumOf(kept.filter((r) => r.type === "income"));
  const expense = sumOf(kept.filter((r) => r.type === "expense"));
  const checkCount = p.rows.filter(needsCheck).length;
  const nothingNew = p.rows.every((r) => r.duplicate || r.transfer) && kept.length === 0;
  const update = (i: number, patch: Partial<Row>) => p.setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const visible = p.rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (filter === "all" ? true : filter === "check" ? needsCheck(r) : r.type === filter));
  // Group by day, newest first; rows without a date go last.
  const groups = new Map<string, { r: Row; i: number }[]>();
  for (const v of [...visible].sort((a, b) => (b.r.date ?? "").localeCompare(a.r.date ?? ""))) {
    const k = v.r.date ?? "none";
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }

  const filters: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "Semua", n: p.rows.length },
    { id: "check", label: "Perlu dicek", n: checkCount },
    { id: "expense", label: "Keluar", n: p.rows.filter((r) => r.type === "expense").length },
    { id: "income", label: "Masuk", n: p.rows.filter((r) => r.type === "income").length },
  ];

  if (nothingNew && !showAll) {
    return (
      <div className="col" style={{ gap: 18 }}>
        <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 10, marginTop: 24 }}>
          <span className="icb g" style={{ width: 64, height: 64, borderRadius: 20 }}>
            <CircleCheck size={30} aria-hidden="true" />
          </span>
          <h2 className="h2">Semua sudah tercatat</h2>
          <p className="t mut">
            {p.rows.length} transaksi di {p.isPdf ? "rekening ini" : "gambar ini"} sudah ada di catatanmu atau bukan pengeluaran (top-up, tarik tunai). Tidak ada yang perlu ditambah.
          </p>
          <button type="button" className="lnk" onClick={() => setShowAll(true)}>
            Lihat daftarnya
          </button>
        </div>
        <ActionBar>
          <button className="btn" type="button" onClick={p.onDone}>
            Selesai
          </button>
        </ActionBar>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <section className="row" style={{ gap: 12 }} aria-label="Sumber">
        <Thumb preview={p.preview} onZoom={p.onZoom} size={44} />
        <div className="col sp" style={{ gap: 2, minWidth: 0 }}>
          <h2 className="t b">Ketemu {p.rows.length} transaksi</h2>
          <p className="s mut" style={{ overflowWrap: "anywhere" }}>
            {checkCount ? `${checkCount} perlu dicek · ` : ""}
            {p.isPdf ? p.fileName : "dari gambar yang kamu unggah"}
          </p>
        </div>
      </section>

      {p.result.partial && (
        <p className="scan-note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            Baru {p.result.partial.read} dari {p.result.partial.of} bagian dokumen yang terbaca karena layanan sedang ramai. Unggah lagi nanti untuk sisanya.
          </span>
        </p>
      )}

      <div className="filter-row" role="group" aria-label="Saring transaksi">
        {filters.map((f) => (
          <button key={f.id} type="button" className={`chip${filter === f.id ? " on" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} disabled={f.n === 0 && f.id !== "all"}>
            {f.label} <span className="mut">{f.n}</span>
          </button>
        ))}
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}>
        <button
          type="button"
          className="lnk"
          onClick={() => {
            const allOn = visible.every(({ r }) => r.keep);
            const ids = new Set(visible.map(({ i }) => i));
            p.setRows((rs) => rs.map((r, k) => (ids.has(k) ? { ...r, keep: !allOn } : r)));
          }}
        >
          {visible.every(({ r }) => r.keep) ? "Jangan simpan yang tampil" : "Centang semua yang tampil"}
        </button>
        <button type="button" className="lnk" onClick={() => setBulk(true)} disabled={!kept.length}>
          <Tags size={16} aria-hidden="true" /> Kategori sekaligus
        </button>
      </div>

      {[...groups.entries()].map(([day, list]) => (
        <section key={day} className="tx-day" aria-label={day === "none" ? "Tanpa tanggal" : formatDayHeading(day, p.today)}>
          <h3 className="sec">{day === "none" ? "Tanpa tanggal · dicatat hari ini" : formatDayHeading(day, p.today)}</h3>
          <ul>
            {list.map(({ r, i }) => {
              const cat = p.catById.get(r.category_id);
              const reason = r.duplicate && r.match ? matchText(r.match) : r.transfer ? TRANSFER_REASON[r.transfer] : !r.date ? "Tanggal tidak terbaca" : null;
              const sign = r.type === "income" ? "+" : "−";
              return (
                <li key={i} className={`tx-row${r.keep ? "" : " off"}`}>
                  <label className="tx-check">
                    <input
                      type="checkbox"
                      checked={r.keep}
                      onChange={(e) => update(i, { keep: e.target.checked })}
                      aria-label={`Simpan ${r.description}, ${sign}${formatRupiah(r.amount)}${r.date ? `, ${formatDayMonth(r.date)}` : ""}`}
                      aria-describedby={reason ? `why-${i}` : undefined}
                    />
                    <span className="tx-box" aria-hidden="true">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  </label>
                  <button type="button" className="tx-body" onClick={() => setEditIndex(i)} aria-label={`Ubah ${r.description}`}>
                    <span className="tx-main">
                      <span className="tx-desc">{r.description}</span>
                      <span className={`tx-amt num${r.type === "income" ? " pos" : ""}`}>
                        {sign}
                        {formatRupiah(r.amount)}
                      </span>
                    </span>
                    <span className="tx-sub">
                      <CategoryIcon icon={cat?.icon ?? "lainnya"} size={14} />
                      <span>{cat?.name ?? "Lainnya"}</span>
                      {!r.keep && <span className="mut">· tidak disimpan</span>}
                    </span>
                    {reason && (
                      <span id={`why-${i}`} className="tx-why">
                        {r.transfer ? <ArrowLeftRight size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
                        {reason}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <ErrorNote message={p.error} />

      <ActionBar>
        <p className="scan-bar-sum num">
          <span>
            Masuk <b className="pos">+{formatRupiah(income)}</b>
          </span>
          <span>
            Keluar <b>−{formatRupiah(expense)}</b>
          </span>
        </p>
        <button className="btn" type="button" disabled={p.saving || !kept.length} onClick={p.onSave}>
          {p.saving ? <Spinner label="Menyimpan" /> : kept.length ? `Simpan ${kept.length} transaksi` : "Centang yang mau disimpan"}
        </button>
      </ActionBar>

      {editIndex !== null && p.rows[editIndex] && (
        <RowEditor
          row={p.rows[editIndex]}
          categories={p.categories}
          today={p.today}
          onClose={() => setEditIndex(null)}
          onSave={(patch) => {
            update(editIndex, { ...patch, keep: true });
            setEditIndex(null);
          }}
        />
      )}

      <BulkCategory
        open={bulk}
        onOpenChange={setBulk}
        categories={p.categories}
        counts={{ expense: kept.filter((r) => r.type === "expense").length, income: kept.filter((r) => r.type === "income").length }}
        onApply={(type, id) => p.setRows((rs) => rs.map((r) => (r.keep && r.type === type ? { ...r, category_id: id } : r)))}
      />
    </div>
  );
}

function RowEditor({ row, categories, today, onClose, onSave }: { row: Row; categories: Category[]; today: string; onClose: () => void; onSave: (patch: Partial<Row>) => void }) {
  const [type, setType] = useState<TxType>(row.type);
  const [amount, setAmount] = useState<number | null>(row.amount);
  const [description, setDescription] = useState(row.description);
  const [date, setDate] = useState(row.date ?? today);
  const [categoryId, setCategoryId] = useState(row.category_id);
  const cats = categories.filter((c) => c.type === type);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Ubah transaksi">
      <form
        className="col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!amount || amount <= 0) return;
          const cat = cats.some((c) => c.id === categoryId) ? categoryId : (cats.find((c) => c.name === "Lainnya")?.id ?? cats[0]?.id ?? categoryId);
          onSave({ type, amount, description: description.trim() || row.description, date, category_id: cat, transfer: null, duplicate: false, match: null });
        }}
      >
        <Segmented
          label="Jenis"
          options={[
            { value: "expense", label: "Keluar" },
            { value: "income", label: "Masuk" },
          ]}
          value={type}
          onChange={setType}
        />
        <Field label="Jumlah" htmlFor="row-amount" error={!amount ? "Isi jumlahnya" : undefined}>
          <AmountInput id="row-amount" value={amount} onValueChange={setAmount} placeholder="0" />
        </Field>
        <Field label="Keterangan" htmlFor="row-desc">
          <input id="row-desc" className="inp" maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Tanggal" htmlFor="row-date">
          <input id="row-date" className="inp" type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <div className="col" style={{ gap: 8 }}>
          <p className="lbl" style={{ marginBottom: 0 }}>
            Kategori
          </p>
          <div className="cat-grid" role="group" aria-label="Kategori">
            {cats.map((c) => (
              <button key={c.id} type="button" className="opt" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                <span className="opt-icon" style={{ background: "var(--pris)", color: "var(--onpris)" }}>
                  <CategoryIcon icon={c.icon} size={18} />
                </span>
                <span className="opt-label">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
        <button className="btn" type="submit" disabled={!amount}>
          Pakai perubahan
        </button>
      </form>
    </Sheet>
  );
}

function BulkCategory({ open, onOpenChange, categories, counts, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; categories: Category[]; counts: { expense: number; income: number }; onApply: (type: TxType, id: string) => void }) {
  const [type, setType] = useState<TxType>(counts.expense ? "expense" : "income");
  const cats = categories.filter((c) => c.type === type);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Kategori sekaligus" subtitle={`Untuk ${counts[type]} transaksi ${type === "expense" ? "keluar" : "masuk"} yang dicentang`}>
      <Segmented
        label="Jenis"
        options={[
          { value: "expense", label: `Keluar (${counts.expense})` },
          { value: "income", label: `Masuk (${counts.income})` },
        ]}
        value={type}
        onChange={setType}
      />
      <div className="cat-grid" role="group" aria-label="Kategori">
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            className="opt"
            disabled={!counts[type]}
            onClick={() => {
              onApply(type, c.id);
              onOpenChange(false);
            }}
          >
            <span className="opt-icon" style={{ background: "var(--pris)", color: "var(--onpris)" }}>
              <CategoryIcon icon={c.icon} size={18} />
            </span>
            <span className="opt-label">{c.name}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function Fail({
  phase,
  canRetry,
  onRetry,
  onRetake,
  onUpload,
  onManual,
}: {
  phase: Extract<Phase, { name: "fail" }>;
  canRetry: boolean;
  onRetry: () => void;
  onRetake: () => void;
  onUpload: () => void;
  onManual: (amount?: number) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!phase.retryAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [phase.retryAt]);
  const wait = phase.retryAt ? Math.max(0, Math.ceil((phase.retryAt - now) / 1000)) : 0;

  if (phase.reason === "busy") {
    return (
      <div className="col" style={{ gap: 18 }}>
        <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 10, marginTop: 24 }}>
          <span className="icb am" style={{ width: 64, height: 64, borderRadius: 20 }}>
            <ScanLine size={28} aria-hidden="true" />
          </span>
          <h2 className="h2">Layanan scan lagi penuh</h2>
          <p className="t mut">{phase.message} Fotomu tidak hilang, kita coba lagi sebentar.</p>
        </div>
        <ActionBar>
          <button className="btn" type="button" disabled={!canRetry || wait > 0} onClick={onRetry}>
            {wait > 0 ? `Coba lagi dalam ${wait} detik` : "Coba lagi"}
          </button>
          <button className="lnk scan-bar-link" type="button" onClick={() => onManual()}>
            Isi manual saja
          </button>
        </ActionBar>
      </div>
    );
  }

  const unreadable = phase.reason === "unreadable";
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 10, marginTop: 12 }}>
        <span className="icb am" style={{ width: 64, height: 64, borderRadius: 20 }}>
          <ScanLine size={28} aria-hidden="true" />
        </span>
        <h2 className="h2">{unreadable ? "Struknya belum terbaca" : "Belum berhasil membaca"}</h2>
        <p className="t mut">{unreadable ? "Sering terjadi kalau struknya kusut, tintanya pudar, atau bukan struk/mutasi. Coba ini:" : phase.message}</p>
      </div>
      {unreadable && (
        <ul className="scan-tips">
          {[
            [Sun, "Foto di tempat yang lebih terang"],
            [ScanLine, "Masukkan seluruh struk ke dalam foto"],
            [Lightbulb, "Ratakan struk supaya tidak terlipat"],
          ].map(([Icon, text]) => {
            const I = Icon as typeof Sun;
            return (
              <li key={text as string}>
                <I size={16} aria-hidden="true" />
                {text as string}
              </li>
            );
          })}
        </ul>
      )}
      {phase.total ? (
        <section className="receipt-card" style={{ gap: 8 }}>
          <p className="s mut">Yang sempat terbaca</p>
          <p className="h2 num">Total {formatRupiah(phase.total)}</p>
          <button className="btn sm ghost" type="button" style={{ alignSelf: "flex-start" }} onClick={() => onManual(phase.total ?? undefined)}>
            Catat manual dengan angka ini
          </button>
        </section>
      ) : null}
      <ActionBar>
        <button className="btn" type="button" onClick={onRetake}>
          <Camera size={18} aria-hidden="true" /> Foto ulang
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sp" type="button" onClick={onUpload}>
            <ImageUp size={18} aria-hidden="true" /> Unggah file lain
          </button>
          <button className="btn ghost sp" type="button" onClick={() => onManual()}>
            Isi manual
          </button>
        </div>
      </ActionBar>
    </div>
  );
}
