"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLine, ArrowUpFromLine, Check, Pause, Pencil, Play, ShoppingBag, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useApp } from "./app-provider";
import { InlineError, useToast } from "./toast";
import { AmountInput, Chip, ErrorNote, Field, Spinner } from "./ui/controls";
import { CategoryIcon, GoalIcon } from "./ui/icons";
import { Sheet } from "./ui/sheet";
import { formatLongDate, formatMonthYear, isValidDate } from "@/lib/date";
import { toAppError } from "@/lib/errors";
import { type RhythmOption, estimateCompletion, goalRemaining, milestoneCrossed, monthStatus, rhythmOptions } from "@/lib/goals";
import { MAX_AMOUNT, formatRupiah } from "@/lib/money";
import { GOAL_ICONS, GOAL_TEMPLATES, labelOf } from "@/lib/options";
import { contributionError } from "@/lib/rules";
import { contributionInput, firstError, goalInput } from "@/lib/schemas";
import type { Category, Contribution, Goal } from "@/lib/types";

/** Message for a failed save; null when the session-expired sheet already explains it. */
function failMessage(e: unknown, fallback: string): string | null {
  const err = toAppError(e, fallback);
  if (err.kind === "session") return null;
  return err.kind === "rejected" || err.kind === "offline" || err.kind === "limit" ? err.message : fallback;
}

const SAVE_FAILED = "Gagal menyimpan. Periksa koneksimu lalu coba lagi.";

// ---------------------------------------------------------------------------
// New goal / Atur tujuan
// ---------------------------------------------------------------------------

const formSchema = z.object({
  title: z.string().trim().min(1, "Nama tujuan wajib diisi").max(60, "Maksimal 60 karakter"),
  target_amount: z
    .number({ error: "Masukkan target dalam rupiah" })
    .int()
    .positive("Target harus lebih dari 0")
    .max(MAX_AMOUNT, "Target terlalu besar")
    .nullable()
    .refine((v) => v !== null, "Masukkan target dalam rupiah"),
  target_date: z.string().refine((v) => v === "" || isValidDate(v), "Tanggal tidak valid"),
  category: z.string().min(1),
  description: z.string().max(200, "Maksimal 200 karakter"),
});
type FormValues = z.input<typeof formSchema>;

/** Create a goal (optionally starting from a template), or edit one (with pause/resume and delete). */
export function GoalFormSheet({ open, onOpenChange, goal, template }: { open: boolean; onOpenChange: (o: boolean) => void; goal?: Goal; template?: string }) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the sheet opens
    if (open) setDirty(false);
  }, [open]);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? "Atur tujuan" : "Tujuan baru"}
      dirty={dirty}
      discardText={goal ? "Perubahan pada tujuan ini belum disimpan." : "Tujuan yang sedang kamu buat belum disimpan."}
    >
      <GoalForm key={`${goal?.id ?? "new"}-${template ?? ""}-${open}`} goal={goal} template={template} onDirty={setDirty} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

