import type { ReactNode } from "react";

export function ProgressBar({ value, color, thin, label }: { value: number; color?: string; thin?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`bar${thin ? " thin" : ""}`}
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(v) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-hidden={label ? undefined : true}
    >
      <i style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

interface RingProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  done?: boolean;
  label: string;
  children?: ReactNode;
  inner?: string;
}

/** Circular progress. `done` draws a full ring in the primary colour. */
export function ProgressRing({ value, size = 64, stroke = 5, color = "var(--pri)", done, label, children, inner }: RingProps) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const dash = (v / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: done ? "var(--pri)" : "var(--sf2)" }} />
        {!done && v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="ring-arc"
            style={{ stroke: color }}
          />
        )}
        {inner && <circle cx={size / 2} cy={size / 2} r={r - stroke * 2.2} style={{ fill: inner }} />}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}
