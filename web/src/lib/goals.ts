import { addMonths, monthsBetween } from "./date";
import { percent, roundDownTo, roundUpTo } from "./money";
import type { Contribution, Goal } from "./types";

/** Monthly amounts are rounded up to this step so the plan still lands on time. */
export const MONTHLY_STEP = 5_000;

export function goalRemaining(goal: Pick<Goal, "target_amount" | "current_amount">): number {
  return Math.max(0, goal.target_amount - goal.current_amount);
}

export function goalProgress(goal: Pick<Goal, "target_amount" | "current_amount">): number {
  return percent(goal.current_amount, goal.target_amount);
}

/** Whole months left until the target month, never less than 1. */
export function monthsUntil(targetDate: string, today: string): number {
  return Math.max(1, monthsBetween(today, targetDate));
}

/** Monthly saving needed to reach `remaining` within `months` (rounded up to Rp5.000). */
export function requiredMonthly(remaining: number, months: number): number {
  if (remaining <= 0) return 0;
  return roundUpTo(Math.ceil(remaining / Math.max(1, months)), MONTHLY_STEP);
}

export interface Completion {
  months: number;
  /** YYYY-MM-DD in the month the goal is expected to be reached. */
  date: string;
}

/** Estimated completion when saving `monthly` each month (full months, no interest). */
export function estimateCompletion(remaining: number, monthly: number, today: string): Completion | null {
  if (remaining <= 0) return { months: 0, date: today };
  if (monthly <= 0) return null;
  const months = Math.ceil(remaining / monthly);
  return { months, date: addMonths(today, months) };
}

export interface RhythmOption {
  monthly: number;
  months: number;
  date: string;
  kind: "on_time" | "current" | "lighter" | "faster";
}

/**
 * Savings-rhythm choices for a goal: the amount that lands on the target date,
 * the user's current plan, a faster and a lighter alternative. Duplicates and
 * a faster option that finishes no sooner are removed.
 */
export function rhythmOptions(goal: Goal, today: string): RhythmOption[] {
  const remaining = goalRemaining(goal);
  if (remaining <= 0) return [];
  const options: RhythmOption[] = [];
  const push = (monthly: number, kind: RhythmOption["kind"]) => {
    if (monthly <= 0 || options.some((o) => o.monthly === monthly)) return;
    const c = estimateCompletion(remaining, monthly, today);
    if (c) options.push({ monthly, months: c.months, date: c.date, kind });
  };
  const onTime = goal.target_date ? requiredMonthly(remaining, monthsUntil(goal.target_date, today)) : 0;
  push(onTime, "on_time");
  if (goal.monthly_plan) push(goal.monthly_plan, "current");
  const base = goal.monthly_plan ?? onTime;
  if (base > 0) {
    const raw = base * 0.85;
    let lighter = roundDownTo(raw, 50_000);
    if (lighter <= 0) lighter = roundDownTo(raw, MONTHLY_STEP);
    if (lighter > 0 && lighter < base) push(lighter, "lighter");
    const faster = roundUpTo(base * 1.25, 50_000);
    const soonest = Math.min(...options.map((o) => o.months));
    const fasterMonths = estimateCompletion(remaining, faster, today)?.months ?? Infinity;
    if (faster > base && fasterMonths < soonest) push(faster, "faster");
  }
  return options.sort((a, b) => b.monthly - a.monthly);
}

/** Balance after applying contributions in order; used to validate withdrawals. */
export function balanceFromContributions(contributions: Pick<Contribution, "kind" | "amount">[]): number {
  return contributions.reduce((sum, c) => sum + (c.kind === "deposit" ? c.amount : -c.amount), 0);
}

export function statusAfterBalance(goal: Goal, balance: number): Pick<Goal, "status" | "completed_at"> {
  if (balance >= goal.target_amount && goal.status !== "completed") {
    return { status: "completed", completed_at: new Date().toISOString() };
  }
  if (balance < goal.target_amount && goal.status === "completed") {
    return { status: "active", completed_at: null };
  }
  return { status: goal.status, completed_at: balance < goal.target_amount ? null : goal.completed_at };
}

/** Active first (by priority), then paused, then completed. */
export function sortGoals(goals: Goal[]): Goal[] {
  const rank = { active: 0, paused: 1, completed: 2 } as const;
  return [...goals].sort((a, b) => rank[a.status] - rank[b.status] || a.priority - b.priority || (a.created_at < b.created_at ? -1 : 1));
}

export interface MonthStatus {
  plan: number;
  saved: number;
  /** Still to save this month to keep the rhythm (0 when done). */
  left: number;
  done: boolean;
}

/** This month's saving against the goal's monthly rhythm; null without a rhythm or when not active. */
export function monthStatus(goal: Pick<Goal, "status" | "monthly_plan" | "month_saved" | "target_amount" | "current_amount">): MonthStatus | null {
  if (goal.status !== "active" || !goal.monthly_plan) return null;
  const saved = Math.max(0, goal.month_saved ?? 0);
  // Near the end the last deposit can be smaller than the rhythm.
  const plan = Math.min(goal.monthly_plan, saved + goalRemaining(goal));
  const left = Math.max(0, plan - saved);
  return { plan, saved, left, done: left === 0 };
}

/** True when the goal's target month is already over and it is not reached. */
export function targetPassed(goal: Pick<Goal, "target_date" | "status">, today: string): boolean {
  return Boolean(goal.target_date) && goal.status !== "completed" && (goal.target_date as string).slice(0, 7) < today.slice(0, 7);
}

const MILESTONES = [25, 50, 75];

/** The milestone (25/50/75%) a deposit crosses, if any. */
export function milestoneCrossed(target: number, before: number, after: number): number | null {
  if (target <= 0) return null;
  const crossed = MILESTONES.filter((m) => (before / target) * 100 < m && (after / target) * 100 >= m);
  return crossed.length ? crossed[crossed.length - 1] : null;
}