function GoalForm({ goal, template, onDirty, onDone }: { goal?: Goal; template?: string; onDirty: (d: boolean) => void; onDone: () => void }) {
  const { mutate, today } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickIcon, setPickIcon] = useState(false);
  const tpl = GOAL_TEMPLATES.find((t) => t.key === template);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: goal?.title ?? tpl?.title ?? "",
      target_amount: goal?.target_amount ?? tpl?.target ?? null,
      target_date: goal?.target_date ?? "",
      category: goal?.category ?? tpl?.icon ?? "target",
      description: goal?.description ?? "",
    },
  });
  const category = useWatch({ control, name: "category" });
  const title = useWatch({ control, name: "title" });
  useEffect(() => onDirty(isDirty), [isDirty, onDirty]);

  const onSubmit = async (v: z.output<typeof formSchema>) => {
    setError(null);
    const parsed = goalInput.safeParse({
      title: v.title,
      target_amount: v.target_amount,
      target_date: v.target_date || null,
      category: v.category,
      description: v.description,
      priority: goal?.priority ?? 2,
      monthly_plan: goal?.monthly_plan ?? null,
    });
    if (!parsed.success) return setError(firstError(parsed.error));
    try {
      if (goal) {
        const { title: t, target_amount, target_date, category: cat, description } = parsed.data;
        await mutate((s) => s.updateGoal(goal.id, { title: t, target_amount, target_date, category: cat, description }));
        toast.success("Tujuan tersimpan.");
        onDirty(false);
        onDone();
      } else {
        const id = await mutate((s) => s.addGoal(parsed.data));
        toast.success("Tujuan baru dibuat. Langkah pertama sudah jalan.");
        onDirty(false);
        onDone();
        router.push(`/tujuan/${id}`);
      }
    } catch (e) {
      setError(failMessage(e, SAVE_FAILED));
    }
  };

  const setStatus = async (status: "active" | "paused") => {
    if (!goal) return;
    setBusy(true);
    setError(null);
    try {
      await mutate((s) => s.updateGoal(goal.id, { status }));
      toast.success(status === "paused" ? "Tujuan dijeda. Saldonya tetap aman." : "Tujuan dilanjutkan.");
      onDirty(false);
      onDone();
    } catch (e) {
      setError(failMessage(e, SAVE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!goal) return;
    setBusy(true);
    try {
      await mutate((s) => s.deleteGoal(goal.id));
      toast.success("Tujuan dihapus.");
      onDirty(false);
      onDone();
      router.replace("/tujuan");
    } catch (e) {
      setError(failMessage(e, "Gagal menghapus. Coba lagi."));
      setBusy(false);
    }
  };

  const applyTemplate = (key: string) => {
    const t = GOAL_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setValue("title", t.title, { shouldValidate: true, shouldDirty: true });
    setValue("category", t.icon, { shouldDirty: true });
    if (t.target) setValue("target_amount", t.target, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      {!goal && (
        <div className="col" style={{ gap: 8 }}>
          <p className="lbl" id="tpl-label" style={{ marginBottom: 0 }}>
            Mulai dari contoh
          </p>
          <div className="wrap" role="group" aria-labelledby="tpl-label">
            {GOAL_TEMPLATES.map((t) => (
              <Chip key={t.key} on={title === t.title} check onClick={() => applyTemplate(t.key)}>
                {t.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <Field label="Nama tujuan" htmlFor="g-title" error={errors.title?.message}>
        <input id="g-title" className="inp" maxLength={60} aria-invalid={!!errors.title} placeholder="Misalnya: Laptop baru" {...register("title")} />
      </Field>
      <div className="icon-pick">
        <span className="icb g" aria-hidden="true">
          <GoalIcon icon={category} />
        </span>
        <span className="s sp">
          Ikon: <span className="b">{labelOf(GOAL_ICONS, category)}</span>
        </span>
        <button type="button" className="lnk" aria-expanded={pickIcon} aria-controls="g-icons" onClick={() => setPickIcon((v) => !v)}>
          {pickIcon ? "Selesai" : "Ganti ikon"}
        </button>
      </div>
      {pickIcon && (
        <div id="g-icons" className="wrap" role="group" aria-label="Pilih ikon">
          {GOAL_ICONS.filter((o) => o.value !== "lainnya").map((o) => (
            <Chip key={o.value} on={category === o.value} onClick={() => setValue("category", o.value, { shouldDirty: true })}>
              <GoalIcon icon={o.value} size={16} />
              {o.label}
            </Chip>
          ))}
        </div>
      )}
      <Field label="Target" htmlFor="g-target" error={errors.target_amount?.message}>
        <Controller
          control={control}
          name="target_amount"
          render={({ field }) => (
            <AmountInput id="g-target" placeholder="Misalnya 5.000.000" value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} aria-invalid={!!errors.target_amount} />
          )}
        />
      </Field>
      <Field label="Mau tercapai kapan? (opsional)" htmlFor="g-date" error={errors.target_date?.message} hint="Dipakai untuk menghitung tabungan per bulan.">
        <input id="g-date" type="date" className="inp" min={today} {...register("target_date")} />
      </Field>
      <Field label="Catatan (opsional)" htmlFor="g-desc" error={errors.description?.message}>
        <input id="g-desc" className="inp" maxLength={200} {...register("description")} />
      </Field>

      {goal && (
        <section className="col" style={{ gap: 8, marginTop: 6 }} aria-labelledby="g-more">
          <h3 id="g-more" className="lbl" style={{ marginBottom: 0 }}>
            Lainnya
          </h3>
          {goal.status !== "completed" && (
            <button className="btn ghost sm" type="button" disabled={busy} onClick={() => setStatus(goal.status === "paused" ? "active" : "paused")}>
              {goal.status === "paused" ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
              {goal.status === "paused" ? "Lanjutkan tujuan" : "Jeda dulu"}
            </button>
          )}
          {confirmDelete ? (
            <div className="discard" role="alertdialog" aria-labelledby="g-del-title">
              <p id="g-del-title" className="t b">
                Hapus tujuan ini?
              </p>
              <p className="s mut">Riwayat setorannya ikut terhapus dan tidak bisa dikembalikan.</p>
              <div className="g2">
                <button type="button" className="btn ghost sm" autoFocus onClick={() => setConfirmDelete(false)}>
                  Batal
                </button>
                <button type="button" className="btn danger sm" disabled={busy} onClick={remove}>
                  Ya, hapus
                </button>
              </div>
            </div>
          ) : (
            <button className="btn ghost sm danger-text" type="button" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={18} aria-hidden="true" />
              Hapus tujuan
            </button>
          )}
        </section>
      )}

      <div className="sheet-foot">
        <ErrorNote message={error} />
        <button className="btn" type="submit" disabled={isSubmitting || busy}>
          {isSubmitting ? <Spinner label="Menyimpan" /> : goal ? "Simpan perubahan" : "Buat tujuan"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Setor, Tarik, Pakai uangnya, and an entry's details (Ubah / Hapus)
// ---------------------------------------------------------------------------

export type MoneyKind = "deposit" | "withdrawal" | "spend";

const KIND_NAME: Record<MoneyKind, string> = { deposit: "Setoran", withdrawal: "Penarikan", spend: "Pemakaian" };

/** Expense category a goal's money is most likely spent on. */
const SPEND_CATEGORY: Record<string, string> = { laptop: "belanja", motor: "transport", liburan: "hiburan", pendidikan: "pendidikan", utang: "utang" };

function shortRupiah(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `Rp${(a / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (a >= 1_000) return `Rp${Math.round(a / 1_000).toLocaleString("id-ID")} rb`;
  return formatRupiah(a);
}

interface MoneySheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal: Goal;
  /** What a new entry records. */
  kind: MoneyKind;
  /** An existing entry: the sheet opens on its details. */
  item?: Contribution;
}

export function ContributionSheet({ open, onOpenChange, goal, kind, item }: MoneySheetProps) {
  const [mode, setMode] = useState<"detail" | "form">(item ? "detail" : "form");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new open starts from the right view
    setMode(item ? "detail" : "form");
    setDirty(false);
  }, [open, item]);

  const k = item?.kind ?? kind;
  const title =
    mode === "detail"
      ? `Detail ${KIND_NAME[k].toLowerCase()}`
      : item
        ? `Ubah ${KIND_NAME[k].toLowerCase()}`
        : k === "deposit"
          ? "Setor ke tujuan"
          : k === "withdrawal"
            ? "Tarik dari tujuan"
            : "Pakai uangnya";
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={`${goal.title} · saldo ${formatRupiah(goal.current_amount)}`}
      dirty={mode === "form" && dirty}
      discardText="Jumlah yang sedang kamu isi belum disimpan."
    >
      {mode === "detail" && item ? (
        <ContributionDetail goal={goal} item={item} onEdit={() => setMode("form")} onDone={() => onOpenChange(false)} />
      ) : (
        <ContributionForm
          key={`${item?.id ?? k}-${open}`}
          goal={goal}
          kind={k}
          edit={item}
          onDirty={setDirty}
          onDone={() => {
            setDirty(false);
            onOpenChange(false);
          }}
        />
      )}
    </Sheet>
  );
}

function ContributionDetail({ goal, item, onEdit, onDone }: { goal: Goal; item: Contribution; onEdit: () => void; onDone: () => void }) {
  const { mutate } = useApp();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deposit = item.kind === "deposit";
  const spend = item.kind === "spend";

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { kind, amount, note, contribution_date } = item;
    try {
      await mutate((s) => s.deleteContribution(goal.id, item.id));
      onDone();
      if (spend) toast.success("Catatan pemakaian dihapus.");
      else
        toast.success(`${KIND_NAME[kind]} dihapus.`, {
          label: "Urungkan",
          run: () => {
            mutate((s) => s.addContribution(goal.id, { kind, amount, note, contribution_date }))
              .then(() => toast.success(`${KIND_NAME[kind]} dikembalikan.`))
              .catch((e) => toast.error(toAppError(e).message));
          },
        });
    } catch (e) {
      setError(failMessage(e, "Gagal menghapus. Coba lagi."));
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="tx-detail">
        <span className={`icb ${deposit ? "g" : "am"}`} style={{ width: 52, height: 52, borderRadius: 16 }}>
          {deposit ? <ArrowDownToLine size={24} aria-hidden="true" /> : spend ? <ShoppingBag size={24} aria-hidden="true" /> : <ArrowUpFromLine size={24} aria-hidden="true" />}
        </span>
        <p className={`num tx-detail-amt${deposit ? " pos" : ""}`}>
          {deposit ? "+" : "−"}
          {formatRupiah(item.amount)}
        </p>
        <p className="t b">{item.note || KIND_NAME[item.kind]}</p>
      </div>
      <dl className="tx-facts">
        <div>
          <dt>Jenis</dt>
          <dd>{spend ? "Uang tujuan dipakai" : KIND_NAME[item.kind]}</dd>
        </div>
        <div>
          <dt>Tanggal</dt>
          <dd>{formatLongDate(item.contribution_date)}</dd>
        </div>
        {spend && (
          <div>
            <dt>Di Transaksi</dt>
            <dd>{item.transaction_id ? "Dicatat sebagai pengeluaran" : "Tidak dicatat"}</dd>
          </div>
        )}
      </dl>
      <InlineError message={error} />
      {confirm ? (
        <div className="discard" role="alertdialog" aria-labelledby="c-del-title">
          <p id="c-del-title" className="t b">
            Hapus catatan ini?
          </p>
          <p className="s mut">
            {spend
              ? item.transaction_id
                ? "Pengeluarannya di Transaksi ikut terhapus, dan uangnya kembali ke saldo tujuan."
                : "Uangnya kembali ke saldo tujuan."
              : "Saldo tujuan dihitung ulang. Masih bisa diurungkan sesaat setelah dihapus."}
          </p>
          <div className="g2">
            <button type="button" className="btn ghost sm" autoFocus onClick={() => setConfirm(false)}>
              Batal
            </button>
            <button type="button" className="btn danger sm" onClick={remove} disabled={busy}>
              {busy ? <Spinner label="Menghapus" /> : "Ya, hapus"}
            </button>
          </div>
        </div>
      ) : (
        <div className="sheet-foot">
          {!spend && (
            <button type="button" className="btn" onClick={onEdit}>
              <Pencil size={18} aria-hidden="true" />
              Ubah
            </button>
          )}
          <button type="button" className={spend ? "btn" : "btn ghost"} onClick={() => setConfirm(true)}>
            <Trash2 size={18} aria-hidden="true" />
            Hapus
          </button>
        </div>
      )}
    </div>
  );
}

function ContributionForm({ goal, kind, edit, onDirty, onDone }: { goal: Goal; kind: MoneyKind; edit?: Contribution; onDirty: (d: boolean) => void; onDone: () => void }) {
  const { data, mutate, today, online } = useApp();
  const toast = useToast();
  const month = monthStatus(goal);
  const remaining = goalRemaining(goal);
  const initialAmount = edit ? edit.amount : kind === "deposit" ? month?.left || goal.monthly_plan || null : kind === "spend" ? goal.current_amount : null;
  const [amount, setAmount] = useState<number | null>(initialAmount);
  const [note, setNote] = useState(edit?.note ?? "");
  const [date, setDate] = useState(edit?.contribution_date ?? today);
  const expenseCats = data.categories.filter((c) => c.type === "expense");
  const defaultCat = expenseCats.find((c) => c.icon === (SPEND_CATEGORY[goal.category] ?? "lainnya")) ?? expenseCats[0];
  const [record, setRecord] = useState(true);
  const [categoryId, setCategoryId] = useState<string | undefined>(defaultCat?.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onDirty(amount !== initialAmount || note !== (edit?.note ?? "") || date !== (edit?.contribution_date ?? today));
  }, [amount, note, date, initialAmount, edit, today, onDirty]);

  // Quick amounts: what keeps this month's rhythm, and what finishes the goal.
  const quick: { label: string; value: number }[] = [];
  if (kind === "deposit" && !edit) {
    if (month && month.left > 0) quick.push({ label: `Bulan ini ${shortRupiah(month.left)}`, value: month.left });
    if (remaining > 0 && remaining !== month?.left) quick.push({ label: `Lunasi ${shortRupiah(remaining)}`, value: remaining });
  }
  const max = kind === "deposit" ? undefined : edit ? goal.current_amount + edit.amount : goal.current_amount;

  const submit = async () => {
    setError(null);
    if (!amount) return setError("Masukkan jumlahnya dulu.");
    if (edit) {
      setBusy(true);
      const before = { amount: edit.amount, note: edit.note, contribution_date: edit.contribution_date };
      try {
        await mutate((s) => s.updateContribution(goal.id, edit.id, { amount, note: note.trim() || null, contribution_date: date }));
        onDone();
        toast.success("Perubahan tersimpan.", {
          label: "Urungkan",
          run: () => {
            mutate((s) => s.updateContribution(goal.id, edit.id, before))
              .then(() => toast.success("Perubahan dibatalkan."))
              .catch((e) => toast.error(toAppError(e).message));
          },
        });
      } catch (e) {
        setError(failMessage(e, SAVE_FAILED));
        setBusy(false);
      }
      return;
    }
    const parsed = contributionInput.safeParse({ kind, amount, note, contribution_date: date, category_id: kind === "spend" && record ? categoryId : null });
    if (!parsed.success) return setError(firstError(parsed.error));
    const rule = contributionError(goal, parsed.data);
    if (rule) return setError(rule);
    setBusy(true);
    try {
      const id = await mutate((s) => s.addContribution(goal.id, parsed.data));
      onDone();
      const value = parsed.data.amount;
      let message = `${KIND_NAME[kind]} ${formatRupiah(value)} tercatat.`;
      if (kind === "deposit") {
        const after = goal.current_amount + value;
        const crossed = milestoneCrossed(goal.target_amount, goal.current_amount, after);
        if (after >= goal.target_amount) message = `Tujuan tercapai! ${goal.title} sudah terkumpul penuh.`;
        else if (crossed) message = `${formatRupiah(value)} masuk. Sudah ${crossed}% jalan, lanjutkan!`;
        else if (month && month.left > 0 && value >= month.left) message = `${formatRupiah(value)} masuk. Ritme bulan ini sudah aman.`;
      } else if (kind === "spend") {
        message = record ? `Dipakai ${formatRupiah(value)}, dicatat di Transaksi.` : `Dipakai ${formatRupiah(value)}.`;
      }
      toast.success(message, {
        label: "Urungkan",
        run: () => {
          mutate((s) => s.deleteContribution(goal.id, id))
            .then(() => toast.success("Dibatalkan."))
            .catch((e) => toast.error(toAppError(e).message));
        },
      });
    } catch (e) {
      setError(failMessage(e, SAVE_FAILED));
      setBusy(false);
    }
  };

  const help =
    kind === "deposit"
      ? "Uang ini disisihkan dari sisa uangmu. Financer hanya mencatat; uangnya tetap di rekening atau dompetmu."
      : kind === "withdrawal"
        ? "Uangnya kembali ke sisa uangmu. Tujuan tetap jalan dengan saldo yang lebih kecil."
        : null;

  let submitLabel = "Simpan perubahan";
  if (!edit) {
    const verb = kind === "deposit" ? "Setor" : kind === "withdrawal" ? "Tarik" : "Pakai";
    submitLabel = amount ? `${verb} ${formatRupiah(amount)}` : kind === "spend" ? "Pakai uangnya" : verb;
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <Field label="Jumlah" htmlFor="c-amount" hint={max !== undefined ? `Maksimal ${formatRupiah(max)}` : undefined}>
        <AmountInput id="c-amount" placeholder="Misalnya 500.000" value={amount} onValueChange={setAmount} />
      </Field>
      {quick.length > 0 && (
        <div className="wrap" role="group" aria-label="Jumlah cepat">
          {quick.map((q) => (
            <Chip key={q.label} on={amount === q.value} check onClick={() => setAmount(q.value)}>
              {q.label}
            </Chip>
          ))}
        </div>
      )}

      {kind === "spend" && !edit && (
        <div className="col" style={{ gap: 10 }}>
          <button type="button" role="switch" aria-checked={record} className={`tile switch-tile${record ? " on" : ""}`} onClick={() => setRecord((v) => !v)}>
            <span className="col sp" style={{ gap: 0, textAlign: "left" }}>
              <span className="t b">Catat juga sebagai pengeluaran</span>
              <span className="s" style={{ fontWeight: 500 }}>
                {record ? "Masuk ke Transaksi, sisa uangmu tetap pas." : "Uangnya kembali ke sisa uangmu."}
              </span>
            </span>
            <span className="switch" aria-hidden="true">
              <i />
            </span>
          </button>
          {record && expenseCats.length > 0 && <CategoryPick categories={expenseCats} value={categoryId} onChange={setCategoryId} />}
        </div>
      )}

      <Field label="Tanggal" htmlFor="c-date">
        <input id="c-date" type="date" className="inp" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
      <Field label="Catatan (opsional)" htmlFor="c-note">
        <input
          id="c-note"
          className="inp"
          maxLength={120}
          placeholder={kind === "deposit" ? "Misalnya: dari gaji" : kind === "spend" ? "Misalnya: beli laptopnya" : "Misalnya: servis motor"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {help && !edit && <p className="s mut pretty">{help}</p>}

      <div className="sheet-foot">
        <ErrorNote message={error} />
        {!online && <p className="s mut" style={{ textAlign: "center" }}>Kamu sedang offline. Isianmu tetap di sini; simpan setelah online lagi.</p>}
        <button className="btn" type="submit" disabled={busy || !online}>
          {busy ? <Spinner label="Menyimpan" /> : submitLabel}
        </button>
      </div>
    </form>
  );
}

function CategoryPick({ categories, value, onChange }: { categories: Category[]; value: string | undefined; onChange: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const current = categories.find((c) => c.id === value);
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="icon-pick" style={{ marginTop: 0 }}>
        <span className="icb" aria-hidden="true">
          <CategoryIcon icon={current?.icon ?? "lainnya"} />
        </span>
        <span className="s sp">
          Kategori: <span className="b">{current?.name ?? "Pilih kategori"}</span>
        </span>
        <button type="button" className="lnk" aria-expanded={all} aria-controls="c-cats" onClick={() => setAll((v) => !v)}>
          {all ? "Selesai" : "Ganti"}
        </button>
      </div>
      {all && (
        <div id="c-cats" className="wrap" role="group" aria-label="Kategori pengeluaran">
          {categories.map((c) => (
            <Chip
              key={c.id}
              on={value === c.id}
              onClick={() => {
                onChange(c.id);
                setAll(false);
              }}
            >
              <CategoryIcon icon={c.icon} size={16} />
              {c.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ritme nabung
// ---------------------------------------------------------------------------

const KIND_TAG: Record<RhythmOption["kind"], string> = { on_time: "Tepat waktu", current: "Sekarang", lighter: "Lebih ringan", faster: "Lebih cepat" };

export function RhythmSheet({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (o: boolean) => void; goal: Goal }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Ritme nabung" subtitle={`${goal.title} · kurang ${formatRupiah(goalRemaining(goal))}`}>
      <RhythmForm key={String(open)} goal={goal} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

function RhythmForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const { mutate, today } = useApp();
  const toast = useToast();
  const options = rhythmOptions(goal, today);
  const [selected, setSelected] = useState<number | null>(goal.monthly_plan ?? options[0]?.monthly ?? null);
  const [custom, setCustom] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const remaining = goalRemaining(goal);
  const chosen = custom ?? selected;
  const customEstimate = custom ? estimateCompletion(remaining, custom, today) : null;
  const checkedIndex = custom === null ? options.findIndex((o) => o.monthly === selected) : -1;

  // Radio-group keys: arrows move the choice, focus follows.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key) || options.length === 0) return;
    e.preventDefault();
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    const next = (Math.max(0, checkedIndex) + step + options.length) % options.length;
    setCustom(null);
    setSelected(options[next].monthly);
    group.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  };

  const save = async () => {
    if (!chosen) return setError("Pilih atau tulis jumlah per bulan.");
    if (chosen > MAX_AMOUNT) return setError("Jumlah terlalu besar.");
    setBusy(true);
    setError(null);
    try {
      await mutate((s) => s.updateGoal(goal.id, { monthly_plan: chosen }));
      toast.success(`Ritme nabung ${formatRupiah(chosen)} per bulan tersimpan.`);
      onDone();
    } catch (e) {
      setError(failMessage(e, SAVE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="s mut pretty">Berapa yang mau kamu sisihkan tiap bulan? Pilih salah satu, atau tulis sendiri.</p>
      {options.length === 0 && <p className="s mut pretty">Tujuan ini belum punya tanggal target, jadi belum ada pilihan otomatis. Tulis jumlah per bulan di bawah.</p>}
      <div ref={group} role="radiogroup" aria-label="Pilihan ritme" className="flex flex-col gap-3" onKeyDown={onKey}>
        {options.map((o, i) => {
          const on = i === checkedIndex;
          return (
            <button
              key={o.monthly}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (checkedIndex < 0 && i === 0) ? 0 : -1}
              className={`tile${on ? " on" : ""}`}
              style={{ minHeight: 72, justifyContent: "space-between" }}
              onClick={() => {
                setCustom(null);
                setSelected(o.monthly);
              }}
            >
              <span className="col" style={{ gap: 0 }}>
                <span className="h3 num">{formatRupiah(o.monthly)} / bulan</span>
                <span className={`s${on ? "" : " mut"}`} style={{ fontWeight: 500 }}>
                  {o.months} bulan · selesai {formatMonthYear(o.date)}
                </span>
              </span>
              <span className={`tag${o.kind === "lighter" || o.kind === "faster" ? " neu" : ""}`} style={on ? { background: "var(--sf)" } : undefined}>
                {on && <Check size={14} aria-hidden="true" />}
                {KIND_TAG[o.kind]}
              </span>
            </button>
          );
        })}
      </div>
      <Field label="Atau tulis jumlah sendiri" htmlFor="r-custom" hint={customEstimate ? `${customEstimate.months} bulan · selesai ${formatMonthYear(customEstimate.date)}` : undefined}>
        <AmountInput id="r-custom" placeholder="Jumlah per bulan" value={custom} onValueChange={setCustom} />
      </Field>
      <p className="sr-only" aria-live="polite">
        {custom ? `Jumlah sendiri ${formatRupiah(custom)} per bulan dipilih.` : ""}
      </p>
      <p className="s mut pretty">Telat itu nggak apa-apa. Perkiraan dibulatkan ke bulan penuh dan belum termasuk bunga tabungan.</p>
      <div className="sheet-foot">
        <ErrorNote message={error} />
        <button className="btn" type="button" disabled={busy || !chosen} onClick={save}>
          {busy ? <Spinner label="Menyimpan" /> : chosen ? `Pakai ${formatRupiah(chosen)} / bulan` : "Pakai ritme ini"}
        </button>
      </div>
    </div>
  );
}
