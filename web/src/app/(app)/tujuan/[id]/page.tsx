"use client";

import { ArrowDownToLine, ArrowUpFromLine, Calendar, ChevronLeft, ChevronRight, PartyPopper, Play, Plus, ShoppingBag, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { ContributionSheet, GoalFormSheet, type MoneyKind, RhythmSheet } from "@/components/goal-sheets";
import { useToast } from "@/components/toast";
import { AnimatedRupiah } from "@/components/ui/animated-number";
import { Spinner } from "@/components/ui/controls";
import { GoalIcon } from "@/components/ui/icons";
import { ProgressRing } from "@/components/ui/progress";
import { diffDays, formatLongDate, formatMonthYear, monthsBetween } from "@/lib/date";
import { toAppError } from "@/lib/errors";
import { estimateCompletion, goalProgress, goalRemaining, monthStatus, monthsUntil, requiredMonthly, targetPassed } from "@/lib/goals";
import { formatPercent, formatRupiah } from "@/lib/money";
import { useGoalContributions } from "@/lib/queries";
import type { Contribution } from "@/lib/types";

function shortRupiah(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `Rp${(a / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (a >= 1_000) return `Rp${Math.round(a / 1_000).toLocaleString("id-ID")} rb`;
  return formatRupiah(a);
}

const ENTRY_LABEL: Record<Contribution["kind"], string> = { deposit: "Setoran", withdrawal: "Penarikan", spend: "Dipakai" };

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, today, mutate } = useApp();
  const toast = useToast();
  const goal = data.goals.find((g) => g.id === id);
  const historyQuery = useGoalContributions(goal?.id);
  const [editOpen, setEditOpen] = useState(false);
  const [rhythmOpen, setRhythmOpen] = useState(false);
  const [money, setMoney] = useState<{ open: boolean; kind: MoneyKind; item?: Contribution }>({ open: false, kind: "deposit" });
  const [resuming, setResuming] = useState(false);

  if (!goal) {
    return (
      <main className="scr safe">
        <Link className="ibtn" href="/tujuan" aria-label="Kembali ke Tujuan">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <div className="card">
          <p className="h3">Tujuan tidak ditemukan</p>
          <p className="s mut">Mungkin sudah dihapus.</p>
          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <Link className="lnk" href="/tujuan">
              Kembali ke daftar tujuan
            </Link>
            <Link className="lnk" href="/tujuan?baru=1">
              <Plus size={16} aria-hidden="true" />
              Buat tujuan baru
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const done = goal.status === "completed";
  const paused = goal.status === "paused";
  const pct = done ? 100 : goalProgress(goal);
  const remaining = goalRemaining(goal);
  const spent = goal.spent_amount ?? 0;
  const month = monthStatus(goal);
  const late = targetPassed(goal, today);
  const history = historyQuery.data ?? [];
  const byDate = new Map<string, Contribution[]>();
  for (const c of history) byDate.set(c.contribution_date, [...(byDate.get(c.contribution_date) ?? []), c]);
  const plan = goal.monthly_plan;
  const estimate = plan ? estimateCompletion(remaining, plan, today) : null;
  const onTime = goal.target_date && !late ? requiredMonthly(remaining, monthsUntil(goal.target_date, today)) : null;
  const open = (kind: MoneyKind, item?: Contribution) => setMoney({ open: true, kind, item });

  let rhythmTitle = "Atur ritme nabung";
  let rhythmSub = goal.target_date && onTime ? `Biar tepat ${formatMonthYear(goal.target_date)}: ${formatRupiah(onTime)} per bulan.` : "Tentukan berapa yang mau disisihkan tiap bulan.";
  if (plan) {
    rhythmTitle = `Ritme ${formatRupiah(plan)} / bulan`;
    const parts: string[] = [];
    if (month) parts.push(month.done ? "Bulan ini sudah aman" : `Bulan ini kurang ${shortRupiah(month.left)}`);
    if (estimate) parts.push(`selesai ${formatMonthYear(estimate.date)}`);
    rhythmSub = parts.join(" · ");
    if (parts.length) rhythmSub = rhythmSub.charAt(0).toUpperCase() + rhythmSub.slice(1) + ".";
  }

  // Completion story: how long it took and how many deposits.
  const deposits = history.filter((c) => c.kind === "deposit").length;
  let took = "";
  if (done && goal.completed_at) {
    const from = goal.created_at.slice(0, 10);
    const to = goal.completed_at.slice(0, 10);
    const days = Math.max(1, diffDays(from, to));
    took = days < 45 ? `${days} hari` : `${Math.max(1, monthsBetween(from, to))} bulan`;
  }

  const resumeAndDeposit = async () => {
    setResuming(true);
    try {
      await mutate((s) => s.updateGoal(goal.id, { status: "active" }));
      toast.success(`${goal.title} dilanjutkan.`);
      open("deposit");
    } catch (e) {
      const err = toAppError(e, "Gagal melanjutkan tujuan. Coba lagi.");
      if (err.kind !== "session") toast.error(err.kind === "rejected" || err.kind === "offline" ? err.message : "Gagal melanjutkan tujuan. Coba lagi.");
    } finally {
      setResuming(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col">
      <div className="scr safe" style={{ flex: "none", gap: 14, paddingBottom: 20 }}>
        <div className="row">
          <Link className="ibtn" href="/tujuan" aria-label="Kembali ke Tujuan">
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <h1 className="h3 sp" style={{ textAlign: "center", overflowWrap: "anywhere" }}>
            {goal.title}
          </h1>
          <button className="ibtn" type="button" aria-label="Atur tujuan" onClick={() => setEditOpen(true)}>
            <SlidersHorizontal size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="col" style={{ alignItems: "center", gap: 8, paddingTop: 4 }}>
          <ProgressRing value={pct} size={184} stroke={12} done={done} color={paused ? "var(--ctl)" : "var(--pri)"} inner="var(--pris)" label={`Progres ${formatPercent(pct)}`}>
            <span style={{ color: "var(--onpris)" }}>
              <GoalIcon icon={goal.category} size={56} />
            </span>
          </ProgressRing>
          <AnimatedRupiah className="big" style={{ fontSize: 34 }} value={done ? goal.target_amount : goal.current_amount} />
          {done ? (
            <p className="s mut num" style={{ textAlign: "center" }}>
              {spent > 0 ? `${formatRupiah(spent)} sudah dipakai${goal.current_amount > 0 ? ` · sisa ${formatRupiah(goal.current_amount)}` : ""}` : "terkumpul penuh"}
            </p>
          ) : (
            <>
              <p className="s mut num" style={{ textAlign: "center" }}>
                dari {formatRupiah(goal.target_amount)} · {formatPercent(pct)}
                {goal.target_date && !late ? ` · target ${formatMonthYear(goal.target_date)}` : ""}
              </p>
              <p className="t b num">Kurang {formatRupiah(remaining)} lagi</p>
            </>
          )}
          {paused && <span className="tag neu">Sedang dijeda</span>}
        </div>

        {late && goal.target_date && (
          <div className="late-note" role="status">
            <p className="s pretty">
              Target {formatMonthYear(goal.target_date)} sudah lewat. Nggak apa-apa, geser saja ke bulan yang masuk akal.
            </p>
            <button type="button" className="lnk" onClick={() => setEditOpen(true)}>
              Geser target
            </button>
          </div>
        )}

        {done ? (
          <section className="done-card" aria-labelledby="done-title">
            <PartyPopper size={28} aria-hidden="true" />
            <h2 id="done-title" className="h2">
              {spent > 0 && goal.current_amount === 0 ? "Tujuan terwujud!" : "Tujuan tercapai!"}
            </h2>
            <p className="s pretty">
              {formatRupiah(goal.target_amount)} terkumpul
              {took ? ` dalam ${took}` : ""}
              {deposits > 0 ? ` lewat ${deposits} setoran` : ""}.{spent > 0 && goal.current_amount === 0 ? " Uangnya sudah dipakai sesuai rencana." : ""}
            </p>
            <div className="col" style={{ gap: 8, width: "100%" }}>
              {goal.current_amount > 0 && (
                <button className="btn" type="button" onClick={() => open("spend")}>
                  <ShoppingBag size={20} aria-hidden="true" />
                  {spent > 0 ? "Pakai sisanya" : "Pakai uangnya"}
                </button>
              )}
              <Link className={goal.current_amount > 0 ? "btn ghost" : "btn"} href="/tujuan?baru=1">
                <Plus size={20} aria-hidden="true" />
                Buat tujuan berikutnya
              </Link>
            </div>
          </section>
        ) : (
          <div className="col" style={{ gap: 4 }}>
            {paused ? (
              <button className="btn" type="button" disabled={resuming} onClick={resumeAndDeposit}>
                {resuming ? (
                  <Spinner label="Melanjutkan" />
                ) : (
                  <>
                    <Play size={20} aria-hidden="true" />
                    Lanjutkan & setor
                  </>
                )}
              </button>
            ) : (
              <button className="btn" type="button" onClick={() => open("deposit")}>
                <ArrowDownToLine size={20} aria-hidden="true" />
                {month && !month.done ? `Setor ${shortRupiah(month.left)} bulan ini` : "Setor"}
              </button>
            )}
            {goal.current_amount > 0 && (
              <button className="lnk" type="button" style={{ alignSelf: "center", minHeight: 44 }} onClick={() => open("withdrawal")}>
                <ArrowUpFromLine size={16} aria-hidden="true" />
                Tarik uang dari tujuan
              </button>
            )}
          </div>
        )}

        {!done && (
          <button className="rowc" type="button" onClick={() => setRhythmOpen(true)}>
            <span className={`icb ${month && !month.done ? "am" : "g"}`}>
              <Calendar size={20} aria-hidden="true" />
            </span>
            <span className="col sp" style={{ gap: 0 }}>
              <span className="t b num">{rhythmTitle}</span>
              {rhythmSub && <span className="s mut">{rhythmSub}</span>}
            </span>
            <ChevronRight size={20} aria-hidden="true" style={{ color: "var(--mut)" }} />
          </button>
        )}
      </div>

      <section className="history" aria-labelledby="hist-title">
        <h2 id="hist-title" className="sec" style={{ textAlign: "center" }}>
          Riwayat
        </h2>
        {historyQuery.isPending && <p className="s mut" style={{ textAlign: "center" }}>Memuat riwayat…</p>}
        {historyQuery.isError && (
          <div className="col" style={{ gap: 8, alignItems: "center" }} role="status">
            <p className="s mut">Gagal memuat riwayat.</p>
            <button className="btn ghost sm" type="button" style={{ borderRadius: 999 }} onClick={() => void historyQuery.refetch()}>
              Coba lagi
            </button>
          </div>
        )}
        {historyQuery.isSuccess && history.length === 0 && <p className="s mut" style={{ textAlign: "center" }}>Belum ada setoran. Setoran pertamamu akan muncul di sini.</p>}
        {[...byDate.entries()].map(([date, items]) => (
          <div key={date} className="col" style={{ gap: 0 }}>
            <h3 className="sec hist-date">{formatLongDate(date)}</h3>
            <ul className="day-list">
              {items.map((c) => {
                const plus = c.kind === "deposit";
                return (
                  <li key={c.id}>
                    <button type="button" className="tx-item" onClick={() => open(c.kind, c)}>
                      <span className={`icb ${plus ? "g" : "am"}`} style={{ borderRadius: "50%" }}>
                        {plus ? <ArrowDownToLine size={20} aria-hidden="true" /> : c.kind === "spend" ? <ShoppingBag size={20} aria-hidden="true" /> : <ArrowUpFromLine size={20} aria-hidden="true" />}
                      </span>
                      <span className="col sp" style={{ gap: 0, minWidth: 0 }}>
                        <span className="t b">{ENTRY_LABEL[c.kind]}</span>
                        {(c.note || (c.kind === "spend" && c.transaction_id)) && <span className="s mut">{c.note || "Dicatat di Transaksi"}</span>}
                      </span>
                      <span className={`t b num${plus ? " pos" : ""}`}>
                        {plus ? "+" : "−"}
                        {formatRupiah(c.amount)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <GoalFormSheet open={editOpen} onOpenChange={setEditOpen} goal={goal} />
      <RhythmSheet open={rhythmOpen} onOpenChange={setRhythmOpen} goal={goal} />
      <ContributionSheet open={money.open} onOpenChange={(o) => setMoney((m) => ({ ...m, open: o }))} goal={goal} kind={money.kind} item={money.item} />
    </main>
  );
}
