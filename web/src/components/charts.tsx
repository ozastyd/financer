"use client";

import { Area, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { formatRupiah, formatShort } from "@/lib/money";
import type { SeriesPoint } from "@/lib/finance";
import { useReducedMotion } from "@/lib/motion";

export const SLICE_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];

interface TipProps {
  active?: boolean;
  payload?: { payload: SeriesPoint }[];
  prevLabel: string;
}

function ChartTip({ active, payload, prevLabel }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: "var(--ink)", color: "var(--bg)", borderRadius: 12, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>
      <div>
        {p.label} · {p.current == null ? "—" : formatRupiah(p.current)}
      </div>
      {p.previous != null && prevLabel && (
        <div style={{ fontWeight: 500, opacity: 0.85 }}>
          {prevLabel}: {formatRupiah(p.previous)}
        </div>
      )}
    </div>
  );
}

export function CashFlowChart({ series, prevLabel, ariaLabel, showPrevious }: { series: SeriesPoint[]; prevLabel: string; ariaLabel: string; showPrevious: boolean }) {
  const reduceMotion = useReducedMotion();
  const ticks = [series[0]?.key, series[Math.floor(series.length / 2)]?.key, series[series.length - 1]?.key].filter(Boolean) as string[];
  const labelOf = (k: string) => series.find((s) => s.key === k)?.label ?? "";
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: 150, marginTop: 6 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 10, right: 22, bottom: 0, left: 22 }}>
          <XAxis
            dataKey="key"
            ticks={ticks}
            tickFormatter={labelOf}
            interval={0}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
            tick={{ fill: "var(--mut)", fontSize: 11.5, fontWeight: 600 }}
          />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip content={<ChartTip prevLabel={showPrevious ? prevLabel : ""} />} cursor={{ stroke: "var(--ctl)", strokeWidth: 1 }} />
          {showPrevious && <Line type="monotone" dataKey="previous" stroke="var(--ctl)" strokeWidth={1.5} strokeDasharray="4 5" dot={false} isAnimationActive={false} />}
          <Area
            type="monotone"
            dataKey="current"
            stroke="var(--pri)"
            strokeWidth={2.5}
            fill="var(--pris)"
            fillOpacity={1}
            connectNulls={false}
            // a single recorded point (e.g. Monday in the week view) is drawn as a dot so it is visible
            dot={series.filter((p) => p.current !== null).length === 1 ? { r: 4, fill: "var(--pri)", stroke: "var(--bg)", strokeWidth: 2 } : false}
            activeDot={{ r: 5, stroke: "var(--pri)", strokeWidth: 2.5, fill: "var(--bg)" }}
            isAnimationActive={!reduceMotion}
            animationDuration={1100}
            animationEasing="ease-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDonut({ slices, total }: { slices: { name: string; amount: number }[]; total: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <div style={{ width: 104, height: 104, position: "relative", flex: "none" }} aria-hidden="true">
      <PieChart width={104} height={104}>
        <Pie data={slices} dataKey="amount" nameKey="name" innerRadius={33} outerRadius={47} startAngle={90} endAngle={-270} stroke="var(--sf)" strokeWidth={2} isAnimationActive={!reduceMotion} animationBegin={150} animationDuration={900} animationEasing="ease-out">
          {slices.map((s, i) => (
            <Cell key={s.name} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1.2 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mut)" }}>Keluar</div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{formatShort(total)}</div>
        </div>
      </div>
    </div>
  );
}
