import { ServerCrash } from "lucide-react";

/** Shown instead of the app when the Supabase keys are missing. */
export function NotConfigured() {
  return (
    <main className="scr safe" style={{ gap: 18, padding: "24px 24px 32px" }}>
      <span className="icb am" style={{ width: 64, height: 64, borderRadius: 20, marginTop: 16 }}>
        <ServerCrash size={28} aria-hidden="true" />
      </span>
      <div className="col" style={{ gap: 8 }}>
        <h1 className="h1">Layanan belum dikonfigurasi</h1>
        <p className="t mut">Financial OS belum tersambung ke database, jadi belum bisa dipakai. Ini masalah pengaturan, bukan kesalahanmu.</p>
      </div>
      <div className="card" style={{ gap: 8 }}>
        <p className="sec">Untuk pengelola aplikasi</p>
        <p className="s">
          Isi <code>NEXT_PUBLIC_SUPABASE_URL</code> dan <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> di <code>.env.local</code> (lokal) atau di Environment
          Variables Vercel, lalu jalankan ulang atau deploy ulang.
        </p>
      </div>
    </main>
  );
}
