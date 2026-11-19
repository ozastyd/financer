"use client";

import { BellRing, Check, ChevronRight, CircleHelp, Pencil, PiggyBank, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { CashFlowChart, CategoryDonut, SLICE_COLORS } from "@/components/charts";
import { IPhoneCard } from "@/components/iphone-record";
import { useShell } from "@/components/shell";
import { Segmented } from "@/components/ui/controls";
import { AnimatedRupiah } from "@/components/ui/animated-number";
import { GoalIcon } from "@/components/ui/icons";
import { ProgressRing } from "@/components/ui/progress";
import { formatLongDate, formatMonthYearShort, greeting } from "@/lib/date";
import { type Period, cumulativeSeriesFromNet, flexiblePlan, periodRange, planCheck, roundedPercents, sameDayComparison, slicesFromAmounts, topNamesFromSlices } from "@/lib/finance";
import { goalProgress, goalRemaining, monthStatus, sortGoals } from "@/lib/goals";
import { formatPercent, formatRupiah } from "@/lib/money";
import { useDashboard } from "@/lib/queries";
import type { Goal } from "@/lib/types";

const PERIOD_LABEL: Record<Period, string> = { week: "Minggu", month: "Bulan", year: "Tahun" };

/** Rupiah in short form for sentences: Rp910 rb, Rp1,2 jt. */
function shortRupiah(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `Rp${(a / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (a >= 1_000) return `Rp${Math.round(a / 1_000).toLocaleString("id-ID")} rb`;
  return formatRupiah(a);
}

function GoalRing({ goal }: { goal: Goal }) {
  const pct = goalProgress(goal);
  const done = goal.status === "completed";
  const paused = goal.status === "paused";
  const label = done ? `${goal.title}, selesai` : `${goal.title}, ${formatPercent(pct)}${paused ? ", dijeda" : ""}`;
  return (
    <Link href={`/tujuan/${goal.id}`} className="col" style={{ alignItems: "center", gap: 6, textDecoration: "none", color: "var(--ink)", minHeight: 44 }}>
      <ProgressRing value={pct} done={done} color={paused ? "var(--ctl)" : "var(--pri)"} label={label}>
        <span style={{ color: done ? "var(--pri)" : "var(--ink)" }}>{done ? <Check size={22} strokeWidth={2.2} aria-hidden="true" /> : <GoalIcon icon={goal.category} />}</span>
      </ProgressRing>
      <span className={`s ${paused || done ? "mut" : "b"}`} style={{ fontSize: 12, textAlign: "center", lineHeight: 1.3, overflowWrap: "anywhere" }}>
        {goal.title}
        {paused ? " · jeda" : done ? " · selesai" : ""}
      </span>
    </Link>
  );
}

export default function BerandaPage() {
  const { data, today, session } = useApp();
  const { openAddTx, openCoach } = useShell();
  const [period, setPeriod] = useState<Period>("month");
  const [explain, setExplain] = useState(false);

  const dashQuery = useDashboard(period, today);
  const dash = dashQuery.data;
  const r = useMemo(() => periodRange(period, today), [period, today]);
  const zero = { income: 0, expense: 0, net: 0, count: 0 };
  const cur = dash?.current ?? zero;
  const prev = dash?.previous ?? zero;
  const series = useMemo(() => (dash ? cumulativeSeriesFromNet(dash.netByDay, period, today) : []), [dash, period, today]);
  const slices = useMemo(() => (dash ? slicesFromAmounts(dash.expenseByCategory, data.categories, 4) : []), [dash, data.categories]);
  const pcts = roundedPercents(slices.map((s) => s.amount));
  const balance = dash?.recordedBalance ?? 0;
  const incomeNames = dash ? topNamesFromSlices(slicesFromAmounts(dash.incomeByCategory, data.categories, 2), 2) : [];
  const goals = sortGoals(data.goals);
  const primary = goals.find((g) => g.status === "active");
  const todayCount = dash?.todayCount ?? 0;
  const name = data.userProfile?.display_name ?? session?.email.split("@")[0] ?? "";
  const periodName = period === "month" ? `bulan ${r.label}` : period === "week" ? "minggu ini" : `tahun ${r.label}`;
  const empty = Boolean(dash) && cur.count === 0;

  // Fair comparison: the previous period at the same point (same day / same month), in Rupiah.
  const same = sameDayComparison(series);
  const delta = same && same.previous !== null && prev.count > 0 ? same.current - same.previous : null;
  const deltaWorth = delta !== null && Math.abs(delta) >= 10_000;

  // Month view: spending against the monthly plan from onboarding.
  // Fixed costs (rent, bills, debt payments) and purchases paid from a goal are
  // taken off the top, so paying rent early doesn't read as overspending.
  const fp = data.financial;
  const plan = fp ? fp.monthly_expenses + fp.monthly_obligations : 0;
  const fixedPaid = dash?.fixedExpense ?? 0;
  const dayToDay = fp ? flexiblePlan(plan, fp.monthly_obligations, fixedPaid) : 0;
  const check = period === "month" ? planCheck(dayToDay, dash?.flexibleExpense ?? 0, today) : null;

  // Money moved into goals is no longer free to spend.
  const setAside = dash?.setAside ?? 0;
  const sisa = cur.net - setAside;
  const goalsBalance = dash?.goalsBalance ?? 0;
  // Before the very first record, show what onboarding estimated instead of an empty card.
  const estimate =
    fp && dash && dash.allTimeCount === 0 && period === "month" && fp.monthly_income + fp.additional_income > 0
      ? fp.monthly_income + fp.additional_income - fp.monthly_expenses - fp.monthly_obligations
      : null;
  const primaryMonth = primary ? monthStatus(primary, today) : null;

  const headline = period === "month" ? `Sisa uang ${r.label}` : period === "week" ? "Sisa uang minggu ini" : `Sisa uang ${r.label}`;

  return (
    <main className="scr safe beranda" style={{ paddingBottom: 24 }}>
      <header className="row">
        <div className="col sp" style={{ gap: 0 }}>
          <h1 className="h2" style={{ fontSize: 22 }}>
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
          <p className="s mut">{formatLongDate(today)}</p>
        </div>
      </header>

      <IPhoneCard />

      {(data.pendingCount ?? 0) > 0 && (
        <Link className="aside-row pending-row" href="/perlu-dicek">
          <span className="icb am" aria-hidden="true">
            <BellRing size={18} />
          </span>
          <span className="s sp">
            <span className="b">{data.pendingCount} transaksi</span> dari notifikasi perlu dicek
          </span>
          <ChevronRight size={18} aria-hidden="true" style={{ color: "var(--mut)" }} />
        </Link>
      )}

      <Segmented label="Rentang waktu" value={period} onChange={setPeriod} options={(["week", "month", "year"] as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />

      <section className="col" style={{ gap: 10 }} aria-labelledby="hero-title" data-tour="sisa">
        <h2 id="hero-title" className="sec">
          {headline}
        </h2>
        {!dash ? (
          <div className="card" aria-busy={dashQuery.isPending}>
            {dashQuery.isError ? (
              <>
                <p className="h3">Gagal memuat ringkasan</p>
                <p className="s mut">Periksa koneksimu, lalu coba lagi.</p>
                <button className="btn sm" type="button" style={{ alignSelf: "flex-start" }} onClick={() => void dashQuery.refetch()}>
                  Coba lagi
                </button>
              </>
            ) : (
              <p className="s mut">Memuat ringkasan…</p>
            )}
          </div>
        ) : empty ? (
          <div className="card">
            {estimate !== null ? (
              <>
                <p className="s mut">Perkiraan dari jawabanmu saat daftar</p>
                <p className="big num" style={{ fontSize: 30 }}>
                  {estimate < 0 ? "−" : ""}
                  {formatRupiah(Math.abs(estimate))}
                  <span className="s mut" style={{ fontWeight: 600 }}>
                    {" "}
                    / bulan
                  </span>
                </p>
                <p className="s mut pretty">
                  {estimate >= 0 ? "Kira-kira segini sisa uangmu tiap bulan." : "Kira-kira segini kurangnya tiap bulan."} Catat uang masuk dan keluarmu, nanti angka aslinya muncul di sini.
                </p>
              </>
            ) : (
              <>
                <p className="h3">Belum ada catatan {periodName}</p>
                <p className="s mut">Catat uang masuk dan keluarmu. Di sini nanti kelihatan sisa uangmu dan apakah pengeluaranmu masih sesuai rencana.</p>
              </>
            )}
            <button className="btn sm" type="button" style={{ alignSelf: "flex-start" }} onClick={() => openAddTx()}>
              <Plus size={18} aria-hidden="true" />
              Catat transaksi
            </button>
          </div>
        ) : (
          <>
            <AnimatedRupiah className="big" style={{ fontSize: 38 }} value={sisa} />
            <p className="s mut">
              Pemasukan dikurangi pengeluaran{setAside !== 0 ? " dan tabungan tujuan" : ""} {periodName}.
              {deltaWorth && delta !== null && (
                <>
                  {" "}
                  <span className={`b ${delta >= 0 ? "pos" : "warn-text"}`}>
                    {shortRupiah(delta)} {delta >= 0 ? "lebih banyak" : "lebih sedikit"}
                  </span>{" "}
                  dari {r.prevLabel} di {period === "year" ? "bulan" : "hari"} yang sama.
                </>
              )}
            </p>
            {/* screen readers hear the new figure when the range changes */}
            <p className="sr-only" aria-live="polite">
              {headline}: {formatRupiah(sisa)}
            </p>
            {setAside !== 0 && (
              <Link className="aside-row" href="/tujuan">
                <span className="icb g" aria-hidden="true">
                  <PiggyBank size={18} />
                </span>
                <span className="s sp">
                  {setAside > 0 ? (
                    <>
                      <span className="b num">{formatRupiah(setAside)}</span> sudah disisihkan ke tujuan {periodName}
                    </>
                  ) : (
                    <>
                      <span className="b num">{formatRupiah(-setAside)}</span> diambil dari tujuan {periodName}
                    </>
                  )}
                </span>
                <ChevronRight size={18} aria-hidden="true" style={{ color: "var(--mut)" }} />
              </Link>
            )}

            {check && (
              <div className={`plan-check${check.aheadBy < 0 ? " over" : ""}`}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <p className="s b">{check.aheadBy >= 0 ? "Belanja harian aman" : "Belanja harian lewat rencana"}</p>
                  <p className="s num mut nowrap">
                    {formatRupiah(check.spent)} / {formatRupiah(check.plan)}
                  </p>
                </div>
                <div
                  className="plan-bar"
                  role="img"
                  aria-label={`Belanja harian ${formatRupiah(check.spent)} dari rencana ${formatRupiah(check.plan)}. Sampai hari ini rencananya ${formatRupiah(check.expectedByToday)}.`}
                >
                  <i style={{ width: `${Math.min(100, (check.spent / check.plan) * 100)}%` }} />
                  <b style={{ left: `${check.elapsed * 100}%` }} title="Batas sampai hari ini" />
                </div>
                <p className="s">
                  {check.aheadBy >= 0 ? (
                    <>
                      Hemat <span className="b num">{shortRupiah(check.aheadBy)}</span> dari jatah sampai hari ini. Sisa jatah{" "}
                      <span className="b num">{shortRupiah(check.perDay)}/hari</span> untuk {check.daysLeft} hari lagi.
                    </>
                  ) : (
                    <>
                      Lebih <span className="b num">{shortRupiah(-check.aheadBy)}</span> dari jatah sampai hari ini.
                      {check.left > 0 ? (
                        <>
                          {" "}
                          Coba tahan di <span className="b num">{shortRupiah(check.perDay)}/hari</span> sampai akhir bulan.
                        </>
                      ) : (
                        " Rencana bulan ini sudah habis terpakai."
                      )}
                    </>
                  )}
                </p>
                {fixedPaid > 0 && (
                  <p className="s mut">
                    Biaya tetap <span className="num">{formatRupiah(fixedPaid)}</span> (kos, tagihan, cicilan) sudah dibayar dan tidak dihitung di sini.
                  </p>
                )}
              </div>
            )}

            <div className="chart-legend" aria-hidden="true">
              <span>
                <i className="now" /> {period === "week" ? "Minggu ini" : r.label}
              </span>
              {prev.count > 0 && (
                <span>
                  <i className="before" /> {r.prevLabel}
                </span>
              )}
            </div>
            <CashFlowChart
              series={series}
              prevLabel={r.prevLabel}
              showPrevious={prev.count > 0}
              ariaLabel={`Grafik sisa uang ${periodName}${prev.count > 0 ? ` dibanding ${r.prevLabel}` : ""}. Saat ini ${formatRupiah(sisa)}.`}
            />
          </>
        )}

        <div className="balance-row">
          <div className="col sp" style={{ gap: 0 }}>
            <p className="s mut">Total uang tercatat</p>
            <p className="t b num">{formatRupiah(balance)}</p>
            {goalsBalance > 0 && <p className="s mut num">termasuk {formatRupiah(goalsBalance)} di tujuan</p>}
          </div>
          <button type="button" className="ibtn" aria-expanded={explain} aria-controls="balance-why" aria-label="Apa itu total uang tercatat?" onClick={() => setExplain((v) => !v)}>
            <CircleHelp size={20} aria-hidden="true" />
          </button>
        </div>
        {explain && (
          <p id="balance-why" className="s mut">
            Tabungan awal yang kamu isi saat daftar, ditambah semua pemasukan dan dikurangi semua pengeluaran yang kamu catat. Uang di tujuan tetap uangmu, jadi ikut dihitung. Bisa beda dengan saldo bank kalau ada yang belum dicatat.
          </p>
        )}
      </section>

      {dash && !empty && (
        <section className={`mission${todayCount > 0 ? " done" : ""}`} aria-labelledby="mission-title">
          <span className={`icb ${todayCount > 0 ? "g" : ""}`}>{todayCount > 0 ? <Check size={20} aria-hidden="true" /> : <Pencil size={20} aria-hidden="true" />}</span>
          <div className="col sp" style={{ gap: 0 }}>
            <h2 id="mission-title" className="t b">
              {todayCount > 0 ? `${todayCount} transaksi dicatat hari ini` : "Catat pengeluaran hari ini"}
            </h2>
            <p className="s mut">{todayCount > 0 ? "Mantap. Ada yang kelewat?" : "Kurang dari 10 detik."}</p>
          </div>
          <button className="btn sm" type="button" onClick={() => openAddTx()}>
            Catat
          </button>
        </section>
      )}

      {dash && !empty && (
        <div className="g2">
          <section className="card" style={{ gap: 4, padding: 14 }} aria-labelledby="in-title">
            <h2 id="in-title" className="sec">
              Pemasukan
            </h2>
            <p className="h2 num">{formatRupiah(cur.income)}</p>
            <p className="s mut">{incomeNames.length ? incomeNames.join(" + ") : `Belum ada ${periodName}`}</p>
          </section>
          <section className="card" style={{ gap: 4, padding: 14 }} aria-labelledby="out-title">
            <h2 id="out-title" className="sec">
              Pengeluaran
            </h2>
            <p className="h2 num">{formatRupiah(cur.expense)}</p>
            <p className="s mut num">
              {cur.expense === 0 ? `Belum ada ${periodName}` : cur.income > 0 ? `${Math.round((cur.expense / cur.income) * 100)}% dari pemasukan` : "Pemasukan belum dicatat"}
            </p>
          </section>
        </div>
      )}

      {dash && !empty && slices.length > 0 && (
        <section className="card" aria-labelledby="cat-title">
          <h2 id="cat-title" className="sec">
            Ke mana uangmu {periodName}
          </h2>
          <div className="row" style={{ gap: 16 }}>
            <CategoryDonut slices={slices} total={cur.expense} />
            <ul className="col sp" style={{ gap: 7, listStyle: "none", margin: 0, padding: 0 }}>
              {slices.map((s, i) => (
                <li key={s.name} className="row" style={{ gap: 8 }}>
                  <i style={{ width: 10, height: 10, borderRadius: 3, background: SLICE_COLORS[i % SLICE_COLORS.length], flex: "none" }} aria-hidden="true" />
                  <span className="s sp">{s.name}</span>
                  <span className="s b num">
                    {pcts[i]}%<span className="sr-only">, {formatRupiah(s.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="s">
            Paling banyak untuk <span className="b">{slices[0].name}</span>: <span className="b num">{formatRupiah(slices[0].amount)}</span>.
            {cur.income > 0 && cur.net < 0 ? " Pengeluaranmu sudah melebihi pemasukan." : ""}
          </p>
          <button
            className="lnk"
            type="button"
            style={{ alignSelf: "flex-start", minHeight: 44 }}
            onClick={() => {
              // Opens the Coach and asks right away, with this card's numbers.
              const parts = slices.map((sl, i) => `${sl.name} ${formatRupiah(sl.amount)} (${pcts[i]}%)`).join(", ");
              const money = cur.income > 0 ? ` dari pemasukan ${formatRupiah(cur.income)}` : "";
              openCoach(`Pengeluaranku ${periodName} ${formatRupiah(cur.expense)}${money}. Paling banyak untuk: ${parts}. Gimana cara menghematnya?`);
            }}
          >
            <Sparkles size={16} aria-hidden="true" />
            Tanya AI Coach cara menghematnya
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}

      <section className="col" style={{ gap: 10 }} aria-labelledby="goal-title">
        <div className="row">
          <h2 id="goal-title" className="sec sp">
            Tujuan
          </h2>
          <Link className="lnk" href="/tujuan">
            Lihat semua
          </Link>
        </div>
        {primary && (
          <Link className="rowc" href={`/tujuan/${primary.id}`}>
            <span className="icb">
              <GoalIcon icon={primary.category} />
            </span>
            <div className="col sp" style={{ gap: 0 }}>
              <p className="t b">
                {primary.title} · {formatPercent(goalProgress(primary))}
              </p>
              <p className="s mut num">
                {formatRupiah(primary.current_amount)} dari {formatRupiah(primary.target_amount)}
                {primaryMonth
                  ? primaryMonth.done
                    ? " · bulan ini aman"
                    : primaryMonth.first
                      ? ` · setoran pertama ${shortRupiah(primaryMonth.left)}`
                      : ` · bulan ini kurang ${shortRupiah(primaryMonth.left)}`
                  : primary.target_date
                    ? ` · target ${formatMonthYearShort(primary.target_date)}`
                    : ` · kurang ${formatRupiah(goalRemaining(primary))}`}
              </p>
            </div>
            <ChevronRight size={20} aria-hidden="true" style={{ color: "var(--mut)" }} />
          </Link>
        )}
        {goals.length > 1 || !primary ? (
          <div className="g4">
            {goals
              .filter((g) => g.id !== primary?.id)
              .slice(0, 3)
              .map((g) => (
                <GoalRing key={g.id} goal={g} />
              ))}
            <Link href="/tujuan?baru=1" className="col" style={{ alignItems: "center", gap: 6, textDecoration: "none", color: "var(--ink)", minHeight: 44 }}>
              <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="27" fill="none" strokeWidth="1.5" strokeDasharray="4 5" style={{ stroke: "var(--ctl)" }} />
                <path d="M32 23v18M23 32h18" fill="none" strokeWidth="2" strokeLinecap="round" style={{ stroke: "var(--ink)" }} />
              </svg>
              <span className="s b" style={{ fontSize: 12, textAlign: "center" }}>
                Tujuan baru
              </span>
            </Link>
          </div>
        ) : null}
        {goals.length === 0 && <p className="s mut">Belum ada tujuan. Mulai dari yang kecil, misalnya Rp1 juta pertama, lalu setor sedikit-sedikit.</p>}
      </section>
    </main>
  );
}
