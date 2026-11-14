"use client";

import { ArrowDownToLine, ArrowUpFromLine, Calendar, ChevronLeft, ChevronRight, PartyPopper, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { ContributionSheet, GoalFormSheet, RhythmSheet } from "@/components/goal-sheets";
import { GoalIcon } from "@/components/ui/icons";
import { ProgressRing } from "@/components/ui/progress";
import { formatLongDate, formatMonthYear } from "@/lib/date";
import { estimateCompletion, goalProgress, goalRemaining, monthsUntil, requiredMonthly } from "@/lib/goals";
import { formatPercent, formatRupiah } from "@/lib/money";

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, today } = useApp();
  const goal = data.goals.find((g) => g.id === id);
  const [editOpen, setEditOpen] = useState(false);
  const [rhythmOpen, setRhythmOpen] = useState(false);
  const [contrib, setContrib] = useState<{ open: boolean; kind: "deposit" | "withdrawal" }>({ open: false, kind: "deposit" });

  if (!goal) {
    return (
      <main className="scr safe">
        <Link className="ibtn" href="/tujuan" aria-label="Kembali ke Tujuan">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <div className="card">
          <p className="h3">Tujuan tidak ditemukan</p>
          <p className="s mut">Mungkin sudah dihapus.</p>
          <Link className="lnk" href="/tujuan">
            Kembali ke daftar tujuan
          </Link>
        </div>
      </main>
    );
  }

  const pct = goalProgress(goal);
  const remaining = goalRemaining(goal);
  const done = goal.status === "completed";
  const paused = goal.status === "paused";
  const history = data.contributions.filter((c) => c.goal_id === goal.id);
  const byDate = new Map<string, typeof history>();
  for (const c of history) byDate.set(c.contribution_date, [...(byDate.get(c.contribution_date) ?? []), c]);
  const plan = goal.monthly_plan;
  const estimate = plan ? estimateCompletion(remaining, plan, today) : null;
  const onTime = goal.target_date ? requiredMonthly(remaining, monthsUntil(goal.target_date, today)) : null;

  let rhythmTitle = "Atur ritme nabung";
  let rhythmSub = goal.target_date && onTime ? `Biar tepat ${formatMonthYear(goal.target_date)}: ${formatRupiah(onTime)} per bulan.` : "Tentukan berapa yang mau disisihkan tiap bulan.";
  if (plan) {
    rhythmTitle = `Ritme nabung ${formatRupiah(plan)} / bulan`;
    rhythmSub = estimate ? `Perkiraan selesai ${formatMonthYear(estimate.date)}.` : "";
    if (goal.target_date && onTime && onTime !== plan && estimate && estimate.date.slice(0, 7) > goal.target_date.slice(0, 7)) {
      rhythmSub += ` Biar tepat ${formatMonthYear(goal.target_date).split(" ")[0]}: ${formatRupiah(onTime)}.`;
    }
  }

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

        <div className="col" style={{ alignItems: "center", gap: 10, paddingTop: 4 }}>
          <ProgressRing value={pct} size={200} stroke={12} done={done} color={paused ? "var(--ctl)" : "var(--pri)"} inner="var(--pris)" label={`Progres ${formatPercent(pct)}`}>
            <span style={{ color: "var(--onpris)" }}>
              <GoalIcon icon={goal.category} size={60} />
            </span>
          </ProgressRing>
          <p className="big" style={{ fontSize: 34 }}>
            {formatRupiah(goal.current_amount)}
          </p>
          <p className="s mut num" style={{ textAlign: "center" }}>
            dari {formatRupiah(goal.target_amount)} · {formatPercent(pct)}
            {goal.target_date ? ` · target ${formatMonthYear(goal.target_date)}` : ""}
          </p>
          {paused && <span className="tag neu">Sedang dijeda</span>}
        </div>

        {done && (
          <div className="card soft" style={{ flexDirection: "row", alignItems: "center" }}>
            <PartyPopper size={24} aria-hidden="true" style={{ color: "var(--onpris)", flex: "none" }} />
            <p className="s b">Tujuan tercapai! Selamat, kamu berhasil mengumpulkan {formatRupiah(goal.target_amount)}.</p>
          </div>
        )}

        <div className="g2">
          <button
            className="btn"
            type="button"
            disabled={paused || done}
            aria-describedby={paused || done ? "setor-note" : undefined}
            onClick={() => setContrib({ open: true, kind: "deposit" })}
          >
            <ArrowDownToLine size={20} aria-hidden="true" />
            Setor
          </button>
          <button className="btn ghost" type="button" disabled={goal.current_amount === 0} onClick={() => setContrib({ open: true, kind: "withdrawal" })}>
            <ArrowUpFromLine size={20} aria-hidden="true" />
            Tarik
          </button>
        </div>
        {(paused || done) && (
          <p id="setor-note" className="s mut" style={{ textAlign: "center", marginTop: -6 }}>
            {paused ? "Lanjutkan tujuan lewat tombol Atur di kanan atas untuk setor lagi." : "Tujuan sudah tercapai, setoran ditutup."}
          </p>
        )}

        {!done && (
          <button className="rowc" type="button" onClick={() => setRhythmOpen(true)}>
            <span className="icb g">
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

      <section
        aria-label="Riwayat"
        style={{ flex: 1, background: "var(--sf)", borderTop: "1px solid var(--line)", borderRadius: "28px 28px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: 6 }}
      >
        <div className="grab" aria-hidden="true" style={{ marginBottom: 6 }} />
        <h2 className="sec" style={{ textAlign: "center" }}>
          Riwayat
        </h2>
        {history.length === 0 && <p className="s mut" style={{ textAlign: "center" }}>Belum ada setoran. Tekan Setor untuk mencatat yang pertama.</p>}
        {[...byDate.entries()].map(([date, items], gi) => (
          <div key={date} className="col" style={{ gap: 0 }}>
            <p className="sec" style={{ textAlign: "center", marginTop: gi ? 8 : 0 }}>
              {formatLongDate(date)}
            </p>
            {items.map((c) => (
              <div key={c.id} className="item">
                <span className={`icb ${c.kind === "deposit" ? "g" : "am"}`} style={{ borderRadius: "50%" }}>
                  {c.kind === "deposit" ? <ArrowDownToLine size={20} aria-hidden="true" /> : <ArrowUpFromLine size={20} aria-hidden="true" />}
                </span>
                <div className="col sp" style={{ gap: 0 }}>
                  <p className="t b">{c.kind === "deposit" ? "Setoran" : "Tarik sebagian"}</p>
                  {c.note && <p className="s mut">{c.note}</p>}
                </div>
                <p className={`t b num${c.kind === "deposit" ? " pos" : ""}`}>
                  {c.kind === "deposit" ? "+" : "−"}
                  {formatRupiah(c.amount)}
                </p>
              </div>
            ))}
            <hr className="div" />
          </div>
        ))}
      </section>

      <GoalFormSheet open={editOpen} onOpenChange={setEditOpen} goal={goal} />
      <RhythmSheet open={rhythmOpen} onOpenChange={setRhythmOpen} goal={goal} />
      <ContributionSheet open={contrib.open} onOpenChange={(o) => setContrib((c) => ({ ...c, open: o }))} goal={goal} kind={contrib.kind} />
    </main>
  );
}
