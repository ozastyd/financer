// Decides at build/start time whether real services are configured.
// Without Supabase keys the app falls back to a local stand-in (browser storage
// for data, a simulated session for auth) and shows a visible notice.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Set NEXT_PUBLIC_FORCE_LOCAL_MODE=1 to use the local stand-in even when keys exist. */
const FORCE_LOCAL = process.env.NEXT_PUBLIC_FORCE_LOCAL_MODE === "1";

export type DataMode = "supabase" | "local";

export const DATA_MODE: DataMode = SUPABASE_URL && SUPABASE_ANON_KEY && !FORCE_LOCAL ? "supabase" : "local";

export const isSupabase = DATA_MODE === "supabase";

/** Routes that need a signed-in user. */
export const PROTECTED_PREFIXES = ["/beranda", "/transaksi", "/tujuan", "/coach", "/profil", "/onboarding"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
