import { formatMonthYear } from "./date";
import { estimateCompletion } from "./goals";
import { formatRupiah, roundDownTo } from "./money";
import { GOAL_TEMPLATES } from "./options";
import type { FinancialProfile } from "./types";

export interface RecommendedGoal {
  key: string;
  title: string;
  icon: string;
  target: number;
  monthly: number | null;
  months: number | null;
  completionDate: string | null;
  reason: string;
}

export interface StartingProfile {
  income: number;
  outgoing: number;
  surplus: number;
  emergencyMonths: number | null;
  strengths: string[];
  improvements: string[];
  recommended: RecommendedGoal | null;
  firstAction: string;
}

const fmtMonths = (m: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(m);

/**
 * Builds the onboarding "starting point" purely from the user's answers.
 * Every figure shown is derived from what the user entered; nothing is invented.
 */
export function buildStartingProfile(fp: FinancialProfile, today: string): StartingProfile {
  const income = fp.monthly_income + fp.additional_income;
  const outgoing = fp.monthly_expenses + fp.monthly_obligations;
  const surplus = income - outgoing;
  const emergencyMonths = outgoing > 0 ? fp.current_savings / outgoing : null;

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (fp.monthly_income > 0 && (fp.income_frequency === "bulanan" || fp.income_frequency === "mingguan")) {
    strengths.push("Pemasukan rutin");
  }
  if (fp.current_savings > 0) strengths.push(`Sudah punya tabungan ${formatRupiah(fp.current_savings)}`);
  if (income > 0 && surplus > 0) strengths.push(`Pemasukan lebih besar dari pengeluaran (sisa ${formatRupiah(surplus)} per bulan)`);
  if (fp.existing_debt === 0 && fp.uses_paylater !== "sering") strengths.push("Tidak punya utang");
  if (fp.tracks_expenses === "rutin") strengths.push("Sudah biasa mencatat pengeluaran");
  if (fp.saves_regularly === "rutin") strengths.push("Sudah rutin menabung");
  if (fp.emergency_fund_status === "cukup") strengths.push("Dana darurat sudah cukup");

  if (income === 0) improvements.push("Belum ada pemasukan. Fokus dulu mencatat pengeluaran supaya tahu ke mana uangmu pergi.");
  else if (surplus <= 0) improvements.push("Pengeluaran dan cicilan masih sama atau lebih besar dari pemasukan");
  if (emergencyMonths !== null && emergencyMonths < 3 && fp.emergency_fund_status !== "cukup") {
    improvements.push(
      emergencyMonths < 0.1
        ? "Belum ada dana darurat"
        : `Tabunganmu baru cukup untuk ${fmtMonths(emergencyMonths)} bulan pengeluaran`,
    );
  }
  if (fp.existing_debt > 0) improvements.push(`Ada utang ${formatRupiah(fp.existing_debt)} yang perlu dilunasi`);
  if (fp.impulse_buying === "sering") improvements.push("Belanja impulsif masih sering");
  if (fp.uses_paylater === "sering") improvements.push("PayLater masih sering dipakai");
  if (fp.tracks_expenses === "tidak") improvements.push("Belum rutin mencatat pengeluaran");

  const monthly = surplus > 0 ? Math.max(roundDownTo(surplus * 0.5, 50_000), roundDownTo(surplus * 0.5, 5_000)) : 0;

  const pick = (key: string, target: number, reason: string): RecommendedGoal => {
    const t = GOAL_TEMPLATES.find((g) => g.key === key)!;
    const c = monthly > 0 ? estimateCompletion(target, monthly, today) : null;
    return {
      key,
      title: key === "darurat" ? "Dana darurat 3 bulan" : t.title,
      icon: t.icon,
      target,
      monthly: monthly > 0 ? monthly : null,
      months: c?.months ?? null,
      completionDate: c?.date ?? null,
      reason,
    };
  };

  let recommended: RecommendedGoal | null = null;
  const chose = (k: string) => fp.goal_choices.includes(k);
  if (fp.existing_debt > 0 && chose("utang")) {
    recommended = pick("utang", fp.existing_debt, "Melunasi utang dulu bikin pengeluaran bulananmu lebih ringan.");
  } else if (fp.current_savings < 1_000_000) {
    recommended = pick("rp1jt", 1_000_000, "Target kecil yang cepat tercapai, bagus untuk membangun kebiasaan.");
  } else if (outgoing > 0 && (emergencyMonths ?? 0) < 3 && fp.emergency_fund_status !== "cukup") {
    recommended = pick("darurat", outgoing * 3, `Setara 3 bulan pengeluaran dan cicilanmu (${formatRupiah(outgoing)} per bulan).`);
  } else if (fp.current_savings < 10_000_000) {
    recommended = pick("rp10jt", 10_000_000, "Langkah berikutnya setelah dana darurat aman.");
  }

  const firstAction =
    fp.tracks_expenses === "rutin"
      ? "Langkah pertama: catat pengeluaran hari ini di sini, supaya angkanya ikut terhitung."
      : "Langkah pertama: catat satu pengeluaran hari ini. Kurang dari 10 detik.";

  return { income, outgoing, surplus, emergencyMonths, strengths, improvements, recommended, firstAction };
}

export function describeCompletion(goal: RecommendedGoal): string | null {
  if (!goal.monthly || !goal.completionDate) return null;
  return `Dengan nabung ${formatRupiah(goal.monthly)} per bulan, tercapai sekitar ${formatMonthYear(goal.completionDate)}.`;
}
