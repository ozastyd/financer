// When to ask someone how much Financer helps them. Only after real use, so
// the answer is about the app and not a first impression: a week in, with
// transactions on a few different days. A close without answering asks again
// a month later, three asks at most; an answer ends it.

export const RATING_RULES = {
  minAccountDays: 7,
  minActiveDays: 3,
  minTransactions: 10,
  askAgainAfterDays: 30,
  maxAsks: 3,
};

export const RATING_REASONS = {
  low: ["Ribet mencatat", "Catat otomatis kurang jalan", "AI Coach kurang membantu", "Ada yang error"],
  high: ["Lebih sadar ke mana uangku", "Catat otomatis", "AI Coach", "Target tabungan"],
};

export interface RatingStats {
  /** ISO timestamp the account was made. */
  accountCreatedAt: string;
  activeDays: number;
  transactions: number;
  rated: boolean;
  asks: number;
  /** ISO timestamp of the last time the card was shown, if ever. */
  lastAskedAt: string | null;
}

const DAY = 86_400_000;

export function shouldAskForRating(s: RatingStats, now: Date = new Date()): boolean {
  const r = RATING_RULES;
  if (s.rated || s.asks >= r.maxAsks) return false;
  if (now.getTime() - Date.parse(s.accountCreatedAt) < r.minAccountDays * DAY) return false;
  if (s.activeDays < r.minActiveDays || s.transactions < r.minTransactions) return false;
  if (s.lastAskedAt && now.getTime() - Date.parse(s.lastAskedAt) < r.askAgainAfterDays * DAY) return false;
  return true;
}
