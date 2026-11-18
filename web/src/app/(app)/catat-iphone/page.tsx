"use client";

import { Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, KeyRound, RotateCcw, Smartphone } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/ui/controls";
import { toAppError } from "@/lib/errors";
import { IOS_SHORTCUT_URL, IPHONE_LABEL } from "@/lib/platform";
import { api } from "@/lib/store/local";

interface Device {
  id: string;
  label: string | null;
  last_seen_at: string | null;
}

type StepId = "code" | "install" | "backtap" | "try";
const STEPS: StepId[] = ["code", "install", "backtap", "try"];
const STORE = "financer:iphone-setup";

interface Progress {
  done: StepId[];
  deviceId: string | null;
  /** When step 4 started: a capture after this means the shortcut works. */
  tryFrom: string | null;
}

function readProgress(): Progress {
  try {
    const p = JSON.parse(window.localStorage.getItem(STORE) ?? "null") as Progress | null;
    if (p && Array.isArray(p.done)) return p;
  } catch {
    /* optional */
  }
  return { done: [], deviceId: null, tryFrom: null };
}

/**
 * Setup guide for "Ketuk 2x belakang iPhone": a code for the shortcut, the
 * shortcut itself (iCloud link), Back Tap in iOS settings, and a live test
 * that turns green once the first screenshot reaches Financer.
 */
