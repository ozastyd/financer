import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { onboardingInput } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, onboardingInput);
  if (input instanceof NextResponse) return input;
  const { supabase, user } = auth;

  if (input.profile) {
    const { error } = await supabase.from("user_profiles").upsert({
      user_id: user.id,
      display_name: input.profile.display_name,
      age_range: input.profile.age_range ?? null,
      occupation: input.profile.occupation ?? null,
      financial_experience: input.profile.financial_experience ?? null,
    });
    if (error) return dbError(error);
  }

  const { data: existing, error: readErr } = await supabase
    .from("financial_profiles")
    .select("onboarding_step,onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return dbError(readErr);

  const f = input.financial ?? {};
  const completed = Boolean(existing?.onboarding_completed) || input.completed;
  const { error } = await supabase.from("financial_profiles").upsert({
    user_id: user.id,
    ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v ?? null])),
    monthly_income: f.monthly_income ?? 0,
    additional_income: f.additional_income ?? 0,
    current_savings: f.current_savings ?? 0,
    monthly_expenses: f.monthly_expenses ?? 0,
    existing_debt: f.existing_debt ?? 0,
    monthly_obligations: f.monthly_obligations ?? 0,
    goal_choices: f.goal_choices ?? [],
    onboarding_step: completed ? 6 : input.step,
    onboarding_completed: completed,
  });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
