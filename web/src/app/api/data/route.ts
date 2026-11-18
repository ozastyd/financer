import { NextResponse } from "next/server";
import { startOfMonth, todayJakarta } from "@/lib/date";
import { countPending, getFinancialProfile, getUserProfile, listCategories, listGoals } from "@/lib/db";
import { requireUser } from "@/lib/server";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({
    userProfile: getUserProfile(auth.uid),
    financial: getFinancialProfile(auth.uid),
    categories: listCategories(auth.uid),
    goals: listGoals(auth.uid, startOfMonth(todayJakarta())),
    pendingCount: countPending(auth.uid),
  });
}
