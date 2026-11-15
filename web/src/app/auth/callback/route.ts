import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/lib/config";
import { getServerSupabase } from "@/lib/supabase/server";

// Magic-link landing: exchanges the one-time code for a session cookie.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (!isConfigured || !code) {
    return NextResponse.redirect(`${origin}/masuk?error=link`);
  }
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/masuk?error=link`);
  }
  return NextResponse.redirect(`${origin}/beranda`);
}
