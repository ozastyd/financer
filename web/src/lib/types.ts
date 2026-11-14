export type TxType = "income" | "expense";
export type GoalStatus = "active" | "paused" | "completed";
export type ContributionKind = "deposit" | "withdrawal";

export interface Category {
  id: string;
  name: string;
  type: TxType;
  icon: string;
  sort_order: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  category_id: string;
  amount: number;
  description: string | null;
  transaction_date: string; // YYYY-MM-DD, Asia/Jakarta calendar day
  created_at: string;
}

export interface Goal {
  id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  priority: number;
  category: string;
  description: string | null;
  monthly_plan: number | null;
  status: GoalStatus;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Contribution {
  id: string;
  goal_id: string;
  kind: ContributionKind;
  amount: number;
  note: string | null;
  contribution_date: string;
  created_at: string;
}

export interface UserProfile {
  display_name: string;
  age_range: string | null;
  occupation: string | null;
  financial_experience: string | null;
}

export interface FinancialProfile {
  monthly_income: number;
  income_source: string | null;
  additional_income: number;
  income_frequency: string | null;
  current_savings: number;
  monthly_expenses: number;
  existing_debt: number;
  monthly_obligations: number;
  emergency_fund_status: string | null;
  goal_choices: string[];
  tracks_expenses: string | null;
  saves_regularly: string | null;
  impulse_buying: string | null;
  uses_paylater: string | null;
  biggest_challenge: string | null;
  onboarding_step: number;
  onboarding_completed: boolean;
}

export const EMPTY_FINANCIAL_PROFILE: FinancialProfile = {
  monthly_income: 0,
  income_source: null,
  additional_income: 0,
  income_frequency: null,
  current_savings: 0,
  monthly_expenses: 0,
  existing_debt: 0,
  monthly_obligations: 0,
  emergency_fund_status: null,
  goal_choices: [],
  tracks_expenses: null,
  saves_regularly: null,
  impulse_buying: null,
  uses_paylater: null,
  biggest_challenge: null,
  onboarding_step: 1,
  onboarding_completed: false,
};
