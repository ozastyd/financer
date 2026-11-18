"use client";

import { ChevronLeft, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BrandMark } from "@/components/brand";
import { ErrorNote, Field, PasswordInput, Spinner } from "@/components/ui/controls";
import { MIN_PASSWORD } from "@/lib/credentials";
import { toAppError } from "@/lib/errors";
import { api } from "@/lib/store/local";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  let passwordError: string | undefined;
  if (password.length > 0 && password.length < MIN_PASSWORD) passwordError = `Minimal ${MIN_PASSWORD} karakter (sekarang ${password.length})`;
  else if (touched && !password) passwordError = "Buat kata sandi baru dulu";
  const mismatch = (confirm.length > 0 || touched) && confirm !== password;

  const submit = async () => {
    setTouched(true);
    if (password.length < MIN_PASSWORD || confirm !== password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/password/reset", "POST", { token, password });
      // Signed in with the new password: a full load starts the app fresh.
      window.location.replace("/beranda");
    } catch (e) {
      const err = toAppError(e, "Gagal menyimpan. Coba lagi.");
      if (/kedaluwarsa|dipakai/i.test(err.message)) setExpired(true);
      else setError(err.message);
      setBusy(false);
    }
  };

  const invalid = !token || expired;

  return (
    <main className="scr safe" style={{ gap: 20, paddingInline: 24, paddingBottom: 32 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="ibtn" href="/masuk?mode=masuk" aria-label="Kembali ke halaman masuk">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <BrandMark height={28} />
        <span style={{ width: 44, flex: "none" }} />
      </div>

      {invalid ? (
        <div className="col" style={{ gap: 14, marginTop: 8 }} role="status">
          <span className="icb am" style={{ width: 56, height: 56, borderRadius: 18 }}>
            <LinkIcon size={28} aria-hidden="true" />
          </span>
          <h1 className="h1" style={{ fontSize: 30 }}>
            Tautan tidak berlaku
          </h1>
          <p className="t mut pretty">Tautan ini sudah kedaluwarsa atau sudah pernah dipakai. Minta tautan baru, lalu buka yang paling akhir dikirim.</p>
          <Link className="btn" href="/lupa-sandi">
            Minta tautan baru
          </Link>
        </div>
      ) : (
        <>
          <div className="col" style={{ gap: 8, marginTop: 8 }}>
            <h1 className="h1" style={{ fontSize: 30 }}>
              Buat kata sandi baru
            </h1>
            <p className="t mut">Setelah disimpan, kamu langsung masuk.</p>
          </div>
          <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="Kata sandi baru" htmlFor="password" error={passwordError} hint={`Minimal ${MIN_PASSWORD} karakter.`}>
              <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!passwordError} />
            </Field>
            <Field label="Ulangi kata sandi baru" htmlFor="confirm" error={mismatch ? (confirm ? "Kata sandi belum sama" : "Ketik ulang kata sandinya") : undefined}>
              <PasswordInput id="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
            </Field>
            <ErrorNote message={error} />
            <button className="btn" type="submit" disabled={busy}>
              {busy ? <Spinner label="Menyimpan" /> : "Simpan & masuk"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}

export default function AturSandiPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
