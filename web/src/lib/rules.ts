import type { ContributionInput } from "./schemas";
import type { Category, Goal } from "./types";

// Business rules enforced on both the client and the server.

export function contributionError(goal: Pick<Goal, "status" | "current_amount">, input: Pick<ContributionInput, "kind" | "amount">): string | null {
  if (input.kind === "deposit" && goal.status === "paused") return "Tujuan ini sedang dijeda. Lanjutkan dulu untuk setor.";
  if (input.kind === "deposit" && goal.status === "completed") return "Tujuan ini sudah tercapai.";
  if (input.kind === "withdrawal" && goal.status === "completed") return "Tujuan ini sudah tercapai. Untuk memakai uangnya, pilih Pakai uangnya.";
  if (input.kind === "spend" && goal.status !== "completed") return "Uangnya bisa dipakai setelah tujuan tercapai.";
  if (input.kind !== "deposit" && input.amount > goal.current_amount) return "Jumlah melebihi saldo tujuan.";
  return null;
}

export function categoryError(category: Pick<Category, "type"> | undefined, type: "income" | "expense"): string | null {
  if (!category) return "Kategori tidak ditemukan.";
  if (category.type !== type) return "Kategori tidak cocok dengan jenis transaksi.";
  return null;
}