export default function CatatIPhonePage() {
  const toast = useToast();
  const [progress, setProgress] = useState<Progress>({ done: [], deviceId: null, tryFrom: null });
  const [open, setOpen] = useState<StepId>("code");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noAsk, setNoAsk] = useState(false);
  const [success, setSuccess] = useState(false);
  const loaded = useRef(false);

  // Restore progress (the code itself is never stored: it is shown once).
  useEffect(() => {
    const p = readProgress();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this browser
    setProgress(p);
    setOpen(STEPS.find((s) => !p.done.includes(s)) ?? "try");
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(STORE, JSON.stringify(progress));
    } catch {
      /* optional */
    }
  }, [progress]);

  const finish = (id: StepId) => {
    setProgress((p) => ({ ...p, done: p.done.includes(id) ? p.done : [...p.done, id], tryFrom: id === "backtap" ? new Date().toISOString() : p.tryFrom }));
    const next = STEPS[STEPS.indexOf(id) + 1];
    if (next) setOpen(next);
  };

  const makeCode = async () => {
    setBusy(true);
    try {
      // A new code replaces this browser's previous one.
      if (progress.deviceId) await api(`/api/devices/${progress.deviceId}`, "DELETE").catch(() => undefined);
      const r = await api<{ id: string; token: string }>("/api/devices", "POST", { label: IPHONE_LABEL });
      setToken(r.token);
      setProgress((p) => ({ ...p, deviceId: r.id, done: p.done.filter((d) => d === "backtap") }));
    } catch (e) {
      const err = toAppError(e, "Gagal membuat kode. Coba lagi.");
      if (err.kind !== "session") toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      toast.success("Kode disalin.");
      finish("code");
    } catch {
      toast.error("Gagal menyalin. Tekan lama kodenya, lalu Salin.");
    }
  };

  // Step 4: watch for the first screenshot from this code.
  const check = useCallback(async () => {
    if (!progress.deviceId) return;
    try {
      const list = await api<Device[]>("/api/devices");
      const me = list.find((d) => d.id === progress.deviceId);
      if (me?.last_seen_at && (!progress.tryFrom || me.last_seen_at > progress.tryFrom)) {
        setSuccess(true);
        setProgress((p) => ({ ...p, done: p.done.includes("try") ? p.done : [...p.done, "try"] }));
      }
    } catch {
      /* keep waiting */
    }
  }, [progress.deviceId, progress.tryFrom]);
  useEffect(() => {
    if (open !== "try" || success) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start watching right away
    void check();
    const t = window.setInterval(check, 3000);
    const onShow = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [open, success, check]);

  const doneCount = progress.done.length;
  const current = Math.min(STEPS.length, STEPS.indexOf(open) + 1);

  return (
    <main className="scr safe" style={{ gap: 16 }}>
      <div className="row">
        <Link className="ibtn" href="/profil" aria-label="Kembali ke Profil">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="h3 sp" style={{ textAlign: "center" }}>
          Catat dari layar iPhone
        </h1>
        <span style={{ width: 44 }} />
      </div>

      <header className="ip-hero">
        <span className="ip-mark" aria-hidden="true">
          <Smartphone size={30} strokeWidth={1.8} />
          <i />
          <i />
        </span>
        <div className="col" style={{ gap: 6 }}>
          <p className="h2">Ketuk 2x belakang iPhone, transaksinya tercatat</p>
          <p className="s mut pretty">
            Di halaman bukti transaksi myBCA, BRImo, GoPay, atau aplikasi lain, ketuk dua kali bagian belakang iPhone. Financer membaca layarnya dan memasukkan transaksinya ke
            Perlu dicek.
          </p>
        </div>
        <p className="s b" aria-live="polite">
          {success ? "Selesai, semua siap" : `Langkah ${current} dari 4 · ${doneCount} selesai`}
        </p>
      </header>

      <ol className="steps">
        <Step n={1} id="code" title="Buat kode untuk iPhone ini" open={open} done={progress.done} onOpen={setOpen}>
          <p className="s pretty">Kode ini menghubungkan shortcut dengan akunmu. Simpan di clipboard dulu, nanti ditempel saat memasang shortcut.</p>
          {token ? (
            <>
              <div className="code-field" aria-label="Kode Financer">
                <KeyRound size={18} aria-hidden="true" />
                <span className="num">{token}</span>
              </div>
              <p className="s mut">Kode hanya ditampilkan sekali. Jangan bagikan ke orang lain.</p>
              <button className="btn" type="button" onClick={copyCode}>
                <Copy size={18} aria-hidden="true" />
                Salin kode
              </button>
            </>
          ) : (
            <button className="btn" type="button" disabled={busy} onClick={makeCode}>
              {busy ? <Spinner label="Membuat kode" /> : progress.deviceId ? "Buat kode baru" : "Buat kode"}
            </button>
          )}
        </Step>

        <Step n={2} id="install" title='Pasang shortcut "Catat ke Financer"' open={open} done={progress.done} onOpen={setOpen}>
          <p className="s pretty">
            Buka link di bawah, tekan <b>Tambahkan Shortcut</b>, lalu tempel kode saat ditanya.
          </p>
          {IOS_SHORTCUT_URL ? (
            <a className="btn" href={IOS_SHORTCUT_URL} target="_blank" rel="noopener noreferrer" onClick={() => window.setTimeout(() => finish("install"), 800)}>
              <Download size={18} aria-hidden="true" />
              Pasang shortcut
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          ) : (
            <p className="inbox-note">Link shortcut sedang disiapkan. Langkah lain sudah bisa dicoba setelah link tersedia.</p>
          )}
          <button type="button" className="lnk" style={{ alignSelf: "flex-start", minHeight: 44 }} aria-expanded={noAsk} onClick={() => setNoAsk((v) => !v)}>
            Shortcut tidak menanyakan kode?
          </button>
          {noAsk && (
            <ol className="mini-steps">
              <li>Buka aplikasi Pintasan (Shortcuts).</li>
              <li>
                Tekan <b>•••</b> di &ldquo;Catat ke Financer&rdquo;.
              </li>
              <li>Tempel kode di kotak teks paling atas, lalu tekan Selesai.</li>
            </ol>
          )}
          {IOS_SHORTCUT_URL && (
            <button type="button" className="btn ghost sm" onClick={() => finish("install")}>
              Sudah terpasang
            </button>
          )}
        </Step>

        <Step n={3} id="backtap" title="Nyalakan Ketuk Belakang" open={open} done={progress.done} onOpen={setOpen}>
          <p className="s pretty">Di aplikasi Pengaturan iPhone, buka menu berikut:</p>
          <ol className="path" aria-label="Langkah di Pengaturan">
            {[
              ["Aksesibilitas", "Accessibility"],
              ["Sentuh", "Touch"],
              ["Ketuk Belakang", "Back Tap"],
              ["Ketuk Dua Kali", "Double Tap"],
              ["Catat ke Financer", "di bagian Pintasan"],
            ].map(([id, en], i) => (
              <li key={id}>
                <span className="path-n num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="col sp" style={{ gap: 0 }}>
                  <span className="t b">{id}</span>
                  <span className="s mut">{en}</span>
                </span>
                {i < 4 && <ChevronRight size={16} aria-hidden="true" style={{ color: "var(--mut)" }} />}
              </li>
            ))}
          </ol>
          <p className="s mut pretty">Butuh iPhone 8 atau lebih baru. Kalau ketukan kurang terasa, lepas casing yang tebal.</p>
          <button className="btn" type="button" onClick={() => finish("backtap")}>
            Sudah, lanjut coba
          </button>
        </Step>

        <Step n={4} id="try" title="Coba sekarang" open={open} done={progress.done} onOpen={setOpen}>
          {success ? (
            <div className="try-ok" role="status">
              <span className="icb g" aria-hidden="true">
                <Check size={22} />
              </span>
              <div className="col sp" style={{ gap: 2 }}>
                <p className="t b">Berhasil! Shortcut sudah tersambung.</p>
                <p className="s mut pretty">Struk contoh tadi ada di Perlu dicek. Abaikan saja di sana.</p>
              </div>
              <Link className="btn" href="/perlu-dicek">
                Buka Perlu dicek
              </Link>
            </div>
          ) : (
            <>
              <p className="s pretty">
                Ketuk dua kali bagian belakang iPhone sekarang, saat struk contoh ini ada di layar. Halaman ini berubah hijau begitu Financer menerimanya.
              </p>
              <figure className="demo-receipt" aria-label="Struk contoh">
                <p className="s b">KOPI SENJA</p>
                <p className="s mut">Jl. Melati No. 8, Jakarta</p>
                <hr />
                <p className="row s">
                  <span className="sp">Es Kopi Susu</span>
                  <span className="num">Rp22.000</span>
                </p>
                <p className="row s">
                  <span className="sp">Roti Bakar</span>
                  <span className="num">Rp6.000</span>
                </p>
                <hr />
                <p className="row t b">
                  <span className="sp">TOTAL</span>
                  <span className="num">Rp28.000</span>
                </p>
                <p className="s mut">Struk contoh · bisa diabaikan</p>
              </figure>
              <p className="tap-hint s b" role="status">
                <span className="tap-dot" aria-hidden="true" />
                Menunggu ketukan…
              </p>
              <button type="button" className="lnk" style={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => void check()}>
                <RotateCcw size={16} aria-hidden="true" />
                Cek lagi
              </button>
            </>
          )}
        </Step>
      </ol>

      <Link className="lnk" href="/profil" style={{ alignSelf: "center", minHeight: 44 }}>
        Nanti saja
      </Link>
    </main>
  );
}

function Step({
  n,
  id,
  title,
  open,
  done,
  onOpen,
  children,
}: {
  n: number;
  id: StepId;
  title: string;
  open: StepId;
  done: StepId[];
  onOpen: (id: StepId) => void;
  children: React.ReactNode;
}) {
  const isOpen = open === id;
  const isDone = done.includes(id);
  return (
    <li className={`step${isOpen ? " open" : ""}${isDone ? " done" : ""}`}>
      <button type="button" className="step-head" aria-expanded={isOpen} aria-controls={`step-${id}`} onClick={() => onOpen(id)}>
        <span className="step-n num" aria-hidden="true">
          {isDone ? <Check size={16} strokeWidth={2.6} /> : n}
        </span>
        <span className="t b sp">{title}</span>
        <span className="sr-only">{isDone ? "selesai" : ""}</span>
      </button>
      {isOpen && (
        <div className="step-body" id={`step-${id}`}>
          {children}
        </div>
      )}
    </li>
  );
}
