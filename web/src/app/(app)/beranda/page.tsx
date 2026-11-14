"use client";

import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, Pencil, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { CashFlowChart, CategoryDonut, SLICE_COLORS } from "@/components/charts";
import { useShell } from "@/components/shell";
import { Segmented } from "@/components/ui/controls";
import { GoalIcon } from "@/components/ui/icons";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { formatMonthYearShort, greeting } from "@/lib/date";
import {
  type Period,
  categoryBreakdown,
  changePct,
  cumulativeSeries,
  periodRange,
  recordedBalance,
  roundedPercents,
  topCategoryNames,
  totals,
} from "@/lib/finance";
import { goalProgress, goalRemaining, sortGoals } from "@/lib/goals";
import { formatPercent, formatRupiah, percent } from "@/lib/money";
import type { Goal } from "@/lib/types";

const PERIOD_LABEL: Record<Period, string> = { week: "Minggu", month: "Bulan", year: "Tahun" };

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
  const { openAddTx } = useShell();
  const [period, setPeriod] = useState<Period>("month");

  const txs = data.transactions;
  const r = useMemo(() => periodRange(period, today), [period, today]);
  const cur = useMemo(() => totals(txs, r.start, r.end), [txs, r]);
  const prev = useMemo(() => totals(txs, r.prevStart, r.prevEnd), [txs, r]);
  const series = useMemo(() => cumulativeSeries(txs, period, today), [txs, period, today]);
  const slices = useMemo(() => categoryBreakdown(txs, data.categories, r.start, r.end, "expense", 4), [txs, data.categories, r]);
  const pcts = roundedPercents(slices.map((s) => s.amount));
  const balance = recordedBalance(data.financial?.current_savings ?? 0, txs);
  const change = changePct(cur.net, prev.net);
  const incomeNames = topCategoryNames(txs, data.categories, r.start, r.end, "income", 2);
  const goals = sortGoals(data.goals);
  const primary = goals.find((g) => g.status === "active");
  const todayCount = txs.filter((t) => t.transaction_date === today).length;
  const name = data.userProfile?.display_name ?? session?.email.split("@")[0] ?? "";
  const periodName = period === "month" ? r.label : period === "week" ? "minggu ini" : `tahun ${r.label}`;

  return (
    <main className="scr safe" style={{ paddingBottom: 24 }}>
      <div className="row">
        <div className="col sp" style={{ gap: 0 }}>
          <h1 className="h2" style={{ fontSize: 20 }}>
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
          <p className="s mut">Yuk, bikin uangmu kerja lebih baik bulan ini.</p>
        </div>
        <Link className="ava" href="/profil" aria-label={`Profil ${name}`}>
          {(name || "?").charAt(0).toUpperCase()}
        </Link>
      </div>

      <section className="col" style={{ gap: 6 }} aria-label="Arus kas bersih">
        <p className="sec">Arus kas bersih · {r.label}</p>
        {cur.count === 0 ? (
          <div className="card" style={{ marginTop: 4 }}>
            <p className="h3">Belum ada transaksi {periodName}</p>
            <p className="s mut">
              Catat pemasukan dan pengeluaranmu. Arus kas bersih (pemasukan dikurangi pengeluaran) dan grafiknya muncul di sini.
            </p>
            <button className="btn sm" type="button" style={{ alignSelf: "flex-start" }} onClick={() => openAddTx()}>
              <Plus size={18} aria-hidden="true" />
              Catat transaksi
            </button>
          </div>
        ) : (
          <>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <p className="big" style={{ fontSize: 36 }}>
                {formatRupiah(cur.net)}
              </p>
              {change !== null && (
                <span className={`tag${change < 0 ? " amb" : ""}`}>
                  {change >= 0 ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
                  {Math.abs(change)}% dari {r.prevLabel}
                </span>
              )}
            </div>
            <CashFlowChart
              series={series}
              prevLabel={r.prevLabel}
              showPrevious={prev.count > 0}
              ariaLabel={`Grafik arus kas bersih ${r.label}${prev.count > 0 ? ` dibanding ${r.prevLabel}` : ""}. Saat ini ${formatRupiah(cur.net)}.`}
            />
          </>
        )}
        <p className="s mut">
          {cur.count > 0 && prev.count > 0 && <>Garis putus-putus: {r.prevLabel}. </>}
          Saldo tercatat{" "}
          <span className="b num" style={{ color: "var(--ink)" }}>
            {formatRupiah(balance)}
          </span>{" "}
          (dicatat manual: tabungan awal + semua pemasukan − pengeluaran).
        </p>
      </section>

      <Segmented
        label="Rentang waktu"
        value={period}
        onChange={setPeriod}
        options={(["week", "month", "year"] as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
      />

      <div className="g2">
        <div className="card" style={{ gap: 6, padding: 14 }}>
          <p className="sec">Masuk</p>
          <p className="h2 num">{formatRupiah(cur.income)}</p>
          <ProgressBar thin value={cur.income > 0 ? 100 : 0} />
          <p className="s mut">{incomeNames.length ? incomeNames.join(" + ") : "Belum ada pemasukan"}</p>
        </div>
        <div className="card" style={{ gap: 6, padding: 14 }}>
          <p className="sec">Keluar</p>
          <p className="h2 num">{formatRupiah(cur.expense)}</p>
          <ProgressBar thin value={cur.income > 0 ? percent(cur.expense, cur.income) : cur.expense > 0 ? 100 : 0} color="var(--c4)" />
          <p className="s mut num">
            {cur.income > 0 ? `${Math.round((cur.expense / cur.income) * 100)}% dari pemasukan` : cur.expense > 0 ? "Belum ada pemasukan" : "Belum ada pengeluaran"}
          </p>
        </div>
      </div>

      <section className="col" style={{ gap: 10 }} aria-label="Tujuan">
        <div className="row">
          <p className="sec sp">Tujuan</p>
          <Link className="lnk" href="/tujuan">
            Lihat semua
          </Link>
        </div>
        <div className="g4">
          {goals.slice(0, 3).map((g) => (
            <GoalRing key={g.id} goal={g} />
          ))}
          <Link href="/tujuan?baru=1" className="col" style={{ alignItems: "center", gap: 6, textDecoration: "none", color: "var(--ink)" }}>
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="27" fill="none" strokeWidth="1.5" strokeDasharray="4 5" style={{ stroke: "var(--ctl)" }} />
              <path d="M32 23v18M23 32h18" fill="none" strokeWidth="2" strokeLinecap="round" style={{ stroke: "var(--ink)" }} />
            </svg>
            <span className="s b" style={{ fontSize: 12, textAlign: "center" }}>
              Tujuan baru
            </span>
          </Link>
        </div>
        {primary ? (
          <Link className="rowc" href={`/tujuan/${primary.id}`}>
            <div className="col sp" style={{ gap: 0 }}>
              <p className="t b">
                {primary.title} · {formatPercent(goalProgress(primary))}
              </p>
              <p className="s mut num">
                {formatRupiah(primary.current_amount)} dari {formatRupiah(primary.target_amount)}
                {primary.target_date ? ` · target ${formatMonthYearShort(primary.target_date)}` : ` · sisa ${formatRupiah(goalRemaining(primary))}`}
              </p>
            </div>
            <ChevronRight size={20} aria-hidden="true" style={{ color: "var(--mut)" }} />
          </Link>
        ) : (
          goals.length === 0 && <p className="s mut">Belum ada tujuan. Bikin satu, misalnya Rp1 juta pertama, lalu setor sedikit-sedikit.</p>
        )}
      </section>

      <section className="card" aria-label="Pengeluaran per kategori">
        <p className="sec">Pengeluaran per kategori · {r.label}</p>
        {slices.length === 0 ? (
          <p className="s mut">Belum ada pengeluaran {periodName}. Setelah kamu mencatat, pembagian per kategori muncul di sini.</p>
        ) : (
          <div className="row" style={{ gap: 16 }}>
            <CategoryDonut slices={slices} total={cur.expense} />
            <ul className="col sp" style={{ gap: 7, listStyle: "none", margin: 0, padding: 0 }}>
              {slices.map((s, i) => (
                <li key={s.name} className="row" style={{ gap: 8 }}>
                  <i style={{ width: 10, height: 10, borderRadius: 3, background: SLICE_COLORS[i % SLICE_COLORS.length], flex: "none" }} aria-hidden="true" />
                  <span className="s sp">{s.name}</span>
                  <span className="s b num">{pcts[i]}%</span>
                  <span className="sr-only">{formatRupiah(s.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {slices.length > 0 && (
        <section className="card blu" aria-label="Catatan periode ini">
          <div className="row">
            <span className="icb" style={{ background: "var(--sf)", color: "var(--blu)" }}>
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <p className="h3 sp">Catatan {periodName}</p>
          </div>
          <p className="t">
            Pengeluaran terbesarmu: <span className="b">{slices[0].name}</span>, <span className="b num">{formatRupiah(slices[0].amount)}</span> ({pcts[0]}% dari
            pengeluaran). {cur.income > 0 && cur.net < 0 ? "Pengeluaranmu sudah melebihi pemasukan." : ""}
          </p>
          <Link className="lnk" href="/coach" style={{ color: "var(--blu)" }}>
            Bahas dengan AI Coach
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </section>
      )}

      <section className="card" aria-label="Misi hari ini">
        <div className="row">
          <span className={`icb ${todayCount > 0 ? "g" : ""}`}>{todayCount > 0 ? <Check size={20} aria-hidden="true" /> : <Pencil size={20} aria-hidden="true" />}</span>
          <div className="col sp">
            <p className="sec">Misi hari ini</p>
            <p className="t b">{todayCount > 0 ? `Sudah mencatat ${todayCount} transaksi hari ini` : "Catat pengeluaranmu hari ini"}</p>
          </div>
        </div>
        <div className="row">
          <span className="s mut sp">{todayCount > 0 ? "Mantap. Ada yang kelewat? Tambah lagi." : "Kurang dari 10 detik."}</span>
          <button className="lnk" type="button" onClick={() => openAddTx()}>
            {todayCount > 0 ? "Tambah" : "Kerjakan"}
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
    </main>
  );
}
