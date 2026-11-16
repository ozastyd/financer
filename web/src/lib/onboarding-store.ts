import "server-only";

import { getFinancialProfile, upsertProfile } from "./db";
import type { OnboardingInput } from "./schemas";

/** Saves onboarding answers for uid. Call inside tx() when combined with other writes. */
export function saveOnboarding(uid: string, input: OnboardingInput) {
  if (input.profile) {
    upsertProfile("user_profiles", uid, {
      display_name: input.profile.display_name,
      age_range: input.profile.age_range ?? null,
      occupation: input.profile.occupation ?? null,
      financial_experience: input.profile.financial_experience ?? null,
    });
  }
  const existing = getFinancialProfile(uid);
  const f = input.financial ?? {};
  const completed = Boolean(existing?.onboarding_completed) || input.completed;
  upsertProfile("financial_profiles", uid, {
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
}
