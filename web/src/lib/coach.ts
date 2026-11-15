import { formatMonthYear } from "./date";
import type { Dashboard } from "./dashboard";
import { type CategoryAmount, periodRange, recordedBalance, slicesFromAmounts, totals } from "./finance";
import { estimateCompletion, goalProgress, goalRemaining } from "./goals";
import { formatRupiah } from "./money";
import type { Category, FinancialProfile, Goal, Transaction } from "./types";

/**
 * Compact, structured summary of the user's own figures sent to the AI.
 * No name, email or free-text notes are included.
 */
export interface FinancialSummary {
  today: string;
  has_onboarding: boolean;
  profile: {
    monthly_income: number;
    additional_income: number;
    monthly_expenses_estimate: number;
    monthly_obligations: number;
    existing_debt: number;
    starting_savings: number;
    emergency_fund_status: string | null;
    uses_paylater: string | null;
    biggest_challenge: string | null;
  } | null;
  this_month: { income: number; expense: number; net: number; transactions: number; top_expense_categories: { name: string; amount: number }[] };
  last_month: { income: number; expense: number; net: number };
  recorded_balance: number;
  goals: {
    title: string;
    status: string;
    target: number;
    saved: number;
    remaining: number;
    progress_pct: number;
    target_date: string | null;
    monthly_plan: number | null;
    estimated_completion: string | null;
  }[];
}

type SummaryInput = { financial: FinancialProfile | null; categories: Category[]; goals: Goal[] };

/** Builds the summary from raw transactions (used by tests and as a reference). */
export function buildFinancialSummary(data: SummaryInput & { transactions: Transaction[] }, today: string): FinancialSummary {
  const r = periodRange("month", today);
  const byCat = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.type !== "expense" || t.transaction_date < r.start || t.transaction_date > r.end) continue;
    byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + t.amount);
  }
  const expenseByCategory: CategoryAmount[] = [...byCat.entries()].map(([category_id, amount]) => ({ category_id, amount }));
  const dash: Pick<Dashboard, "current" | "previous" | "expenseByCategory" | "recordedBalance"> = {
    current: totals(data.transactions, r.start, r.end),
    previous: totals(data.transactions, r.prevStart, r.prevEnd),
    expenseByCategory,
    recordedBalance: recordedBalance(data.financial?.current_savings ?? 0, data.transactions),
  };
  return summaryFromDashboard(data, dash, today);
}

/** Builds the summary from the month dashboard computed by the database. */
export function summaryFromDashboard(
  data: SummaryInput,
  dash: Pick<Dashboard, "current" | "previous" | "expenseByCategory" | "recordedBalance">,
  today: string,
): FinancialSummary {
  const cur = dash.current;
  const prev = dash.previous;
  const fp = data.financial;
  return {
    today,
    has_onboarding: Boolean(fp?.onboarding_completed),
    profile: fp
      ? {
          monthly_income: fp.monthly_income,
          additional_income: fp.additional_income,
          monthly_expenses_estimate: fp.monthly_expenses,
          monthly_obligations: fp.monthly_obligations,
          existing_debt: fp.existing_debt,
          starting_savings: fp.current_savings,
          emergency_fund_status: fp.emergency_fund_status,
          uses_paylater: fp.uses_paylater,
          biggest_challenge: fp.biggest_challenge,
        }
      : null,
    this_month: {
      income: cur.income,
      expense: cur.expense,
      net: cur.net,
      transactions: cur.count,
      top_expense_categories: slicesFromAmounts(dash.expenseByCategory, data.categories, 4).map((s) => ({ name: s.name, amount: s.amount })),
    },
    last_month: { income: prev.income, expense: prev.expense, net: prev.net },
    recorded_balance: dash.recordedBalance,
    goals: data.goals.slice(0, 10).map((g) => {
      const est = g.monthly_plan ? estimateCompletion(goalRemaining(g), g.monthly_plan, today) : null;
      return {
        title: g.title.slice(0, 60),
        status: g.status,
        target: g.target_amount,
        saved: g.current_amount,
        remaining: goalRemaining(g),
        progress_pct: Math.round(goalProgress(g) * 10) / 10,
        target_date: g.target_date,
        monthly_plan: g.monthly_plan,
        estimated_completion: est?.date ?? null,
      };
    }),
  };
}

