export const TIMEZONE = "Asia/Jakarta";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date in Asia/Jakarta as YYYY-MM-DD. */
export function todayJakarta(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function hourJakarta(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Current time of day in Jakarta, "HH:MM". */
export function timeJakarta(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

export function greeting(now: Date = new Date()): string {
  const h = hourJakarta(now);
  if (h >= 4 && h < 11) return "Selamat pagi";
  if (h >= 11 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

function parts(d: string): [number, number, number] {
  const [y, m, day] = d.split("-").map(Number);
  return [y, m, day ?? 1];
}

function toUTC(d: string): Date {
  const [y, m, day] = parts(d);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUTC(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function isValidDate(d: string): boolean {
  if (!DATE_RE.test(d)) return false;
  return fromUTC(toUTC(d)) === d;
}

export function addDays(d: string, n: number): string {
  const dt = toUTC(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = parts(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(day, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function startOfMonth(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: string): string {
  const [y, m] = parts(d);
  return `${d.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

/** Monday of the week containing d. */
export function startOfWeek(d: string): string {
  const dow = toUTC(d).getUTCDay(); // 0 = Sunday
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** Whole calendar months from `from` to `to` (Nov 2026 -> Jun 2027 = 7). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  return (ty - fy) * 12 + (tm - fm);
}

export function monthName(month: number): string {
  return MONTHS[month - 1];
}

export function monthShortName(month: number): string {
  return MONTHS_SHORT[month - 1];
}

/** "Agustus 2027" */
export function formatMonthYear(d: string): string {
  const [y, m] = parts(d);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Agu 2027" */
export function formatMonthYearShort(d: string): string {
  const [y, m] = parts(d);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "1 November 2026" */
export function formatLongDate(d: string): string {
  const [y, m, day] = parts(d);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

/** "14 Nov" */
export function formatDayMonth(d: string): string {
  const [, m, day] = parts(d);
  return `${day} ${MONTHS_SHORT[m - 1]}`;
}

/** "Sab, 14 Nov" (year appended when it differs from today's). */
export function formatShortDay(d: string, today: string = todayJakarta()): string {
  const [y] = parts(d);
  const base = `${DAYS_SHORT[toUTC(d).getUTCDay()]}, ${formatDayMonth(d)}`;
  return y === parts(today)[0] ? base : `${base} ${y}`;
}

/** Section label for transaction day groups. */
export function formatDayHeading(d: string, today: string = todayJakarta()): string {
  if (d === today) return `Hari ini · ${formatShortDay(d, today)}`;
  if (d === addDays(today, -1)) return `Kemarin · ${formatShortDay(d, today)}`;
  return formatShortDay(d, today);
}

export function relativeDayLabel(d: string, today: string = todayJakarta()): string {
  if (d === today) return "Hari ini";
  if (d === addDays(today, -1)) return "Kemarin";
  return formatShortDay(d, today);
}
