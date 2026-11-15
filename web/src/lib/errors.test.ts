import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, errorFromFetchFailure, errorFromResponse, formatCountdown, referenceCode, secondsFromRateLimit, toAppError } from "./errors";

afterEach(() => vi.unstubAllGlobals());

describe("errorFromResponse", () => {
  it("maps status codes to kinds", () => {
    expect(errorFromResponse(401, "Sesi berakhir").kind).toBe("session");
    expect(errorFromResponse(429, "Terlalu sering", "30")).toMatchObject({ kind: "limit", retryAfter: 30 });
    expect(errorFromResponse(400, "Jumlah harus lebih dari 0")).toMatchObject({ kind: "rejected", message: "Jumlah harus lebih dari 0" });
    expect(errorFromResponse(404, undefined).kind).toBe("rejected");
  });

  it("hides generic 500 text but keeps specific 5xx messages", () => {
    expect(errorFromResponse(500, "Gagal menyimpan. Coba lagi.").message).toMatch(/Server sedang bermasalah/);
    expect(errorFromResponse(502, "Gagal membaca datamu. Coba lagi.").message).toBe("Gagal membaca datamu. Coba lagi.");
  });
});

describe("fetch failures", () => {
  it("is offline when the browser says so", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(errorFromFetchFailure().kind).toBe("offline");
  });
  it("is a network error otherwise", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(errorFromFetchFailure().kind).toBe("network");
  });
});

describe("toAppError", () => {
  it("keeps AppErrors and server messages", () => {
    const e = new AppError("limit", "x", 5);
    expect(toAppError(e)).toBe(e);
    vi.stubGlobal("navigator", { onLine: true });
    expect(toAppError(new Error("Jumlah melebihi saldo tujuan.")).message).toBe("Jumlah melebihi saldo tujuan.");
  });
});

describe("helpers", () => {
  it("reads Supabase rate-limit waits", () => {
    expect(secondsFromRateLimit("For security purposes, you can only request this after 45 seconds.")).toBe(45);
    expect(secondsFromRateLimit("Email rate limit exceeded")).toBeNull();
  });
  it("formats a countdown", () => {
    expect(formatCountdown(45)).toBe("0:45");
    expect(formatCountdown(61.2)).toBe("1:02");
    expect(formatCountdown(-3)).toBe("0:00");
  });
  it("builds a short reference code", () => {
    expect(referenceCode("a1b2c3d4")).toBe("ERR-A1B2");
    expect(referenceCode()).toMatch(/^ERR-[A-Z0-9]{4}$/);
  });
});
