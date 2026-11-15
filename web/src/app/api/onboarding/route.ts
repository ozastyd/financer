import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { getFinancialProfile, tx, upsertSingleton } from "@/lib/db";
import { onboardingInput } from "@/lib/schemas";
import { dbError } from "@/lib/server";

export async function POST(req: Request) {
  const input = await parseBody(req, onboardingInput);
  if (input instanceof NextResponse) return input;

  try {
    tx(() => {
      if (input.profile) {
        upsertSingleton("user_profiles", {
          display_name: input.profile.display_name,
          age_range: input.profile.age_range ?? null,
          occupation: input.profile.occupation ?? null,
          financial_experience: input.profile.financial_experience ?? null,
        });
      }
      const existing = getFinancialProfile();
      const f = input.financial ?? {};
      const completed = Boolean(existing?.onboarding_completed) || input.completed;
      upsertSingleton("financial_profiles", {
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
    });
  } catch (e) {
    return dbError(e);
  }
  return NextResponse.json({ ok: true });
}
