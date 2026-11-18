// iPhone "Ketuk 2x belakang iPhone": a screenshot sent by the Financer shortcut
// is read by the scan, and what it finds goes to "Perlu dicek". These helpers
// decide what to add and what the shortcut shows as its notification.
import type { ScanResult } from "../scan";

export interface CaptureItem {
  type: "income" | "expense";
  amount: number;
  description: string;
  date: string | null;
  category_id: string | null;
}

/** A bank/e-wallet screen gives transactions; a store receipt gives one total. */
export function captureItems(r: Pick<ScanResult, "kind" | "merchant" | "date" | "total" | "category_id" | "transactions">): CaptureItem[] {
  if (r.transactions.length) {
    return r.transactions.slice(0, 10).map((t) => ({ type: t.type, amount: t.amount, description: t.description, date: t.date ?? r.date, category_id: t.category_id }));
  }
  if (r.kind === "receipt" && r.total) {
    return [{ type: "expense", amount: r.total, description: r.merchant ?? "Belanja", date: r.date, category_id: r.category_id }];
  }
  return [];
}

const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

/** One short line for the iPhone notification the shortcut shows. */
export function captureReply(items: CaptureItem[], added: number): string {
  if (!items.length) return "Tidak ada transaksi terbaca di layar ini. Coba di halaman bukti transaksi.";
  if (!added) return "Sudah tercatat sebelumnya. Cek di Financer › Perlu dicek.";
  const first = items[0];
  const line = `${first.description} ${first.type === "income" ? "+" : "−"}${rupiah(first.amount)}`;
  return added === 1 ? `Masuk ke Perlu dicek: ${line}` : `${added} transaksi masuk ke Perlu dicek, mulai dari ${line}`;
}
