import type { ContributionInput, GoalInput, GoalUpdate, OnboardingInput, TransactionInput, TransactionUpdate } from "../schemas";
import type { Category, FinancialProfile, Goal, UserProfile } from "../types";

export interface Session {
  userId: string;
  email: string;
}

/**
 * Small per-user data kept in memory for the whole session. Transactions and
 * goal contributions are not here: they are read page by page, and totals come
 * from database functions (see src/lib/queries.ts).
 */
export interface AppData {
  userProfile: UserProfile | null;
  financial: FinancialProfile | null;
  categories: Category[];
  goals: Goal[];
}

export const EMPTY_DATA: AppData = {
  userProfile: null,
  financial: null,
  categories: [],
  goals: [],
};

/** Session data and writes. Writes go through the app's API routes for server-side validation. */
export interface DataStore {
  load(): Promise<AppData>;
  saveOnboarding(input: OnboardingInput): Promise<void>;
  addTransaction(input: TransactionInput): Promise<void>;
  updateTransaction(id: string, input: TransactionUpdate): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  addGoal(input: GoalInput): Promise<string>;
  updateGoal(id: string, input: GoalUpdate): Promise<void>;
  deleteGoal(id: string): Promise<void>;
  addContribution(goalId: string, input: ContributionInput): Promise<void>;
}

/** Onboarding answers given before the account existed, saved together with the sign-up. */
export interface SignUpExtras {
  onboarding?: OnboardingInput;
  firstGoal?: GoalInput;
}

export interface AuthClient {
  getSession(): Promise<Session | null>;
  /** Signs in with email and password; throws an AppError when they are wrong. */
  signIn(email: string, password: string): Promise<void>;
  /** Creates an account (with any onboarding answers) and signs in. */
  signUp(email: string, password: string, extras?: SignUpExtras): Promise<void>;
  signOut(): Promise<void>;
  onChange(cb: (s: Session | null) => void): () => void;
}

