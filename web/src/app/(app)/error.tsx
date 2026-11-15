"use client";

import { CrashState } from "@/components/error-states";

// Crash inside a signed-in screen; the app shell and bottom nav stay usable.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <CrashState error={error} onRetry={retry} />;
}
