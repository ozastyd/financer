"use client";

import { ArrowDownLeft, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { useShell } from "@/components/shell";
import { Chip } from "@/components/ui/controls";
import { CategoryIcon } from "@/components/ui/icons";
import { addMonths, endOfMonth, formatDayHeading, formatMonthYearShort, startOfMonth } from "@/lib/date";
import { formatRupiah, formatSigned } from "@/lib/money";
import { type TxRow, useMonthTotals, useTransactionPages } from "@/lib/queries";
import { takeTransaksiJump } from "@/lib/scan-client";

type Filter = "all" | "expense" | "income";

interface DayGroup {
  date: string;
  net: number;
  items: TxRow[];
}

/** Rows arrive newest first; consecutive rows of the same day form one group. */
function groupRows(rows: TxRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const t of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.transaction_date) last.items.push(t);
    else groups.push({ date: t.transaction_date, net: t.day_net, items: [t] });
  }
  return groups;
}

export default function TransaksiPage() {
  const { data, today } = useApp();
  const { openAddTx } = useShell();
  const [month, setMonth] = useState(() => startOfMonth(today));
  // Rows just saved from a scan: open their month and highlight them briefly.
  const [justSaved, setJustSaved] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const jump = takeTransaksiJump();
    if (!jump) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hand-off from the scan screen
    setMonth(startOfMonth(jump.month));
    setJustSaved(new Set(jump.ids));
    const t = window.setTimeout(() => setJustSaved(new Set()), 4000);
    return () => window.clearTimeout(t);
  }, []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const search = useDeferredValue(query);

  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const monthEnd = endOfMonth(month);
  const totalsQuery = useMonthTotals(month, monthEnd);
  const pagesQuery = useTransactionPages(month, monthEnd, filter === "all" ? null : filter, search);

  const rows = useMemo(() => pagesQuery.data?.pages.flat() ?? [], [pagesQuery.data]);
  const groups = useMemo(() => groupRows(rows), [rows]);
  const sum = totalsQuery.data;
  const isCurrentMonth = month === startOfMonth(today);
  const loading = pagesQuery.isPending || totalsQuery.isPending;
  const failed = pagesQuery.isError || totalsQuery.isError;

  return (
    <main className="scr safe" style={{ gap: 14 }}>
      <div className="row">
        <h1 className="h1 sp" style={{ fontSize: 24 }}>
          Transaksi
        </h1>
        <div className="row" style={{ gap: 4 }} role="group" aria-label="Pilih bulan">
          <button type="button" className="ibtn" aria-label="Bulan sebelumnya" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="s b num" style={{ minWidth: 72, textAlign: "center" }} aria-live="polite">
            {formatMonthYearShort(month)}
          </span>
          <button type="button" className="ibtn" aria-label="Bulan berikutnya" disabled={isCurrentMonth} style={{ opacity: isCurrentMonth ? 0.4 : 1 }} onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <Search size={20} aria-hidden="true" style={{ position: "absolute", left: 16, top: 14, color: "var(--mut)" }} />
        <input
          className="inp"
          type="search"
          aria-label="Cari transaksi"
          placeholder="Cari catatan, kategori, atau jumlah"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ height: 48, paddingLeft: 46, fontSize: 15, borderRadius: 999 }}
        />
      </div>

      <div className="wrap" role="group" aria-label="Filter jenis">
        {(
          [
            ["all", "Semua"],
            ["expense", "Keluar"],
            ["income", "Masuk"],
          ] as [Filter, string][]
        ).map(([v, l]) => (
          <Chip key={v} filter on={filter === v} onClick={() => setFilter(v)}>
            {l}
          </Chip>
        ))}
      </div>

      {sum && sum.count > 0 && (
        <p className="s mut num">
          {formatMonthYearShort(month)}: masuk <span className="b pos">{formatRupiah(sum.income)}</span> · keluar{" "}
          <span className="b" style={{ color: "var(--ink)" }}>
            {formatRupiah(sum.expense)}
          </span>
        </p>
      )}

      {failed && (
        <div className="card" style={{ marginTop: 4 }}>
          <p className="h3">Gagal memuat transaksi</p>
          <p className="s mut">Periksa koneksimu, lalu coba lagi.</p>
          <button
            className="btn sm"
            type="button"
            style={{ alignSelf: "flex-start" }}
            onClick={() => {
              void totalsQuery.refetch();
              void pagesQuery.refetch();
            }}
          >
            Coba lagi
          </button>
        </div>
      )}

      {!failed && loading && (
        <p className="s mut" aria-busy="true">
          Memuat transaksi…
        </p>
      )}

      {!failed && !loading && groups.length === 0 && (
        <div className="card" style={{ marginTop: 4 }}>
          {!sum?.hasAny ? (
            <>
              <p className="h3">Belum ada transaksi</p>
              <p className="s mut">Mulai dari yang kecil: kopi, ongkos ojek, atau uang masuk hari ini. Semua angka di aplikasi dihitung dari catatan ini.</p>
              <button className="btn sm" type="button" style={{ alignSelf: "flex-start" }} onClick={() => openAddTx()}>
                <Plus size={18} aria-hidden="true" />
                Catat transaksi pertama
              </button>
            </>
          ) : sum.count === 0 ? (
            <p className="s mut">Tidak ada transaksi di {formatMonthYearShort(month)}.</p>
          ) : (
            <p className="s mut">Tidak ada transaksi yang cocok dengan pencarian atau filter ini.</p>
          )}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.date} className="col" style={{ gap: 8, marginTop: 4 }} aria-label={formatDayHeading(g.date, today)}>
          <div className="row">
            <h2 className="sec sp">{formatDayHeading(g.date, today)}</h2>
            <p className="s mut num">{formatSigned(g.net)}</p>
          </div>
          {g.items.map((t) => {
            const cat = catById.get(t.category_id);
            const income = t.type === "income";
            return (
              <button key={t.id} type="button" className={`rowc${justSaved.has(t.id) ? " just-saved" : ""}`} onClick={() => openAddTx({ edit: t })} aria-label={`${t.description || cat?.name}, ${formatSigned(income ? t.amount : -t.amount)}. Ubah`}>
                <span className={`icb${income ? " g" : ""}`}>{income ? <ArrowDownLeft size={20} aria-hidden="true" /> : <CategoryIcon icon={cat?.icon ?? "lainnya"} />}</span>
                <span className="col sp" style={{ gap: 0 }}>
                  <span className="t b" style={{ overflowWrap: "anywhere" }}>
                    {t.description || cat?.name || "Transaksi"}
                  </span>
                  <span className="s mut">
                    {cat?.name ?? "Tanpa kategori"}
                    {income ? " · pemasukan" : ""}
                  </span>
                </span>
                <span className={`t b num${income ? " pos" : ""}`}>{formatSigned(income ? t.amount : -t.amount)}</span>
              </button>
            );
          })}
        </section>
      ))}

      {pagesQuery.isFetchNextPageError && (
        <div className="col" style={{ gap: 8, alignItems: "center", padding: "8px 0" }} role="status">
          <p className="s mut">Gagal memuat transaksi berikutnya.</p>
          <button className="btn ghost sm" type="button" style={{ borderRadius: 999 }} onClick={() => void pagesQuery.fetchNextPage()}>
            Coba lagi
          </button>
        </div>
      )}

      {pagesQuery.hasNextPage && !pagesQuery.isFetchNextPageError && (
        <button className="btn ghost" type="button" style={{ borderRadius: 999 }} disabled={pagesQuery.isFetchingNextPage} onClick={() => void pagesQuery.fetchNextPage()}>
          {pagesQuery.isFetchingNextPage ? "Memuat…" : "Muat lebih banyak"}
        </button>
      )}
    </main>
  );
}
