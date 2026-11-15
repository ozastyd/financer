import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from "../config";

export async function getServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // called from a context that cannot set cookies; the proxy refreshes the session
        }
      },
    },
  });
}

export type Authed = { supabase: SupabaseClient; user: User };

/** Returns the signed-in user's client, or a ready-made error response. */
export async function requireUser(): Promise<Authed | NextResponse> {
  if (!isConfigured) {
    return NextResponse.json({ error: "Layanan belum dikonfigurasi." }, { status: 503 });
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ error: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
  }
  return { supabase, user: data.user };
}

export function dbError(err: { code?: string; message?: string } | null, fallback = "Gagal menyimpan. Coba lagi."): NextResponse {
  const code = err?.code;
  let message = fallback;
  let status = 500;
  if (code === "23514") {
    message = "Data tidak valid.";
    status = 400;
  } else if (code === "23503") {
    message = "Kategori atau tujuan tidak ditemukan.";
    status = 400;
  } else if (code === "PGRST116") {
    message = "Data tidak ditemukan.";
    status = 404;
  }
  return NextResponse.json({ error: message }, { status });
}
