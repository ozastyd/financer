import { describe, expect, it } from "vitest";
import { balanceFromContributions, estimateCompletion, goalProgress, goalRemaining, milestoneCrossed, monthStatus, requiredMonthly, rhythmOptions, targetPassed } from "./goals";
import type { Goal } from "./types";

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g1",
  title: "Rp10 Juta Pertamaku",
  target_amount: 10_000_000,
  current_amount: 4_250_000,
  target_date: "2027-06-30",
  priority: 2,
  category: "target",
  description: null,
  monthly_plan: 700_000,
  status: "active",
  paused_at: null,
  completed_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

describe("goal progress", () => {
  it("computes remaining and percentage", () => {
    expect(goalRemaining(goal())).toBe(5_750_000);
    expect(goalProgress(goal())).toBe(42.5);
    expect(goalRemaining(goal({ current_amount: 12_000_000 }))).toBe(0);
  });
});

describe("required monthly and completion (matches the approved design)", () => {
  const today = "2026-11-14";
  it("needs Rp825.000/month to finish by June 2027", () => {
    expect(requiredMonthly(5_750_000, 7)).toBe(825_000);
  });
  it("estimates completion in full months", () => {
    expect(estimateCompletion(5_750_000, 700_000, today)).toEqual({ months: 9, date: "2027-08-14" });
    expect(estimateCompletion(5_750_000, 825_000, today)).toEqual({ months: 7, date: "2027-06-14" });
    expect(estimateCompletion(5_750_000, 600_000, today)).toEqual({ months: 10, date: "2027-09-14" });
  });
  it("handles finished and zero-rate goals", () => {
    expect(estimateCompletion(0, 100_000, today)).toEqual({ months: 0, date: today });
    expect(estimateCompletion(100_000, 0, today)).toBeNull();
    expect(requiredMonthly(0, 5)).toBe(0);
  });
  it("offers on-time, current and lighter rhythms", () => {
    const opts = rhythmOptions(goal(), today);
    expect(opts.map((o) => [o.kind, o.monthly])).toEqual([
      ["on_time", 825_000],
      ["current", 700_000],
      ["lighter", 550_000],
    ]);
  });
  it("works without a target date or plan", () => {
    expect(rhythmOptions(goal({ target_date: null, monthly_plan: null }), today)).toEqual([]);
    const onlyDate = rhythmOptions(goal({ monthly_plan: null }), today);
    expect(onlyDate.find((o) => o.kind === "on_time")).toMatchObject({ monthly: 825_000 });
  });
});

describe("contribution balance", () => {
  it("adds deposits and subtracts withdrawals", () => {
    expect(
      balanceFromContributions([
        { kind: "deposit", amount: 700_000 },
        { kind: "withdrawal", amount: 200_000 },
        { kind: "deposit", amount: 700_000 },
      ]),
    ).toBe(1_200_000);
  });
});

describe("faster rhythm", () => {
  it("is offered only when it finishes sooner than every other option", () => {
    const opts = rhythmOptions(goal({ target_date: null }), "2026-11-14");
    expect(opts.map((o) => [o.kind, o.monthly, o.months])).toEqual([
      ["faster", 900_000, 7],
      ["current", 700_000, 9],
      ["lighter", 550_000, 11],
    ]);
  });
});

describe("this month's saving", () => {
  it("tracks the rhythm", () => {
    expect(monthStatus(goal({ month_saved: 0 }))).toEqual({ plan: 700_000, saved: 0, left: 700_000, done: false });
    expect(monthStatus(goal({ month_saved: 500_000 }))).toMatchObject({ left: 200_000, done: false });
    expect(monthStatus(goal({ month_saved: 900_000 }))).toMatchObject({ left: 0, done: true });
  });
  it("asks only for what is left near the end", () => {
    expect(monthStatus(goal({ current_amount: 9_800_000, month_saved: 0 }))).toMatchObject({ plan: 200_000, left: 200_000 });
  });
  it("is absent without a rhythm or when not active", () => {
    expect(monthStatus(goal({ monthly_plan: null }))).toBeNull();
    expect(monthStatus(goal({ status: "paused" }))).toBeNull();
  });
});

describe("target date and milestones", () => {
  it("flags a target month that is over", () => {
    expect(targetPassed(goal({ target_date: "2026-10-31" }), "2026-11-14")).toBe(true);
    expect(targetPassed(goal({ target_date: "2026-11-30" }), "2026-11-14")).toBe(false);
    expect(targetPassed(goal({ target_date: "2026-10-31", status: "completed" }), "2026-11-14")).toBe(false);
  });
  it("reports the highest milestone a deposit crosses", () => {
    expect(milestoneCrossed(1000, 200, 300)).toBe(25);
    expect(milestoneCrossed(1000, 200, 800)).toBe(75);
    expect(milestoneCrossed(1000, 300, 400)).toBeNull();
  });
});
