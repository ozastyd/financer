"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useApp } from "@/components/app-provider";
import { ErrorNote, Field, Spinner } from "@/components/ui/controls";

const schema = z.object({ email: z.email("Masukkan alamat email yang valid") });

function SignInForm() {
  const { signIn, status } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const isLogin = params.get("mode") === "masuk";
  const linkError = params.get("error") === "link";
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(linkError ? "Tautan masuk sudah kedaluwarsa atau tidak valid. Minta tautan baru." : null);
  const [cooldown, setCooldown] = useState(0);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (status === "ready" || status === "error") router.replace("/beranda");
  }, [status, router]);

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
        setSentTo(email.trim());
        setCooldown(60);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim tautan.");
    }
  };

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
        <ErrorNote message={error} />
        <div className="sp" />
        <button className="btn ghost" type="button" disabled={cooldown > 0} onClick={() => send(sentTo)}>
          {cooldown > 0 ? `Kirim ulang dalam ${cooldown} detik` : "Kirim ulang tautan"}
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
        <button className="btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner label="Mengirim" /> : isLogin ? "Kirim tautan masuk" : "Daftar gratis"}
        </button>
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
