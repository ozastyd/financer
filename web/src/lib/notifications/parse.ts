// Reads bank and e-wallet notifications into transactions.
//
// The Android app forwards notifications only from the allow-listed apps
// below; the reading happens here on the server, so a bank changing its wording
// is fixed without shipping a new app. Every rule is backed by a real sample in
// parse.test.ts (names and numbers replaced). Anything not recognised returns
// null and is never recorded: promos, OTPs, logins, failed transactions.

export type NotifSource = "mybca" | "livin" | "brimo" | "dana" | "shopeepay" | "gopay" | "ovo";

export interface RawNotification {
  /** Android package name of the app that posted it. */
  packageName: string;
  title: string;
  text: string;
  /** When the phone received it (ISO 8601). */
  postedAt?: string;
}

export interface ParsedNotification {
  source: NotifSource;
  type: "income" | "expense";
  amount: number;
  /** Who the money came from or went to, when the notification names them (masked names dropped). */
  counterparty: string | null;
  /** The app's own label, e.g. myBCA's "Transfer Rekening". */
  categoryHint: string | null;
  /** Short description to show and save, e.g. "Transfer masuk · Budi". */
  description: string;
  /** True for movements that are often between the user's own accounts (needs a look before counting). */
  maybeTransfer: boolean;
}

/**
 * Apps whose notifications are read. Package names are confirmed against the
 * "rekam notifikasi" test mode before release; labels are the fallback.
 */
export const SOURCES: { source: NotifSource; packages: string[]; label: string }[] = [
  { source: "mybca", packages: ["com.bca.mybca.omni.android"], label: "myBCA" },
  { source: "livin", packages: ["id.bmri.livin"], label: "Livin' by Mandiri" },
  { source: "brimo", packages: ["id.co.bri.brimo"], label: "BRImo" },
  { source: "dana", packages: ["id.dana"], label: "DANA" },
  { source: "shopeepay", packages: ["com.shopee.id"], label: "ShopeePay" },
  { source: "gopay", packages: ["com.gojek.gopay", "com.gojek.app"], label: "GoPay" },
  { source: "ovo", packages: ["ovo.id"], label: "OVO" },
];

export function sourceOf(packageName: string): NotifSource | null {
  return SOURCES.find((s) => s.packages.includes(packageName))?.source ?? null;
}

/**
 * Rupiah amount from text in either style: "5.000", "Rp 1.500.000,00",
 * "IDR 10,000.00", "10000.00". A separator followed by exactly two digits at
 * the end is decimals (dropped: rupiah are whole); every other separator
 * groups thousands.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, "").replace(/,-$/, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  // "10,000.00", "1.500.000,00", "10000.00": the last separator is decimals
  // when it isn't also used as a thousands separator before it.
  const dec = s.match(/^(.*?)([.,])(\d{2})$/);
  if (dec && !dec[1].includes(dec[2])) s = dec[1];
  const digits = s.replace(/[.,]/g, "");
  if (!digits || digits.length > 13) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const AMOUNT = String.raw`(?:Rp|IDR)\s?([\d][\d.,]*\d|\d)`;
/** Masked names like "***HEA ****YRA *UT" say nothing useful. */
const cleanName = (s: string | undefined | null) => {
  const t = (s ?? "").replace(/\s*[\p{Extended_Pictographic}️]+/gu, "").trim().replace(/[.,]$/, "");
  if (!t || /\*{2,}/.test(t) || /•{2,}/.test(t)) return null;
  // ALL CAPS NAMES read better as Title Case.
  return t === t.toUpperCase() ? t.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : t;
};

/** Wording that is never a completed transaction. */
const IGNORE = /\b(OTP|kode verifikasi|jangan berikan|promo|cashback hingga|diskon|voucher|login|masuk ke akun|gagal|dibatalkan|pending|sedang diproses|menunggu)\b/i;

type Rule = (n: { title: string; text: string }) => Omit<ParsedNotification, "source"> | null;

