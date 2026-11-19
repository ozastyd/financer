"use client";

import { Bell, BellRing, ChevronRight, Download, KeyRound, LifeBuoy, LogOut, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { AutoRecord } from "@/components/auto-record";
import { InstallIPhone } from "@/components/install-iphone";
import { SUPPORT_EMAIL } from "@/components/error-states";
import { useToast } from "@/components/toast";
import { ErrorNote, Field, PasswordInput, Segmented, Spinner } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { MIN_PASSWORD } from "@/lib/credentials";
import { toAppError } from "@/lib/errors";
import { formatRupiah } from "@/lib/money";
import { EXPERIENCE, OCCUPATIONS, labelOf } from "@/lib/options";
import { disconnectThisPhone } from "@/lib/native";
import { api } from "@/lib/store/local";
import { type ThemeChoice, useTheme } from "@/lib/theme";
import { UPCOMING } from "@/lib/upcoming";

/** Message for a failed request; null when the session-expired sheet already explains it. */
function failMessage(e: unknown, fallback: string): string | null {
  const err = toAppError(e, fallback);
  if (err.kind === "session") return null;
  return err.kind === "rejected" || err.kind === "offline" || err.kind === "limit" ? err.message : fallback;
}

export default function ProfilPage() {
  const { data, session, signOut } = useApp();
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"name" | "password" | "delete" | null>(null);
  const up = data.userProfile;
  const fp = data.financial;
  const name = up?.display_name ?? session?.email.split("@")[0] ?? "";
  const close = () => setSheet(null);

  return (
    <main className="scr safe" style={{ gap: 14 }}>
      <h1 className="h1">Profil</h1>

      <div className="row" style={{ gap: 14 }}>
        <span className="ava" style={{ width: 56, height: 56, fontSize: 22 }} aria-hidden="true">
          {(name || "?").charAt(0).toUpperCase()}
        </span>
        <div className="col sp" style={{ gap: 0, minWidth: 0 }}>
          <p className="h2">{name}</p>
          <p className="s mut" style={{ overflowWrap: "anywhere" }}>
            {session?.email}
          </p>
          {up && <p className="s mut">{[labelOf(OCCUPATIONS, up.occupation), labelOf(EXPERIENCE, up.financial_experience)].filter(Boolean).join(" · ")}</p>}
        </div>
        <button className="btn ghost sm" type="button" onClick={() => setSheet("name")} aria-label="Ubah nama">
          <Pencil size={16} aria-hidden="true" />
          Ubah
        </button>
      </div>

      <InstallIPhone />

      <section className="card" aria-labelledby="p-look">
        <h2 id="p-look" className="sec">
          Tampilan
        </h2>
        <Segmented<ThemeChoice>
          label="Tema"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "Terang" },
            { value: "dark", label: "Gelap" },
            { value: "system", label: "Ikuti sistem" },
          ]}
        />
      </section>

      {fp && (
        <section className="col" style={{ gap: 8 }} aria-labelledby="p-money">
          <h2 id="p-money" className="sec">
            Profil keuangan
          </h2>
          <dl className="tx-facts">
            <div>
              <dt>Pemasukan per bulan</dt>
              <dd className="num">{formatRupiah(fp.monthly_income + fp.additional_income)}</dd>
            </div>
            <div>
              <dt>Pengeluaran rutin</dt>
              <dd className="num">{formatRupiah(fp.monthly_expenses)}</dd>
            </div>
            <div>
              <dt>Tabungan awal</dt>
              <dd className="num">{formatRupiah(fp.current_savings)}</dd>
            </div>
            <div>
              <dt>Utang</dt>
              <dd className="num">{formatRupiah(fp.existing_debt)}</dd>
            </div>
          </dl>
          <Link className="lnk" href="/onboarding" style={{ minHeight: 44 }}>
            Ubah jawaban onboarding
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </section>
      )}

      <section className="col" style={{ gap: 8 }} aria-labelledby="p-account">
        <h2 id="p-account" className="sec">
          Akun & data
        </h2>
        <div className="menu">
          <button type="button" className="menu-item" onClick={() => setSheet("password")}>
            <span className="icb" aria-hidden="true">
              <KeyRound size={20} />
            </span>
            <span className="t sp">Ganti kata sandi</span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <a className="menu-item" href="/api/account/export" download>
            <span className="icb" aria-hidden="true">
              <Download size={20} />
            </span>
            <span className="col sp" style={{ gap: 0 }}>
              <span className="t">Unduh data saya</span>
              <span className="s mut">File CSV, bisa dibuka di Excel atau Google Sheets</span>
            </span>
          </a>
          <Link className="menu-item" href="/privasi">
            <span className="icb" aria-hidden="true">
              <ShieldCheck size={20} />
            </span>
            <span className="t sp">Kebijakan Privasi</span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
          {SUPPORT_EMAIL && (
            <a className="menu-item" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Bantuan Financer")}`}>
              <span className="icb" aria-hidden="true">
                <LifeBuoy size={20} />
              </span>
              <span className="col sp" style={{ gap: 0 }}>
                <span className="t">Bantuan</span>
                <span className="s mut" style={{ overflowWrap: "anywhere" }}>
                  {SUPPORT_EMAIL}
                </span>
              </span>
            </a>
          )}
        </div>
      </section>

      <AutoRecord />

      <Upcoming />

      <button
        className="btn ghost"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // Signing out stops this phone from sending notifications for the account.
          await disconnectThisPhone();
          await signOut();
          router.replace("/masuk?mode=masuk");
        }}
      >
        <LogOut size={18} aria-hidden="true" />
        Keluar
      </button>

      <p className="s mut" style={{ textAlign: "center" }}>
        Datamu hanya bisa dibuka oleh akunmu.
      </p>
      <button className="lnk danger-text" type="button" style={{ alignSelf: "center", minHeight: 44 }} onClick={() => setSheet("delete")}>
        <Trash2 size={16} aria-hidden="true" />
        Hapus akun
      </button>

      <NameSheet open={sheet === "name"} onClose={close} current={name} />
      <PasswordSheet open={sheet === "password"} onClose={close} />
      <DeleteSheet open={sheet === "delete"} onClose={close} />
    </main>
  );
}

