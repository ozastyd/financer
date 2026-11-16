"use client";

import { ArrowDownToLine, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { ContributionSheet, GoalFormSheet } from "@/components/goal-sheets";
import { useToast } from "@/components/toast";
import { Chip } from "@/components/ui/controls";
import { GoalIcon } from "@/components/ui/icons";
import { ProgressRing } from "@/components/ui/progress";
import { diffDays, formatMonthYear, formatMonthYearShort, monthsBetween } from "@/lib/date";
import { toAppError } from "@/lib/errors";
import { goalProgress, monthStatus, sortGoals, targetPassed } from "@/lib/goals";
import { formatPercent, formatRupiah } from "@/lib/money";
import { GOAL_TEMPLATES } from "@/lib/options";
import type { Goal } from "@/lib/types";

function shortRupiah(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `Rp${(a / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (a >= 1_000) return `Rp${Math.round(a / 1_000).toLocaleString("id-ID")} rb`;
  return formatRupiah(a);
}

/** "dalam 12 hari" / "dalam 5 bulan" between a goal's start and its completion. */
function tookLabel(goal: Goal): string | null {
  if (!goal.completed_at) return null;
  const from = goal.created_at.slice(0, 10);
  const to = goal.completed_at.slice(0, 10);
  const days = Math.max(1, diffDays(from, to));
  if (days < 45) return `dalam ${days} hari`;
  return `dalam ${Math.max(1, monthsBetween(from, to))} bulan`;
}

function Ring({ goal }: { goal: Goal }) {
  const done = goal.status === "completed";
  const pct = done ? 100 : goalProgress(goal);
  return (
    <ProgressRing
      value={pct}
      size={64}
      stroke={6}
      done={done}
      color={goal.status === "paused" ? "var(--ctl)" : "var(--pri)"}
      label={done ? "Selesai" : `${formatPercent(pct)}${goal.status === "paused" ? ", dijeda" : ""}`}
    >
      <span style={{ color: done ? "var(--pri)" : "var(--ink)" }}>{done ? <Check size={22} strokeWidth={2.2} aria-hidden="true" /> : <GoalIcon icon={goal.category} size={22} />}</span>
    </ProgressRing>
  );
}

function ActiveRow({ goal, onDeposit }: { goal: Goal; onDeposit: () => void }) {
  const { today } = useApp();
  const month = monthStatus(goal);
  const late = targetPassed(goal, today);
  return (
    <div className="goal-row">
      <Link href={`/tujuan/${goal.id}`} className="goal-row-link">
        <Ring goal={goal} />
        <span className="col sp" style={{ gap: 3, minWidth: 0 }}>
          <span className="t b goal-row-title">{goal.title}</span>
          <span className="s num">
            <span className="b">{formatRupiah(goal.current_amount)}</span> <span className="mut nowrap">dari {shortRupiah(goal.target_amount)}</span>
          </span>
          <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {month ? (
              month.done ? (
                <span className="tag">
                  <Check size={13} aria-hidden="true" />
                  Bulan ini aman
                </span>
              ) : (
                <span className="tag neu">Bulan ini kurang {shortRupiah(month.left)}</span>
              )
            ) : (
              <span className="tag">{formatPercent(goalProgress(goal))}</span>
            )}
            {late ? <span className="tag amb">Target terlewat</span> : goal.target_date && !month && <span className="tag neu">Target {formatMonthYearShort(goal.target_date)}</span>}
          </span>
        </span>
      </Link>
      <button className="btn sm ghost goal-row-act" type="button" onClick={onDeposit} aria-label={`Setor ke ${goal.title}`}>
        <ArrowDownToLine size={18} aria-hidden="true" />
        Setor
      </button>
    </div>
  );
}

function PausedRow({ goal }: { goal: Goal }) {
  const { mutate } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="goal-row">
      <Link href={`/tujuan/${goal.id}`} className="goal-row-link">
        <Ring goal={goal} />
        <span className="col sp" style={{ gap: 3, minWidth: 0 }}>
          <span className="t b goal-row-title">{goal.title}</span>
          <span className="s num">
            <span className="b">{formatRupiah(goal.current_amount)}</span> <span className="mut">· {formatPercent(goalProgress(goal))}</span>
          </span>
          {goal.paused_at && <span className="s mut">Dijeda sejak {formatMonthYearShort(goal.paused_at.slice(0, 10))}</span>}
        </span>
      </Link>
      <button
        className="btn ghost sm goal-row-act"
        type="button"
        disabled={busy}
        aria-label={`Lanjutkan ${goal.title}`}
        onClick={async () => {
          setBusy(true);
          try {
            await mutate((s) => s.updateGoal(goal.id, { status: "active" }));
            toast.success(`${goal.title} dilanjutkan.`);
          } catch (e) {
            const err = toAppError(e, "Gagal melanjutkan tujuan. Coba lagi.");
            if (err.kind !== "session") toast.error(err.kind === "rejected" || err.kind === "offline" ? err.message : "Gagal melanjutkan tujuan. Coba lagi.");
            setBusy(false);
          }
        }}
      >
        Lanjutkan
      </button>
    </div>
  );
}

const STARTERS = ["rp1jt", "darurat", "laptop", "liburan"];

function TujuanContent() {
  const { data } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [form, setForm] = useState<{ open: boolean; template?: string }>({ open: false });
  const [depositId, setDepositId] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);

  useEffect(() => {
    if (params.get("baru") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open the form when arriving from "Tujuan baru"
      setForm({ open: true });
      router.replace("/tujuan");
    }
  }, [params, router]);

  const goals = sortGoals(data.goals);
  const active = goals.filter((g) => g.status === "active");
  const paused = goals.filter((g) => g.status === "paused");
  const done = goals.filter((g) => g.status === "completed");
  const held = goals.reduce((s, g) => s + g.current_amount, 0);
  const months = active.map(monthStatus).filter((m) => m !== null);
  const monthPlan = months.reduce((s, m) => s + m.plan, 0);
  const monthSaved = months.reduce((s, m) => s + Math.min(m.saved, m.plan), 0);
  const depositGoal = goals.find((g) => g.id === depositId);

  return (
    <main className="scr safe" style={{ gap: 14 }}>
      <div className="row">
        <h1 className="h1 sp" style={{ fontSize: 24 }}>
          Tujuan
        </h1>
        <button className="btn sm" type="button" onClick={() => setForm({ open: true })}>
          <Plus size={16} aria-hidden="true" />
          Tujuan baru
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="card">
          <p className="h3">Mau nabung untuk apa?</p>
          <p className="s mut pretty">Pilih satu untuk mulai. Target dan namanya bisa diubah nanti.</p>
          <div className="wrap" role="group" aria-label="Contoh tujuan">
            {STARTERS.map((key) => {
              const t = GOAL_TEMPLATES.find((x) => x.key === key);
              return t ? (
                <Chip key={key} onClick={() => setForm({ open: true, template: key })}>
                  <GoalIcon icon={t.icon} size={16} />
                  {t.label}
                </Chip>
              ) : null;
            })}
          </div>
          <button className="lnk" type="button" style={{ alignSelf: "flex-start" }} onClick={() => setForm({ open: true })}>
            <Plus size={16} aria-hidden="true" />
            Buat sendiri
          </button>
        </div>
      ) : (
        <>
          {held > 0 && (
            <div className="col" style={{ gap: 2 }}>
              <p className="s mut">Uang yang sudah disisihkan</p>
              <p className="big num">{formatRupiah(held)}</p>
              {monthPlan > 0 && (
                <p className="s num">
                  Bulan ini <span className="b">{formatRupiah(monthSaved)}</span> <span className="mut">dari rencana {formatRupiah(monthPlan)}</span>
                </p>
              )}
            </div>
          )}

          {active.length > 0 && (
            <section className="col" style={{ gap: 10 }} aria-labelledby="g-active">
              <h2 id="g-active" className="sec" style={{ marginTop: 4 }}>
                Sedang dikejar
              </h2>
              {active.map((g) => (
                <ActiveRow
                  key={g.id}
                  goal={g}
                  onDeposit={() => {
                    setDepositId(g.id);
                    setDepositOpen(true);
                  }}
                />
              ))}
            </section>
          )}

          {paused.length > 0 && (
            <section className="col" style={{ gap: 10 }} aria-labelledby="g-paused">
              <h2 id="g-paused" className="sec" style={{ marginTop: 4 }}>
                Dijeda
              </h2>
              {paused.map((g) => (
                <PausedRow key={g.id} goal={g} />
              ))}
            </section>
          )}

          {done.length > 0 && (
            <section className="col" style={{ gap: 10 }} aria-labelledby="g-done">
              <h2 id="g-done" className="sec" style={{ marginTop: 4 }}>
                Tercapai
              </h2>
              {done.map((g) => {
                const took = tookLabel(g);
                return (
                  <Link key={g.id} className="goal-row goal-row-link" href={`/tujuan/${g.id}`}>
                    <Ring goal={g} />
                    <span className="col sp" style={{ gap: 3, minWidth: 0 }}>
                      <span className="t b goal-row-title">{g.title}</span>
                      <span className="s mut num">
                        {formatRupiah(g.target_amount)}
                        {g.completed_at ? ` · ${formatMonthYear(g.completed_at.slice(0, 10))}` : ""}
                        {took && <span className="nowrap"> · {took}</span>}
                      </span>
                      {(g.spent_amount ?? 0) > 0 && (
                        <span className="row" style={{ gap: 6 }}>
                          <span className="tag neu">Sudah dipakai</span>
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </section>
          )}
        </>
      )}
      <GoalFormSheet open={form.open} template={form.template} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))} />
      {depositGoal && <ContributionSheet open={depositOpen} onOpenChange={setDepositOpen} goal={depositGoal} kind="deposit" />}
    </main>
  );
}

export default function TujuanPage() {
  return (
    <Suspense fallback={null}>
      <TujuanContent />
    </Suspense>
  );
}
