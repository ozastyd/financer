import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { COACH_SYSTEM_PROMPT, type FinancialSummary, fallbackReply, summaryFromDashboard } from "@/lib/coach";
import { type DashboardRaw, dashboardArgs, parseDashboard } from "@/lib/dashboard";
import { todayJakarta } from "@/lib/date";
import { coachRequest } from "@/lib/schemas";
import type { Category, FinancialProfile, Goal } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";

// Server-only: ANTHROPIC_API_KEY is read here and never sent to the browser.
const MODEL = "claude-opus-5-5";

// Simple in-memory limit per user (resets on server restart).
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 30;
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > LIMIT;
}

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ maxRetries: 1, timeout: 45_000 });
  return client;
}

// Reads only totals computed by the database (as this user, under RLS),
// never the full transaction history.
async function loadSummary(sb: SupabaseClient): Promise<FinancialSummary> {
  const today = todayJakarta();
  const [fp, cats, goals, dash] = await Promise.all([
    sb.from("financial_profiles").select("*").maybeSingle(),
    sb.from("categories").select("id,name,type,icon,sort_order"),
    sb.from("financial_goals").select("*").order("created_at"),
    sb.rpc("dashboard", dashboardArgs("month", today)),
  ]);
  if (dash.error) throw new Error("dashboard query failed");
  const n = (v: unknown) => Number(v ?? 0);
  const financial: FinancialProfile | null = fp.data
    ? {
        ...fp.data,
        monthly_income: n(fp.data.monthly_income),
        additional_income: n(fp.data.additional_income),
        current_savings: n(fp.data.current_savings),
        monthly_expenses: n(fp.data.monthly_expenses),
        existing_debt: n(fp.data.existing_debt),
        monthly_obligations: n(fp.data.monthly_obligations),
      }
    : null;
  const goalList: Goal[] = (goals.data ?? []).map((g) => ({
    ...g,
    target_amount: n(g.target_amount),
    current_amount: n(g.current_amount),
    monthly_plan: g.monthly_plan == null ? null : n(g.monthly_plan),
  }));
  const categories: Category[] = cats.data ?? [];
  return summaryFromDashboard({ financial, categories, goals: goalList }, parseDashboard(dash.data as DashboardRaw), today);
}

type Source = "ai" | "fallback";
const reply = (text: string, source: Source, notice?: string) => NextResponse.json({ reply: text, source, notice });

export async function POST(req: Request) {
  const body = await parseBody(req, coachRequest);
  if (body instanceof NextResponse) return body;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const userKey = auth.user.id;
  let summary: FinancialSummary;
  try {
    summary = await loadSummary(auth.supabase);
  } catch {
    return NextResponse.json({ error: "Gagal membaca datamu. Coba lagi." }, { status: 502 });
  }

  if (rateLimited(userKey)) {
    return NextResponse.json({ error: "Kamu sudah banyak bertanya dalam sejam terakhir. Coba lagi sebentar lagi." }, { status: 429 });
  }

  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user" || body.messages[0].role !== "user") return NextResponse.json({ error: "Format percakapan tidak valid." }, { status: 400 });
  const question = last.content;
  const anthropic = getClient();
  if (!anthropic) {
    return reply(fallbackReply(question, summary), "fallback", "AI belum dikonfigurasi, jadi ini jawaban otomatis dari angkamu.");
  }

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: COACH_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Ringkasan data keuangan pengguna (JSON):\n${JSON.stringify(summary)}` },
        { role: "assistant", content: "Oke, aku sudah baca ringkasannya." },
        ...body.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    if (response.stop_reason === "refusal") {
      return reply(fallbackReply(question, summary), "fallback", "AI tidak bisa menjawab pertanyaan ini, jadi ini jawaban otomatis dari angkamu.");
    }
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    if (!text) return reply(fallbackReply(question, summary), "fallback", "AI tidak memberi jawaban, jadi ini jawaban otomatis dari angkamu.");
    return reply(text, "ai");
  } catch (err) {
    let notice = "Layanan AI sedang tidak tersedia, jadi ini jawaban otomatis dari angkamu.";
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      notice = "Kunci layanan AI ditolak, jadi ini jawaban otomatis dari angkamu.";
    } else if (err instanceof Anthropic.RateLimitError) {
      notice = "Layanan AI sedang sibuk, jadi ini jawaban otomatis dari angkamu.";
    } else if (err instanceof Anthropic.APIError) {
      console.error("coach: AI request failed", err.status);
    } else {
      console.error("coach: AI request failed");
    }
    return reply(fallbackReply(question, summary), "fallback", notice);
  }
}
