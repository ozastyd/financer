import { NextResponse } from "next/server";
import { mailConfigured } from "@/lib/mail";

/** Whether "Lupa kata sandi" can send an email on this server. */
export async function GET() {
  return NextResponse.json({ reset: mailConfigured() });
}
