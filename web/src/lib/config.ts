// Supabase is required: there is no offline stand-in. Without both values the
// app shows a "Layanan belum dikonfigurasi" screen instead of working on fake data.

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Routes that need a signed-in user. */
export const PROTECTED_PREFIXES = ["/beranda", "/transaksi", "/tujuan", "/coach", "/profil", "/onboarding"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
