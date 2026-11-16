import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { signUpSchema } from "@/lib/credentials";
import { createUser, insertOwned, newId } from "@/lib/db";
import { saveOnboarding } from "@/lib/onboarding-store";
import { hashPassword } from "@/lib/password";
import { goalInput, onboardingInput } from "@/lib/schemas";
import { clientIp, dbError, makeLimiter } from "@/lib/server";
import { authConfigured } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";

// At most 10 new accounts per hour from one address.
const signups = makeLimiter(10, 60 * 60 * 1000);

// New users answer onboarding before they have an account; those answers
// (and the first goal they chose to create) arrive with the sign-up.
const body = signUpSchema.extend({
  onboarding: onboardingInput.optional(),
  firstGoal: goalInput.optional(),
});
type SignUpBody = z.infer<typeof body>;

export async function POST(req: Request) {
  if (!authConfigured()) return NextResponse.json({ error: "Layanan sedang bermasalah. Coba lagi sebentar lagi." }, { status: 503 });
  const input: SignUpBody | NextResponse = await parseBody(req, body);
  if (input instanceof NextResponse) return input;

  const ip = clientIp(req);
  const wait = signups.blocked(ip);
  if (wait) return NextResponse.json({ error: "Terlalu banyak pendaftaran dari jaringan ini." }, { status: 429, headers: { "retry-after": String(wait) } });

  let uid: string | null;
  try {
    uid = createUser(input.email, await hashPassword(input.password), (id) => {
      if (input.onboarding) saveOnboarding(id, input.onboarding);
      if (input.firstGoal) insertOwned("financial_goals", id, { id: newId(), ...input.firstGoal });
    });
  } catch (e) {
    return dbError(e, "Gagal membuat akun. Coba lagi.");
  }
  if (!uid) return NextResponse.json({ error: "Email ini sudah terdaftar. Silakan masuk." }, { status: 409 });
  signups.hit(ip);
  return setSessionCookie(NextResponse.json({ ok: true }, { status: 201 }), uid);
}
