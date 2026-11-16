"use client";

import { ChevronLeft, Clock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { BrandMark } from "@/components/brand";
import { ErrorNote, Field, Spinner } from "@/components/ui/controls";
import { MIN_PASSWORD, emailSchema } from "@/lib/credentials";
import { formatCountdown, toAppError } from "@/lib/errors";
import { clearOnboardingDraft, loadPendingSignUp } from "@/lib/pending-signup";
import type { SignUpExtras } from "@/lib/store/types";

function AccountForm() {
  const { signIn, signUp, status } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const isLogin = params.get("mode") === "masuk";

  const [pending, setPending] = useState<SignUpExtras | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (status === "ready" || status === "error") router.replace("/beranda");
  }, [status, router]);

  // Onboarding answers from before the account existed (see /onboarding).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this browser
    setPending(loadPendingSignUp());
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- switching sign-up/sign-in starts clean
    setError(null);
    setEmailTaken(false);
    setConfirm("");
  }, [isLogin]);

  const emailOk = emailSchema.safeParse(email).success;
  const emailError = touched && email && !emailOk ? "Masukkan alamat email yang valid" : undefined;
  const tooShort = !isLogin && password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = !isLogin && confirm.length > 0 && confirm !== password;
  const canSubmit = emailOk && (isLogin ? password.length > 0 : password.length >= MIN_PASSWORD && confirm === password);
  const locked = cooldown > 0;
  const name = pending?.onboarding?.profile?.display_name;

  const submit = async () => {
    setError(null);
    setEmailTaken(false);
    setBusy(true);
    try {
      if (isLogin) await signIn(email, password);
      else await signUp(email, password, pending ?? undefined);
      clearOnboardingDraft();
      router.replace("/beranda");
    } catch (e) {
      const err = toAppError(e, isLogin ? "Gagal masuk. Coba lagi." : "Gagal membuat akun. Coba lagi.");
      if (err.kind === "limit") setCooldown(err.retryAfter ?? 900);
      else setError(err.message);
      if (!isLogin && /sudah terdaftar/i.test(err.message)) setEmailTaken(true);
      setBusy(false);
    }
  };

  const title = isLogin ? "Selamat datang lagi" : name ? `Satu langkah lagi, ${name}` : "Buat akun";
  const subtitle = isLogin
    ? "Masuk untuk lanjut mengatur uangmu."
    : pending
      ? "Buat akun supaya jawabanmu dan tujuan pertamamu tersimpan."
      : "Daftar gratis dengan email. Datamu hanya bisa dibuka olehmu.";
  const backHref = !isLogin && pending ? "/onboarding" : "/";

  return (
    <main className="scr safe" style={{ gap: 20, padding: "24px 24px 32px" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="ibtn" href={backHref} aria-label="Kembali">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <BrandMark height={28} />
        <span style={{ width: 44, flex: "none" }} />
      </div>

      <div className="col" style={{ gap: 8, marginTop: 8 }}>
        <h1 className="h1" style={{ fontSize: 30 }}>
          {title}
        </h1>
        <p className="t mut">{subtitle}</p>
      </div>

      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (canSubmit && !busy && !locked) void submit();
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
        <Field label="Kata sandi" htmlFor="password" error={tooShort ? `Minimal ${MIN_PASSWORD} karakter` : undefined} hint={isLogin ? undefined : `Minimal ${MIN_PASSWORD} karakter.`}>
          <input
            id="password"
            className="inp"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={tooShort}
          />
        </Field>
        {!isLogin && (
          <Field label="Ulangi kata sandi" htmlFor="confirm" error={mismatch ? "Kata sandi belum sama" : undefined}>
            <input id="confirm" className="inp" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
          </Field>
        )}
        <ErrorNote message={error} />
        {emailTaken && (
          <Link className="s b" href="/masuk?mode=masuk" style={{ color: "var(--pri)", textAlign: "center", padding: "4px 0" }}>
            Masuk dengan email ini
          </Link>
        )}
        {locked && (
          <p className="s mut" role="status" style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <Clock size={16} aria-hidden="true" />
            Terlalu banyak percobaan. Coba lagi dalam {formatCountdown(cooldown)}.
          </p>
        )}
        <button className="btn" type="submit" disabled={!canSubmit || busy || locked}>
          {busy ? <Spinner label={isLogin ? "Masuk" : "Membuat akun"} /> : isLogin ? "Masuk" : "Buat akun"}
        </button>
      </form>

      <p className="s" style={{ textAlign: "center" }}>
        {isLogin ? "Belum punya akun? " : "Sudah punya akun? "}
        <Link className="b" href={isLogin ? (pending ? "/masuk" : "/onboarding") : "/masuk?mode=masuk"} style={{ color: "var(--pri)", display: "inline-block", padding: "12px 4px" }}>
          {isLogin ? "Daftar" : "Masuk"}
        </Link>
      </p>

      <div className="sp" />
      <div className="rowc" style={{ alignItems: "flex-start", padding: 14 }}>
        <span className="icb g">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <p className="s sp">Financer bukan bank dan tidak menyimpan kata sandi rekeningmu. Datamu tidak dibagikan tanpa izinmu.</p>
      </div>
    </main>
  );
}

export default function MasukPage() {
  return (
    <Suspense fallback={null}>
      <AccountForm />
    </Suspense>
  );
}
