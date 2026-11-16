import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { tx } from "@/lib/db";
import { saveOnboarding } from "@/lib/onboarding-store";
import { onboardingInput } from "@/lib/schemas";
import { dbError, requireUser } from "@/lib/server";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const input = await parseBody(req, onboardingInput);
  if (input instanceof NextResponse) return input;
  try {
    tx(() => saveOnboarding(auth.uid, input));
  } catch (e) {
    return dbError(e);
  }
  return NextResponse.json({ ok: true });
}
