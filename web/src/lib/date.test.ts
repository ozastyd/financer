import { describe, expect, it } from "vitest";
import {
  BANTER,
  addDays,
  banterLine,
  addMonths,
  endOfMonth,
  formatDayHeading,
  formatLongDate,
  formatMonthYear,
  greeting,
  isValidDate,
  monthsBetween,
  startOfWeek,
  timeOfDay,
  todayJakarta,
} from "./date";

describe("todayJakarta", () => {
  it("uses the Asia/Jakarta calendar day (UTC+7)", () => {
    // 2026-11-14 18:30 UTC is already 15 Nov 01:30 in Jakarta
    expect(todayJakarta(new Date("2026-11-14T18:30:00Z"))).toBe("2026-11-15");
    expect(todayJakarta(new Date("2026-11-14T16:30:00Z"))).toBe("2026-11-14");
  });
  it("greets by Jakarta hour", () => {
    expect(greeting(new Date("2026-11-14T13:00:00Z"))).toBe("Selamat malam"); // 20:00 WIB
    expect(greeting(new Date("2026-11-14T00:30:00Z"))).toBe("Selamat pagi"); // 07:30 WIB
  });
});

describe("banter", () => {
  it("splits the day at Jakarta hours", () => {
    expect(timeOfDay(new Date("2026-11-14T21:00:00Z"))).toBe("pagi"); // 04:00 WIB
    expect(timeOfDay(new Date("2026-11-14T04:00:00Z"))).toBe("siang"); // 11:00 WIB
    expect(timeOfDay(new Date("2026-11-14T08:00:00Z"))).toBe("sore"); // 15:00 WIB
    expect(timeOfDay(new Date("2026-11-14T11:00:00Z"))).toBe("malam"); // 18:00 WIB
    expect(timeOfDay(new Date("2026-11-14T20:59:00Z"))).toBe("malam"); // 03:59 WIB
  });
  it("picks a line for the current part of the day", () => {
    const sore = new Date("2026-11-14T09:00:00Z");
    expect(banterLine(sore, () => 0)).toBe(BANTER.sore[0]);
    expect(banterLine(sore, () => 0.9999)).toBe(BANTER.sore[4]);
    for (const k of Object.keys(BANTER) as (keyof typeof BANTER)[]) expect(BANTER[k]).toHaveLength(5);
  });
});

describe("date arithmetic", () => {
  it("adds days across months", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("adds months and clamps the day", () => {
    expect(addMonths("2026-11-14", 9)).toBe("2027-08-14");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-11-14", -11)).toBe("2025-12-14");
  });
  it("finds month and week boundaries", () => {
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(startOfWeek("2026-11-14")).toBe("2026-11-09"); // Saturday -> Monday
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09"); // Sunday -> Monday
  });
  it("counts whole months between dates", () => {
    expect(monthsBetween("2026-11-14", "2027-06-30")).toBe(7);
  });
  it("validates real calendar dates", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("14/11/2026")).toBe(false);
  });
});

describe("Indonesian labels", () => {
  it("formats months and long dates", () => {
    expect(formatMonthYear("2027-08-14")).toBe("Agustus 2027");
    expect(formatLongDate("2026-11-01")).toBe("1 November 2026");
  });
  it("labels day groups relative to today", () => {
    expect(formatDayHeading("2026-11-14", "2026-11-14")).toBe("Hari ini · Sab, 14 Nov");
    expect(formatDayHeading("2026-11-13", "2026-11-14")).toBe("Kemarin · Jum, 13 Nov");
    expect(formatDayHeading("2026-11-12", "2026-11-14")).toBe("Kam, 12 Nov");
    expect(formatDayHeading("2025-12-31", "2026-11-14")).toBe("Rab, 31 Des 2025");
  });
});
