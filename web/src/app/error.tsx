"use client";

import { CrashState } from "@/components/error-states";

// Crash outside the signed-in app (intro, sign-in, onboarding).
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return <CrashState error={error} onRetry={retry} showHomeLink={false} />;
}
