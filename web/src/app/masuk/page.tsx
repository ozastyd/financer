"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, Clock, Link2Off, MailCheck, MailQuestion, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useApp } from "@/components/app-provider";
import { ErrorNote, Field, Spinner } from "@/components/ui/controls";
import { formatCountdown, toAppError } from "@/lib/errors";

const schema = z.object({ email: z.email("Masukkan alamat email yang valid") });

function SignInForm() {
  const { signIn, status } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const isLogin = params.get("mode") === "masuk";
  const linkError = params.get("error") === "link";
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(linkError);
  const [cooldown, setCooldown] = useState(0);
  const [limitHit, setLimitHit] = useState(false);
  const [spamHint, setSpamHint] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (status === "ready" || status === "error") router.replace("/beranda");
  }, [status, router]);

  // B4: if the email hasn't arrived after 30 s, point to spam folders
  useEffect(() => {
    if (!sentTo) return;
    const t = window.setTimeout(() => setSpamHint(true), 30_000);
    return () => window.clearTimeout(t);
  }, [sentTo]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const send = async (email: string) => {
    setError(null);
    try {
      const r = await signIn(email.trim());
      if (r.sent) {
        setLinkExpired(false);
        setLimitHit(false);
        setSpamHint(false);
        setSentTo(email.trim());
        setCooldown(60);
      }
    } catch (e) {
      const err = toAppError(e, "Gagal mengirim tautan. Coba lagi.");
      if (err.kind === "limit") {
        // B3: not the user's fault; a neutral countdown instead of a red error
        setLimitHit(true);
        setCooldown(err.retryAfter ?? 60);
      } else {
        setError(err.message);
      }
    }
  };

  const waitNote = limitHit && cooldown > 0 && (
    <p className="s mut" role="status" style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Clock size={16} aria-hidden="true" />
      Terlalu sering meminta tautan. Bisa kirim lagi dalam {formatCountdown(cooldown)}.
    </p>
  );

  if (sentTo) {
    return (
      <main className="scr safe" style={{ gap: 20, padding: "24px 24px 32px" }}>
        <span className="icb g" style={{ width: 56, height: 56, borderRadius: 18, marginTop: 40 }}>
          <MailCheck size={28} aria-hidden="true" />
        </span>
        <div className="col" style={{ gap: 8 }}>
          <h1 className="h1" style={{ fontSize: 30 }}>
            Cek emailmu
          </h1>
          <p className="t mut">
            Kami kirim tautan masuk ke <span className="b" style={{ color: "var(--ink)" }}>{sentTo}</span>. Buka tautannya di perangkat ini untuk lanjut.
          </p>
        </div>
        {spamHint && (
          <div className="rowc" role="status" style={{ alignItems: "flex-start", padding: 14 }}>
            <span className="icb">
              <MailQuestion size={20} aria-hidden="true" />
            </span>
            <div className="col sp" style={{ gap: 2 }}>
              <p className="t b">Email belum masuk?</p>
              <p className="s mut">Cek folder Spam atau Promosi. Tautan bisa butuh 1–2 menit untuk sampai.</p>
            </div>
          </div>
        )}
        <ErrorNote message={error} />
        <div className="sp" />
        {waitNote}
        <button className="btn ghost" type="button" disabled={cooldown > 0} onClick={() => send(sentTo)}>
          {cooldown > 0 ? `Kirim ulang dalam ${formatCountdown(cooldown)}` : "Kirim ulang tautan"}
        </button>
        <button className="lnk" type="button" style={{ justifyContent: "center", color: "var(--mut)" }} onClick={() => setSentTo(null)}>
          Pakai email lain
        </button>
      </main>
    );
  }

  return (
    <main className="scr safe" style={{ gap: 20, padding: "24px 24px 32px" }}>
      <Link className="ibtn" href="/" aria-label="Kembali">
        <ChevronLeft size={20} aria-hidden="true" />
      </Link>
      <div className="col" style={{ gap: 8, marginTop: 12 }}>
        <h1 className="h1" style={{ fontSize: 30 }}>
          {isLogin ? "Masuk" : "Buat akun"}
        </h1>
        <p className="t mut">
          Cukup pakai email. Kami kirim tautan masuk, jadi nggak perlu hafal kata sandi.
        </p>
      </div>

      {linkExpired && (
        <div className="card note-amb" role="alert" style={{ gap: 8 }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className="icb" style={{ background: "var(--sf)", color: "var(--amb)" }}>
              <Link2Off size={20} aria-hidden="true" />
            </span>
            <div className="col sp" style={{ gap: 2 }}>
              <p className="t b">Tautan masuk sudah tidak berlaku</p>
              <p className="s">Tautan hanya bisa dipakai sekali dan berlaku sebentar. Minta tautan baru di bawah.</p>
            </div>
          </div>
        </div>
      )}

      <form className="flex flex-col gap-3" onSubmit={handleSubmit((v) => send(v.email))} noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <input
            id="email"
            className="inp"
            type="email"
            autoComplete="email"
            placeholder="nama@email.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </Field>
        <ErrorNote message={error} />
        <button className="btn" type="submit" disabled={isSubmitting || (limitHit && cooldown > 0)}>
          {isSubmitting ? (
            <Spinner label="Mengirim" />
          ) : limitHit && cooldown > 0 ? (
            `Kirim tautan · ${formatCountdown(cooldown)}`
          ) : linkExpired ? (
            "Kirim tautan baru"
          ) : isLogin ? (
            "Kirim tautan masuk"
          ) : (
            "Daftar gratis"
          )}
        </button>
        {waitNote}
      </form>

      <div className="row">
        <hr className="div sp" />
        <span className="s mut">atau</span>
        <hr className="div sp" />
      </div>
      <button className="btn ghost" type="button" disabled aria-describedby="google-soon">
        Lanjut dengan Google
        <span id="google-soon" className="tag neu">
          Segera hadir
        </span>
      </button>

      <div className="sp" />
      <div className="rowc" style={{ alignItems: "flex-start", padding: 14 }}>
        <span className="icb g">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <p className="s sp">Financial OS bukan bank dan tidak menyimpan kata sandi rekeningmu. Datamu tidak dibagikan tanpa izinmu.</p>
      </div>
      <p className="s" style={{ textAlign: "center" }}>
        {isLogin ? "Belum punya akun? " : "Sudah punya akun? "}
        <Link className="b" href={isLogin ? "/masuk" : "/masuk?mode=masuk"} style={{ color: "var(--pri)", display: "inline-block", padding: "12px 4px" }}>
          {isLogin ? "Daftar" : "Masuk"}
        </Link>
      </p>
    </main>
  );
}

export default function MasukPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