export const COACH_SYSTEM_PROMPT = `Kamu adalah AI Coach di aplikasi Financial OS untuk anak muda Indonesia (18–30 tahun).
Gaya: bahasa Indonesia santai dan ramah (pakai "kamu"), singkat, jelas, tanpa istilah perbankan yang kaku. Jangan pernah mempermalukan pengguna.

Kamu menerima ringkasan data keuangan pengguna dalam JSON. Aturan:
- Gunakan hanya angka dari ringkasan itu. Jangan mengarang angka. Kalau data kurang, bilang data apa yang perlu dicatat.
- Bedakan dengan jelas: angka tercatat (dari data), perkiraan (hasil hitunganmu), dan asumsi (misalnya "tanpa bunga").
- Tulis rupiah seperti Rp1.500.000.
- Untuk pertanyaan "mampu beli nggak", beri salah satu: "Mampu", "Mampu, tapi hati-hati", atau "Belum disarankan sekarang", lalu dampaknya ke tujuan, alternatif, dan kapan jadi lebih aman.
- Jangan menjanjikan imbal hasil investasi dan jangan merekomendasikan produk investasi tertentu. Kamu memberi edukasi finansial, bukan nasihat keuangan berlisensi.
- Jawab maksimal sekitar 180 kata, boleh pakai poin pendek. Jangan pakai tabel atau heading markdown.`;

const amountRe = /(?:rp\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)\s*(jt|juta|rb|ribu|k)?\b/i;

/** Extracts the first rupiah amount from a question: "Rp15 juta", "15jt", "1.500.000", "500rb". */
export function extractAmount(text: string): number | null {
  const m = text.match(amountRe);
  if (!m) return null;
  const unit = (m[2] ?? "").toLowerCase();
  const raw = m[1];
  let n: number;
  if (unit === "jt" || unit === "juta") n = Number(raw.replace(",", ".").replace(/\.(?=\d{3}\b)/g, "")) * 1_000_000;
  else if (unit === "rb" || unit === "ribu" || unit === "k") n = Number(raw.replace(/[.,]/g, "")) * 1_000;
  else n = Number(raw.replace(/[.,]/g, ""));
  if (!Number.isFinite(n) || n < 1000) return null;
  return Math.round(n);
}

/**
 * Deterministic reply used when the AI service is unavailable. It only restates
 * the user's own figures and simple arithmetic, labelled as such.
 */
export function fallbackReply(question: string, s: FinancialSummary): string {
  const lines: string[] = [];
  const goalSaved = s.goals.filter((g) => g.status !== "completed").reduce((a, g) => a + g.saved, 0);
  const available = s.recorded_balance - goalSaved;
  const amount = /mampu|beli|afford|cicil/i.test(question) ? extractAmount(question) : null;

  if (s.this_month.transactions === 0 && !s.profile) {
    return "Aku belum punya data untuk dihitung. Catat beberapa pemasukan dan pengeluaran dulu, nanti aku bisa bantu dengan angka yang nyata.";
  }

  if (amount) {
    lines.push(`Hitungan cepat untuk ${formatRupiah(amount)} (angka tercatat, tanpa analisis AI):`);
    lines.push(`• Dana yang bisa dipakai: ${formatRupiah(available)} (saldo tercatat ${formatRupiah(s.recorded_balance)} dikurangi tabungan tujuan ${formatRupiah(goalSaved)}).`);
    const monthlyRoom = s.this_month.income > 0 ? s.this_month.net : s.profile ? s.profile.monthly_income + s.profile.additional_income - s.profile.monthly_expenses_estimate - s.profile.monthly_obligations : 0;
    if (available >= amount * 3) lines.push("• Perkiraan: mampu, dan masih ada sisa dana yang lega.");
    else if (available >= amount) lines.push("• Perkiraan: mampu, tapi hati-hati. Setelah beli, sisa danamu jadi tipis.");
    else lines.push(`• Perkiraan: belum disarankan sekarang. Masih kurang ${formatRupiah(amount - Math.max(0, available))}.`);
    if (monthlyRoom > 0 && available < amount) {
      const months = Math.ceil((amount - Math.max(0, available)) / monthlyRoom);
      lines.push(`• Kalau sisa uang bulananmu (${formatRupiah(monthlyRoom)}) ditabung semua, kekurangannya terkumpul sekitar ${months} bulan lagi (asumsi tanpa bunga).`);
    }
  } else {
    lines.push("Ringkasan dari catatanmu (tanpa analisis AI):");
    lines.push(`• Bulan ini: masuk ${formatRupiah(s.this_month.income)}, keluar ${formatRupiah(s.this_month.expense)}, arus kas bersih ${formatRupiah(s.this_month.net)}.`);
    const top = s.this_month.top_expense_categories[0];
    if (top) lines.push(`• Pengeluaran terbesar: ${top.name}, ${formatRupiah(top.amount)}.`);
    const g = s.goals.find((x) => x.status === "active");
    if (g) {
      lines.push(
        `• Tujuan "${g.title}": ${formatRupiah(g.saved)} dari ${formatRupiah(g.target)} (${String(g.progress_pct).replace(".", ",")}%).${
          g.estimated_completion ? ` Dengan ritme sekarang, perkiraan selesai ${formatMonthYear(g.estimated_completion)}.` : ""
        }`,
      );
    }
    lines.push("Coba tanya lagi nanti untuk saran yang lebih personal.");
  }
  return lines.join("\n");
}
