"use client";

// A new visitor answers onboarding before they have an account. Their
// progress and final answers are kept in this browser until sign-up sends
// them to the server (POST /api/signup), then cleared.

import type { SignUpExtras } from "./store/types";

const PROGRESS_KEY = "financer:onboarding-progress";
const PENDING_KEY = "financer:pending-signup";

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked (private mode): the flow still works within this visit
  }
}

export interface OnboardingProgress<D> {
  step: number;
  draft: D;
}

export const loadProgress = <D>() => read<OnboardingProgress<D>>(PROGRESS_KEY);
export const saveProgress = <D>(p: OnboardingProgress<D>) => write(PROGRESS_KEY, p);

/** Finished onboarding answers waiting for the account to be created. */
export const loadPendingSignUp = () => read<SignUpExtras>(PENDING_KEY);
export const savePendingSignUp = (extras: SignUpExtras) => write(PENDING_KEY, extras);

export function clearOnboardingDraft() {
  try {
    window.localStorage.removeItem(PROGRESS_KEY);
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // nothing stored
  }
}
