"use client";

import { ChevronLeft, Clock, MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BrandMark } from "@/components/brand";
import { ErrorNote, Field, Spinner } from "@/components/ui/controls";
import { emailSchema } from "@/lib/credentials";
import { formatCountdown, toAppError } from "@/lib/errors";
import { api } from "@/lib/store/local";

function ForgotForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/password/status")
      .then((r) => r.json())
      .then((j: { reset?: boolean }) => setAvailable(Boolean(j.reset)))
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const ok = emailSchema.safeParse(email).success;
  // Leaving an empty field says nothing (no layout jump under the finger); pressing the button does.
  const [submitted, setSubmitted] = useState(false);
  const emailError = !ok && (submitted || (touched && email)) ? (email ? "Masukkan alamat email yang valid" : "Masukkan emailmu") : undefined;

  const submit = async () => {
    setSubmitted(true);
    if (!ok || busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/password/forgot", "POST", { email: email.trim() });
      setSent(true);
    } catch (e) {
      const err = toAppError(e, "Email gagal dikirim. Coba lagi sebentar lagi.");
      if (err.kind === "limit") setCooldown(err.retryAfter ?? 600);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="scr safe" style={{ gap: 20, padding: "24px 24px 32px" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="ibtn" href="/masuk?mode=masuk" aria-label="Kembali ke halaman masuk">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <BrandMark height={28} />
        <span style={{ width: 44, flex: "none" }} />
      </div>

      {sent ? (
        <div className="col" style={{ gap: 14, marginTop: 8 }} role="status">
          <span className="icb g" style={{ width: 56, height: 56, borderRadius: 18 }}>
            <MailCheck size={28} aria-hidden="true" />
          </span>
          <h1 className="h1" style={{ fontSize: 30 }}>
            Cek emailmu
          </h1>
          <p className="t mut pretty">
            Kalau <span className="b" style={{ color: "var(--ink)" }}>{email.trim()}</span> terdaftar di Financer, tautan untuk membuat kata sandi baru sudah kami kirim. Tautannya
            berlaku 30 menit.
          </p>
          <p className="s mut pretty">Belum masuk? Cek folder Spam atau Promosi, atau kirim ulang dalam beberapa menit.</p>
          <button className="btn ghost" type="button" onClick={() => setSent(false)}>
            Kirim ulang atau ganti email
          </button>
          <Link className="lnk" href="/masuk?mode=masuk" style={{ alignSelf: "center", minHeight: 44 }}>
            Kembali ke halaman masuk
          </Link>
        </div>
      ) : (
        <>
          <div className="col" style={{ gap: 8, marginTop: 8 }}>
            <h1 className="h1" style={{ fontSize: 30 }}>
              Lupa kata sandi?
            </h1>
            <p className="t mut pretty">Masukkan email akunmu. Kami kirim tautan untuk membuat kata sandi baru.</p>
          </div>
          {available === false ? (
            <div className="card">
              <p className="t b">Atur ulang lewat email belum tersedia</p>
              <p className="s mut">Untuk sementara, hubungi kami supaya bisa dibantu.</p>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Field label="Email" htmlFor="email" error={emailError}>
                <input
                  id="email"
                  className="inp"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  aria-invalid={!!emailError}
                />
              </Field>
              <ErrorNote message={error} />
              {cooldown > 0 && (
                <p className="s mut" role="status" style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
                  <Clock size={16} aria-hidden="true" />
                  Terlalu banyak permintaan. Coba lagi dalam {formatCountdown(cooldown)}.
                </p>
              )}
              <button className="btn" type="submit" disabled={busy || cooldown > 0}>
                {busy ? <Spinner label="Mengirim" /> : "Kirim tautan"}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}

export default function LupaSandiPage() {
  return (
    <Suspense fallback={null}>
      <ForgotForm />
    </Suspense>
  );
}
