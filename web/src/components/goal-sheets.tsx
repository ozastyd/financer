"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Pause, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useApp } from "./app-provider";
import { AmountInput, Chip, ErrorNote, Field, Spinner } from "./ui/controls";
import { Sheet } from "./ui/sheet";
import { formatMonthYear, isValidDate } from "@/lib/date";
import { type RhythmOption, estimateCompletion, goalRemaining, rhythmOptions } from "@/lib/goals";
import { MAX_AMOUNT, formatRupiah } from "@/lib/money";
import { GOAL_ICONS, GOAL_TEMPLATES } from "@/lib/options";
import { contributionError } from "@/lib/rules";
import { contributionInput, firstError, goalInput } from "@/lib/schemas";
import type { Goal } from "@/lib/types";

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

/** Create a goal, or edit one (with pause/resume and delete). */
export function GoalFormSheet({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (o: boolean) => void; goal?: Goal }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={goal ? "Atur tujuan" : "Tujuan baru"}>
      <GoalForm goal={goal} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const { mutate, today } = useApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: goal?.title ?? "",
      target_amount: goal?.target_amount ?? null,
      target_date: goal?.target_date ?? "",
      category: goal?.category ?? "target",
      description: goal?.description ?? "",
    },
  });
  const category = useWatch({ control, name: "category" });

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
        const { title, target_amount, target_date, category: cat, description } = parsed.data;
        await mutate((s) => s.updateGoal(goal.id, { title, target_amount, target_date, category: cat, description }));
        onDone();
      } else {
        const id = await mutate((s) => s.addGoal(parsed.data));
        onDone();
        router.push(`/tujuan/${id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    }
  };

  const setStatus = async (status: "active" | "paused") => {
    if (!goal) return;
    setBusy(true);
    setError(null);
    try {
      await mutate((s) => s.updateGoal(goal.id, { status }));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!goal) return;
    setBusy(true);
    try {
      await mutate((s) => s.deleteGoal(goal.id));
      onDone();
      router.replace("/tujuan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus.");
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      {!goal && (
        <div className="col" style={{ gap: 8 }}>
          <p className="sec" id="tpl-label">
            Pilih cepat
          </p>
          <div className="wrap" role="group" aria-labelledby="tpl-label">
            {GOAL_TEMPLATES.map((t) => (
              <Chip
                key={t.key}
                onClick={() => {
                  setValue("title", t.title, { shouldValidate: true });
                  setValue("category", t.icon);
                  if (t.target) setValue("target_amount", t.target, { shouldValidate: true });
                }}
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <Field label="Nama tujuan" htmlFor="g-title" error={errors.title?.message}>
        <input id="g-title" className="inp" maxLength={60} aria-invalid={!!errors.title} placeholder="Misalnya: Laptop baru" {...register("title")} />
      </Field>
      <Field label="Target" htmlFor="g-target" error={errors.target_amount?.message}>
        <Controller
          control={control}
          name="target_amount"
          render={({ field }) => (
            <AmountInput id="g-target" placeholder="0" value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} aria-invalid={!!errors.target_amount} />
          )}
        />
      </Field>
      <Field label="Target tercapai (opsional)" htmlFor="g-date" error={errors.target_date?.message} hint="Dipakai untuk menghitung tabungan per bulan.">
        <input id="g-date" type="date" className="inp" min={today} {...register("target_date")} />
      </Field>
      <div className="col" style={{ gap: 8 }}>
        <p className="lbl" id="g-icon-label" style={{ marginBottom: 0 }}>
          Ikon
        </p>
        <div className="wrap" role="group" aria-labelledby="g-icon-label">
          {GOAL_ICONS.filter((o) => o.value !== "lainnya").map((o) => (
            <Chip key={o.value} on={category === o.value} check onClick={() => setValue("category", o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>
      <Field label="Catatan (opsional)" htmlFor="g-desc" error={errors.description?.message}>
        <input id="g-desc" className="inp" maxLength={200} {...register("description")} />
      </Field>
      <ErrorNote message={error} />
      <button className="btn" type="submit" disabled={isSubmitting || busy}>
        {isSubmitting ? <Spinner label="Menyimpan" /> : goal ? "Simpan perubahan" : "Buat tujuan"}
      </button>

      {goal && goal.status !== "completed" && (
        <button className="btn ghost" type="button" disabled={busy} onClick={() => setStatus(goal.status === "paused" ? "active" : "paused")}>
          {goal.status === "paused" ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
          {goal.status === "paused" ? "Lanjutkan tujuan" : "Jeda tujuan"}
        </button>
      )}
      {goal &&
        (confirmDelete ? (
          <div className="card amb" style={{ gap: 10 }}>
            <p className="s b">Hapus tujuan ini beserta riwayat setorannya? Tidak bisa dibatalkan.</p>
            <div className="g2">
              <button type="button" className="btn ghost sm" style={{ width: "100%" }} onClick={() => setConfirmDelete(false)}>
                Batal
              </button>
              <button type="button" className="btn danger sm" style={{ width: "100%" }} disabled={busy} onClick={remove}>
                Ya, hapus
              </button>
            </div>
          </div>
        ) : (
          <button className="btn danger" type="button" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} aria-hidden="true" />
            Hapus tujuan
          </button>
        ))}
    </form>
  );
}

/** Setor (deposit) or Tarik (withdraw). */
export function ContributionSheet({ open, onOpenChange, goal, kind }: { open: boolean; onOpenChange: (o: boolean) => void; goal: Goal; kind: "deposit" | "withdrawal" }) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "deposit" ? "Setor ke tujuan" : "Tarik dari tujuan"}
      subtitle={`${goal.title} · saldo ${formatRupiah(goal.current_amount)}`}
    >
      <ContributionForm goal={goal} kind={kind} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

function ContributionForm({ goal, kind, onDone }: { goal: Goal; kind: "deposit" | "withdrawal"; onDone: () => void }) {
  const { mutate, today } = useApp();
  const [amount, setAmount] = useState<number | null>(kind === "deposit" ? goal.monthly_plan : null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const parsed = contributionInput.safeParse({ kind, amount, note, contribution_date: date });
    if (!parsed.success) return setError(amount ? firstError(parsed.error) : "Masukkan jumlahnya dulu.");
    const rule = contributionError(goal, parsed.data);
    if (rule) return setError(rule);
    setBusy(true);
    try {
      await mutate((s) => s.addContribution(goal.id, parsed.data));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <Field label="Jumlah" htmlFor="c-amount" hint={kind === "withdrawal" ? `Maksimal ${formatRupiah(goal.current_amount)}` : undefined}>
        <AmountInput id="c-amount" placeholder="0" value={amount} onValueChange={setAmount} autoFocus />
      </Field>
      <Field label="Tanggal" htmlFor="c-date">
        <input id="c-date" type="date" className="inp" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
      <Field label="Catatan (opsional)" htmlFor="c-note">
        <input id="c-note" className="inp" maxLength={120} placeholder={kind === "deposit" ? "Misalnya: dari gaji" : "Misalnya: servis motor"} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="s mut">Ini hanya catatan. Financial OS tidak memindahkan uang sungguhan.</p>
      <ErrorNote message={error} />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? <Spinner label="Menyimpan" /> : kind === "deposit" ? "Catat setoran" : "Catat penarikan"}
      </button>
    </form>
  );
}

const KIND_TAG: Record<RhythmOption["kind"], string> = { on_time: "Tepat waktu", current: "Sekarang", lighter: "Lebih ringan" };

export function RhythmSheet({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (o: boolean) => void; goal: Goal }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Ritme nabung" subtitle={`${goal.title} · sisa ${formatRupiah(goalRemaining(goal))}`}>
      <RhythmForm goal={goal} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

function RhythmForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const { mutate, today } = useApp();
  const options = rhythmOptions(goal, today);
  const [selected, setSelected] = useState<number | null>(goal.monthly_plan ?? options[0]?.monthly ?? null);
  const [custom, setCustom] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remaining = goalRemaining(goal);
  const chosen = custom ?? selected;
  const customEstimate = custom ? estimateCompletion(remaining, custom, today) : null;

  const save = async () => {
    if (!chosen) return setError("Pilih atau tulis jumlah per bulan.");
    if (chosen > MAX_AMOUNT) return setError("Jumlah terlalu besar.");
    setBusy(true);
    setError(null);
    try {
      await mutate((s) => s.updateGoal(goal.id, { monthly_plan: chosen }));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {options.length === 0 && (
        <p className="s mut">
          Belum ada pilihan otomatis karena tujuan ini belum punya tanggal target dan ritme. Tulis jumlah per bulan di bawah, atau tambahkan tanggal target lewat
          &ldquo;Atur tujuan&rdquo;.
        </p>
      )}
      <div role="radiogroup" aria-label="Pilihan ritme" className="flex flex-col gap-3">
        {options.map((o) => {
          const on = custom === null && selected === o.monthly;
          return (
            <button
              key={o.monthly}
              type="button"
              role="radio"
              aria-checked={on}
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
              <span className={`tag${o.kind === "lighter" ? " neu" : ""}`} style={on ? { background: "var(--sf)" } : undefined}>
                {on && <Check size={14} aria-hidden="true" />}
                {KIND_TAG[o.kind]}
              </span>
            </button>
          );
        })}
      </div>
      <Field label="Atau tulis jumlah sendiri" htmlFor="r-custom" hint={customEstimate ? `${customEstimate.months} bulan · selesai ${formatMonthYear(customEstimate.date)}` : undefined}>
        <AmountInput id="r-custom" placeholder="Rp per bulan" value={custom} onValueChange={setCustom} />
      </Field>
      <p className="s mut">Telat itu nggak apa-apa. Perkiraan dibulatkan ke bulan penuh dan belum termasuk bunga tabungan.</p>
      <ErrorNote message={error} />
      <button className="btn" type="button" disabled={busy || !chosen} onClick={save}>
        {busy ? <Spinner label="Menyimpan" /> : "Pakai ritme ini"}
      </button>
    </div>
  );
}
