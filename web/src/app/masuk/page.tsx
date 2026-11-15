"use client";

import { Clock, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { BrandMark } from "@/components/brand";
import { ErrorNote, Field, Spinner } from "@/components/ui/controls";
import { formatCountdown, toAppError } from "@/lib/errors";

const MIN_LENGTH = 8;

export default function MasukPage() {
  const { signIn, createPassword, needsSetup, status } = useApp();
  const router = useRouter();
  // "setup": no password exists yet, so the first visitor creates one.
  const [mode, setMode] = useState<"checking" | "setup" | "login">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (status === "ready" || status === "error") router.replace("/beranda");
  }, [status, router]);

  useEffect(() => {
    let alive = true;
    needsSetup()
      .then((setup) => alive && setMode(setup ? "setup" : "login"))
      .catch(() => alive && setMode("login"));
    return () => {
      alive = false;
    };
  }, [needsSetup]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const setup = mode === "setup";
  const locked = cooldown > 0;
  const tooShort = setup && password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = setup && confirm.length > 0 && confirm !== password;
  const canSubmit = setup ? password.length >= MIN_LENGTH && confirm === password : password.length > 0;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (setup) await createPassword(password);
      else await signIn(password);
    } catch (e) {
      const err = toAppError(e, "Gagal masuk. Coba lagi.");
      if (err.kind === "limit") setCooldown(err.retryAfter ?? 900);
      else setError(err.message);
      // Someone else created the password in the meantime: switch to sign-in.
      if (setup && /sudah dibuat/i.test(err.message)) {
        setMode("login");
        setConfirm("");
      }
      setBusy(false);
    }
  };

  if (mode === "checking") {
    return (
      <main className="scr safe" style={{ justifyContent: "center", alignItems: "center" }}>
        <Spinner label="Memuat" />
      </main>
    );
  }

  return (
    <main className="scr safe" style={{ gap: 20, padding: "24px 24px 32px" }}>
      <div style={{ marginTop: 40 }}>
        <BrandMark size={48} />
      </div>
      <div className="col" style={{ gap: 8 }}>
        <h1 className="h1" style={{ fontSize: 30 }}>
          {setup ? "Buat kata sandi" : "Masuk"}
        </h1>
        <p className="t mut">
          {setup
            ? "Ini pertama kali Financer dibuka. Buat kata sandi untuk mengunci aplikasi; kata sandi ini dipakai setiap kali masuk."
            : "Masukkan kata sandi untuk membuka Financer."}
        </p>
      </div>

      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !busy && !locked) void submit();
        }}
      >
        <Field label="Kata sandi" htmlFor="password" error={tooShort ? `Minimal ${MIN_LENGTH} karakter` : undefined} hint={setup ? `Minimal ${MIN_LENGTH} karakter.` : undefined}>
          <input
            id="password"
            className="inp"
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={tooShort || (!setup && !!error)}
          />
        </Field>
        {setup && (
          <Field label="Ulangi kata sandi" htmlFor="confirm" error={mismatch ? "Kata sandi belum sama" : undefined}>
            <input
              id="confirm"
              className="inp"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
            />
          </Field>
        )}
        <ErrorNote message={error} />
        {locked && (
          <p className="s mut" role="status" style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <Clock size={16} aria-hidden="true" />
            Terlalu banyak percobaan. Coba lagi dalam {formatCountdown(cooldown)}.
          </p>
        )}
        <button className="btn" type="submit" disabled={!canSubmit || busy || locked}>
          {busy ? <Spinner label={setup ? "Menyimpan" : "Masuk"} /> : setup ? "Simpan & masuk" : "Masuk"}
        </button>
      </form>

      <div className="sp" />
      <div className="rowc" style={{ alignItems: "flex-start", padding: 14 }}>
        <span className="icb g">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <p className="s sp">
          {setup
            ? "Simpan kata sandi ini baik-baik. Semua penguji memakai kata sandi yang sama."
            : "Kamu tetap masuk di perangkat ini selama 30 hari, kecuali kamu keluar dari menu Profil."}
        </p>
      </div>
    </main>
  );
}