/** Features still being built; "Kabari saya" records who wants which. */
function Upcoming() {
  const toast = useToast();
  const [on, setOn] = useState<string[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    api<{ features: string[] }>("/api/account/interest")
      .then((r) => setOn(r.features))
      .catch(() => setOn([]));
  }, []);

  const toggle = async (key: string) => {
    if (!on) return;
    const next = !on.includes(key);
    setPending(key);
    try {
      const r = await api<{ features: string[] }>("/api/account/interest", "POST", { feature: key, on: next });
      setOn(r.features);
      if (next) toast.success("Siap, kamu dikabari begitu fitur ini siap.");
    } catch (e) {
      const m = failMessage(e, "Gagal menyimpan. Coba lagi.");
      if (m) toast.error(m);
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="card" aria-labelledby="p-soon">
      <h2 id="p-soon" className="t b">
        Lagi kami siapkan
      </h2>
      <p className="s mut pretty" style={{ marginTop: -4 }}>
        Tekan Kabari saya pada yang paling kamu tunggu. Itu yang kami kerjakan duluan.
      </p>
      <ul className="soon-list">
        {UPCOMING.map((u) => {
          const active = on?.includes(u.key) ?? false;
          return (
            <li key={u.key}>
              <span className="col sp" style={{ gap: 2, minWidth: 0 }}>
                <span className="t b">{u.title}</span>
                <span className="s mut">{u.body}</span>
              </span>
              <button
                type="button"
                className={`chip${active ? " on" : ""}`}
                aria-pressed={active}
                aria-label={`Kabari saya: ${u.title}`}
                disabled={on === null || pending === u.key}
                onClick={() => toggle(u.key)}
              >
                {active ? <BellRing size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
                {active ? "Dikabari" : "Kabari saya"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NameSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const { mutate } = useApp();
  const toast = useToast();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start from the current name
    setValue(current);
    setError(null);
  }, [open, current]);

  const save = async () => {
    const v = value.trim();
    if (!v) return setError("Nama wajib diisi");
    setBusy(true);
    try {
      await mutate(() => api("/api/account/name", "PATCH", { display_name: v }));
      toast.success("Nama tersimpan.");
      onClose();
    } catch (e) {
      setError(failMessage(e, "Gagal menyimpan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Ubah nama" dirty={value.trim() !== current} discardText="Nama baru belum disimpan.">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Nama panggilan" htmlFor="p-name" error={error ?? undefined}>
          <input id="p-name" className="inp" autoComplete="given-name" maxLength={60} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
        </Field>
        <div className="sheet-foot">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? <Spinner label="Menyimpan" /> : "Simpan"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new open starts empty
    setCurrent("");
    setNext("");
    setTouched(false);
    setError(null);
  }, [open]);

  let nextError: string | undefined;
  if (next.length > 0 && next.length < MIN_PASSWORD) nextError = `Minimal ${MIN_PASSWORD} karakter (sekarang ${next.length})`;
  else if (touched && !next) nextError = "Buat kata sandi baru dulu";
  const currentError = touched && !current ? "Masukkan kata sandi sekarang" : undefined;

  const save = async () => {
    setTouched(true);
    if (!current || next.length < MIN_PASSWORD) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/password", "POST", { current, next });
      toast.success("Kata sandi diganti.");
      onClose();
    } catch (e) {
      setError(failMessage(e, "Gagal menyimpan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Ganti kata sandi" dirty={Boolean(current || next)} discardText="Kata sandi baru belum disimpan.">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Kata sandi sekarang" htmlFor="p-cur" error={currentError}>
          <PasswordInput id="p-cur" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={!!currentError} />
        </Field>
        <Field label="Kata sandi baru" htmlFor="p-new" error={nextError} hint={`Minimal ${MIN_PASSWORD} karakter.`}>
          <PasswordInput id="p-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={!!nextError} />
        </Field>
        <div className="sheet-foot">
          <ErrorNote message={error} />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? <Spinner label="Menyimpan" /> : "Ganti kata sandi"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function DeleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut } = useApp();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new open starts empty
    setPassword("");
    setConfirm("");
    setError(null);
  }, [open]);
  const ready = password.length > 0 && confirm.trim().toUpperCase() === "HAPUS";

  const remove = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/account", "DELETE", { password, confirm: "HAPUS" });
      await disconnectThisPhone();
      await signOut();
      window.location.replace("/");
    } catch (e) {
      setError(failMessage(e, "Gagal menghapus akun. Coba lagi."));
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Hapus akun">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void remove();
        }}
      >
        <div className="discard" style={{ gap: 6 }}>
          <p className="t b">Semua datamu akan dihapus permanen</p>
          <p className="s">Transaksi, tujuan, riwayat setoran, dan jawaban onboarding. Ini tidak bisa dibatalkan.</p>
          <a className="s b" href="/api/account/export" download style={{ color: "var(--pri)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            Unduh datamu dulu (CSV)
          </a>
        </div>
        <Field label="Kata sandi" htmlFor="d-pass">
          <PasswordInput id="d-pass" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Ketik HAPUS untuk konfirmasi" htmlFor="d-confirm">
          <input id="d-confirm" className="inp" autoCapitalize="characters" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="sheet-foot">
          <ErrorNote message={error} />
          <button className="btn danger" type="submit" disabled={!ready || busy}>
            {busy ? <Spinner label="Menghapus" /> : "Hapus akun selamanya"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
