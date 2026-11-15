"use client";

import { Check, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { GoalFormSheet } from "@/components/goal-sheets";
import { GoalIcon } from "@/components/ui/icons";
import { ProgressRing } from "@/components/ui/progress";
import { toAppError } from "@/lib/errors";
import { useToast } from "@/components/toast";
import { formatMonthYear, formatMonthYearShort } from "@/lib/date";
import { goalProgress, sortGoals } from "@/lib/goals";
import { formatPercent, formatRupiah } from "@/lib/money";
import type { Goal } from "@/lib/types";

function Ring({ goal }: { goal: Goal }) {
  const pct = goalProgress(goal);
  const done = goal.status === "completed";
  return (
    <ProgressRing
      value={pct}
      size={72}
      stroke={6}
      done={done}
      color={goal.status === "paused" ? "var(--ctl)" : "var(--pri)"}
      label={done ? "Selesai" : `${formatPercent(pct)}${goal.status === "paused" ? ", dijeda" : ""}`}
    >
      <span style={{ color: done ? "var(--pri)" : "var(--ink)" }}>{done ? <Check size={24} strokeWidth={2.2} aria-hidden="true" /> : <GoalIcon icon={goal.category} size={24} />}</span>
    </ProgressRing>
  );
}

function PausedRow({ goal }: { goal: Goal }) {
  const { mutate } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="rowc" style={{ padding: 14, gap: 14, flexWrap: "wrap" }}>
      <Link href={`/tujuan/${goal.id}`} className="row sp" style={{ gap: 14, textDecoration: "none", color: "var(--ink)", minWidth: 180 }}>
        <Ring goal={goal} />
        <span className="col sp" style={{ gap: 2 }}>
          <span className="h2">{goal.title}</span>
          <span className="s num">
            <span className="b">{formatRupiah(goal.current_amount)}</span> <span className="mut">· {formatPercent(goalProgress(goal))}</span>
          </span>
          {goal.paused_at && <span className="s mut">Dijeda sejak {formatMonthYearShort(goal.paused_at.slice(0, 10))}</span>}
        </span>
      </Link>
      <button
        className="btn ghost sm"
        type="button"
        disabled={busy}
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

function TujuanContent() {
  const { data } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (params.get("baru") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open the form when arriving from "Tujuan baru"
      setFormOpen(true);
      router.replace("/tujuan");
    }
  }, [params, router]);

  const goals = sortGoals(data.goals);
  const active = goals.filter((g) => g.status === "active");
  const paused = goals.filter((g) => g.status === "paused");
  const done = goals.filter((g) => g.status === "completed");
  const running = [...active, ...paused];
  const collected = running.reduce((s, g) => s + g.current_amount, 0);

  return (
    <main className="scr safe" style={{ gap: 14 }}>
      <div className="row">
        <h1 className="h1 sp" style={{ fontSize: 24 }}>
          Tujuan
        </h1>
        <button className="btn sm" type="button" onClick={() => setFormOpen(true)}>
          <Plus size={16} aria-hidden="true" />
          Baru
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="card">
          <p className="h3">Belum ada tujuan</p>
          <p className="s mut">Tujuan bikin nabung lebih semangat. Mulai dari target kecil, misalnya Rp1 juta pertama, lalu setor setiap ada uang lebih.</p>
          <button className="btn sm" type="button" style={{ alignSelf: "flex-start" }} onClick={() => setFormOpen(true)}>
            <Plus size={16} aria-hidden="true" />
            Buat tujuan pertama
          </button>
        </div>
      ) : (
        <>
          {running.length > 0 && (
            <div className="col" style={{ gap: 2 }}>
              <p className="sec">Total terkumpul</p>
              <p className="big">{formatRupiah(collected)}</p>
              <p className="s mut">di {running.length} tujuan yang masih berjalan</p>
            </div>
          )}

          {active.length > 0 && (
            <>
              <h2 className="sec" style={{ marginTop: 4 }}>
                Sedang dikejar
              </h2>
              {active.map((g) => (
                <Link key={g.id} className="rowc" href={`/tujuan/${g.id}`} style={{ padding: 14, gap: 14 }}>
                  <Ring goal={g} />
                  <div className="col sp" style={{ gap: 2 }}>
                    <p className="h2">{g.title}</p>
                    <p className="s num">
                      <span className="b">{formatRupiah(g.current_amount)}</span> <span className="mut">dari {formatRupiah(g.target_amount)}</span>
                    </p>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <span className="tag">{formatPercent(goalProgress(g))}</span>
                      {g.target_date && <span className="tag neu">Target {formatMonthYearShort(g.target_date)}</span>}
                    </div>
                  </div>
                  <ChevronRight size={20} aria-hidden="true" style={{ color: "var(--mut)" }} />
                </Link>
              ))}
            </>
          )}

          {paused.length > 0 && (
            <>
              <h2 className="sec" style={{ marginTop: 4 }}>
                Dijeda
              </h2>
              {paused.map((g) => (
                <PausedRow key={g.id} goal={g} />
              ))}
            </>
          )}

          {done.length > 0 && (
            <>
              <h2 className="sec" style={{ marginTop: 4 }}>
                Selesai
              </h2>
              {done.map((g) => (
                <Link key={g.id} className="rowc" href={`/tujuan/${g.id}`} style={{ padding: 14, gap: 14 }}>
                  <Ring goal={g} />
                  <div className="col sp" style={{ gap: 2 }}>
                    <p className="h2">{g.title}</p>
                    <p className="s mut">
                      {formatRupiah(g.target_amount)}
                      {g.completed_at ? ` · tercapai ${formatMonthYear(g.completed_at.slice(0, 10))}` : ""}
                    </p>
                  </div>
                  <ChevronRight size={20} aria-hidden="true" style={{ color: "var(--mut)" }} />
                </Link>
              ))}
            </>
          )}
        </>
      )}
      <GoalFormSheet open={formOpen} onOpenChange={setFormOpen} />
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
