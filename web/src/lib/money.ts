const MINUS = "−";
const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export const MAX_AMOUNT = 1_000_000_000_000;

/** Rp1.500.000 (negative values get a true minus sign: −Rp1.500.000). */
export function formatRupiah(value: number): string {
  const n = Math.round(value);
  const body = `Rp${nf.format(Math.abs(n))}`;
  return n < 0 ? `${MINUS}${body}` : body;
}

/** +Rp350.000 / −Rp35.000. Zero has no sign. */
export function formatSigned(value: number): string {
  const n = Math.round(value);
  if (n === 0) return "Rp0";
  return `${n > 0 ? "+" : MINUS}Rp${nf.format(Math.abs(n))}`;
}

/** Compact label for chart centres: 2,93 jt · 750 rb · 1,2 M. */
export function formatShort(value: number): string {
  const n = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  const fmt = (x: number, unit: string) =>
    `${sign}${new Intl.NumberFormat("id-ID", { maximumFractionDigits: x < 10 ? 2 : 1 }).format(x)} ${unit}`;
  if (n >= 1_000_000_000) return fmt(n / 1_000_000_000, "M");
  if (n >= 1_000_000) return fmt(n / 1_000_000, "jt");
  if (n >= 1_000) return `${sign}${Math.floor(n / 1_000)} rb`;
  return `${sign}${n}`;
}

/** Parses user text such as "Rp 1.500.000" or "1500000" into whole rupiah. */
export function parseRupiahInput(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n > MAX_AMOUNT) return null;
  return n;
}

/** Formats a typed amount for display in an input: 1500000 -> "1.500.000". */
export function formatAmountInput(value: number | null | undefined): string {
  return value == null ? "" : nf.format(value);
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/** 42,5% — one decimal only when needed. */
export function formatPercent(p: number): string {
  const r = Math.round(p * 10) / 10;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(r)}%`;
}

export function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function roundDownTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}