const RULES: Partial<Record<NotifSource, Rule[]>> = {
  mybca: [
    // "Pemasukan sebesar IDR 10,000.00 dari ***HEA ****YRA *UT di kategori Transfer Rekening."
    // "Pengeluaran sebesar IDR 10,000.00 di kategori Transfer Rekening."
    ({ text }) => {
      const m = text.match(new RegExp(String.raw`^(Pemasukan|Pengeluaran)\s+sebesar\s+${AMOUNT}(?:\s+dari\s+(.+?))?(?:\s+ke\s+(.+?))?\s+di\s+kategori\s+(.+?)\.?\s*$`, "i"));
      if (!m) return null;
      const amount = parseAmount(m[2]);
      if (!amount) return null;
      const income = /^pemasukan$/i.test(m[1]);
      const who = cleanName(income ? m[3] : m[4]);
      const hint = m[5].trim();
      return {
        type: income ? "income" : "expense",
        amount,
        counterparty: who,
        categoryHint: hint,
        description: `${hint}${who ? ` · ${who}` : ""}`,
        maybeTransfer: /transfer|top ?up|tarik tunai/i.test(hint),
      };
    },
  ],
  dana: [
    // "Rp3.500 telah diterima dari NAMA PENGIRIM 💰"
    ({ text }) => received(text, "Uang masuk DANA"),
  ],
  shopeepay: [
    // title "Saldo ShopeePay Diterima", "Rp5.000 telah diterima dari Nama Pengirim. Klik untuk cek rinciannya."
    ({ text }) => received(text, "Uang masuk ShopeePay"),
  ],
  gopay: [
    // title "Transfer masuk", "Rp5.000 dari Nama Pengirim udah masuk ke GoPay kamu."
    ({ text }) => {
      const m = text.match(new RegExp(String.raw`^${AMOUNT}\s+dari\s+(.+?)\s+(?:udah|sudah)\s+masuk\s+ke\s+GoPay`, "i"));
      const amount = m && parseAmount(m[1]);
      if (!m || !amount) return null;
      const who = cleanName(m[2]);
      return { type: "income", amount, counterparty: who, categoryHint: null, description: `Uang masuk GoPay${who ? ` · ${who}` : ""}`, maybeTransfer: true };
    },
    // title "Yes, sukses transfer", "Kamu berhasil transfer Rp5.000 ke Nama Penerima."
    ({ text }) => {
      const m = text.match(new RegExp(String.raw`berhasil\s+transfer\s+${AMOUNT}\s+ke\s+(.+?)\.?\s*$`, "i"));
      const amount = m && parseAmount(m[1]);
      if (!m || !amount) return null;
      const who = cleanName(m[2]);
      return { type: "expense", amount, counterparty: who, categoryHint: "Transfer", description: `Transfer GoPay${who ? ` · ${who}` : ""}`, maybeTransfer: true };
    },
  ],
};

/** "Rp5.000 telah diterima dari Nama[. Klik …]" — the shared e-wallet wording. */
function received(text: string, label: string): Omit<ParsedNotification, "source"> | null {
  const m = text.match(new RegExp(String.raw`${AMOUNT}\s+telah\s+diterima\s+dari\s+(.+?)(?:\.\s|\.$|\s+Klik\b|$)`, "i"));
  if (!m) return null;
  const amount = parseAmount(m[1]);
  if (!amount) return null;
  const who = cleanName(m[2]);
  return { type: "income", amount, counterparty: who, categoryHint: null, description: `${label}${who ? ` · ${who}` : ""}`, maybeTransfer: true };
}

/** A transaction read from a notification, or null when it isn't one we recognise. */
export function parseNotification(n: RawNotification): ParsedNotification | null {
  const source = sourceOf(n.packageName);
  if (!source) return null;
  const title = (n.title ?? "").trim();
  const text = (n.text ?? "").replace(/\s+/g, " ").trim();
  if (!text || IGNORE.test(`${title} ${text}`)) return null;
  for (const rule of RULES[source] ?? []) {
    const r = rule({ title, text });
    if (r) return { source, ...r };
  }
  return null;
}
