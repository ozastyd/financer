// Turning a read notification into an inbox item: when it happened (Jakarta
// calendar), a fingerprint so the same notification is only added once, and
// a category suggestion the user can change before saving.
import type { Category } from "../types";
import type { ParsedNotification, RawNotification } from "./parse";

const TZ = "Asia/Jakarta";

/** Jakarta date and minute of the notification (the phone's post time, else now). */
export function occurredAt(postedAt: string | undefined, now: Date = new Date()): { date: string; time: string } {
  const t = postedAt ? new Date(postedAt) : now;
  const at = Number.isNaN(t.getTime()) || t.getTime() > now.getTime() + 5 * 60_000 ? now : t;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return { date, time };
}

/** The same notification (re-posted or sent twice) has the same fingerprint. */
export function fingerprintSource(n: RawNotification): string {
  const minute = n.postedAt ? n.postedAt.slice(0, 16) : "";
  return [n.packageName, n.title.trim(), n.text.replace(/\s+/g, " ").trim(), minute].join("|");
}

/** Words in an app's own category or description that point to one of ours (by icon key). */
const HINTS: [RegExp, string][] = [
  [/makan|minum|kuliner|resto|food|kopi|cafe/i, "makan"],
  [/transport|bensin|parkir|tol|ojek|grab|gojek|kereta|krl/i, "transport"],
  [/belanja|shopping|minimarket|indomaret|alfamart|supermarket|marketplace/i, "belanja"],
  [/hiburan|bioskop|game|entertain/i, "hiburan"],
  [/langganan|subscription|netflix|spotify|youtube/i, "langganan"],
  [/pendidikan|kursus|sekolah|kuliah|ukt|spp/i, "pendidikan"],
  [/kos|sewa|rumah|kontrakan/i, "rumah"],
  [/tagihan|listrik|pln|pulsa|paket data|internet|pdam|bpjs|tv kabel/i, "tagihan"],
  [/kesehatan|apotek|dokter|klinik|rumah sakit/i, "kesehatan"],
  [/cicilan|paylater|kartu kredit|pinjaman|utang/i, "utang"],
  [/gaji|payroll|salary/i, "gaji"],
];

/** A category of the right type to preselect; "Lainnya" when nothing fits. */
export function suggestCategory(p: Pick<ParsedNotification, "type" | "categoryHint" | "description">, categories: Category[]): string | null {
  const own = categories.filter((c) => c.type === p.type);
  const text = `${p.categoryHint ?? ""} ${p.description}`;
  const byName = own.find((c) => p.categoryHint && c.name.toLowerCase() === p.categoryHint.toLowerCase());
  if (byName) return byName.id;
  for (const [re, icon] of HINTS) {
    if (re.test(text)) {
      const hit = own.find((c) => c.icon === icon);
      if (hit) return hit.id;
    }
  }
  return own.find((c) => c.icon === "lainnya")?.id ?? own[0]?.id ?? null;
}
