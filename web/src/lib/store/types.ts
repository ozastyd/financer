import type { ContributionInput, GoalInput, GoalUpdate, OnboardingInput, TransactionInput, TransactionUpdate } from "../schemas";
import type { Category, Contribution, FinancialProfile, Goal, Transaction, UserProfile } from "../types";

export interface Session {
  userId: string;
  email: string;
}

export interface AppData {
  userProfile: UserProfile | null;
  financial: FinancialProfile | null;
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
  contributions: Contribution[];
}

export const EMPTY_DATA: AppData = {
  userProfile: null,
  financial: null,
  categories: [],
  transactions: [],
  goals: [],
  contributions: [],
};

/** Everything the screens need; implemented by Supabase and by the local stand-in. */
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

export interface AuthClient {
  getSession(): Promise<Session | null>;
  /** Sends a magic link (Supabase) or starts a simulated session (local). */
  signIn(email: string): Promise<{ sent: boolean }>;
  signOut(): Promise<void>;
  onChange(cb: (s: Session | null) => void): () => void;
}

export class StoreError extends Error {}
