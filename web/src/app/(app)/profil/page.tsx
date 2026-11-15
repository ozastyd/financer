"use client";

import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Segmented } from "@/components/ui/controls";
import { formatRupiah } from "@/lib/money";
import { EXPERIENCE, OCCUPATIONS, labelOf } from "@/lib/options";
import { type ThemeChoice, useTheme } from "@/lib/theme";

const SOON = ["Skor kesehatan finansial", "Laporan bulanan", "Pengaturan & notifikasi", "Paket Pro", "Ekspor & hapus data"];

export default function ProfilPage() {
  const { data, session, signOut } = useApp();
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const [busy, setBusy] = useState(false);
  const up = data.userProfile;
  const fp = data.financial;
  const name = up?.display_name ?? session?.email.split("@")[0] ?? "";

  return (
    <main className="scr safe" style={{ gap: 14 }}>
      <div className="row">
        <Link className="ibtn" href="/beranda" aria-label="Kembali ke Beranda">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="h3 sp" style={{ textAlign: "center" }}>
          Profil
        </h1>
        <span style={{ width: 44 }} />
      </div>

      <div className="row" style={{ gap: 14 }}>
        <span className="ava" style={{ width: 56, height: 56, fontSize: 22 }} aria-hidden="true">
          {(name || "?").charAt(0).toUpperCase()}
        </span>
        <div className="col sp" style={{ gap: 0 }}>
          <p className="h2">{name}</p>
          <p className="s mut" style={{ overflowWrap: "anywhere" }}>
            {session?.email}
          </p>
          {up && (
            <p className="s mut">{[labelOf(OCCUPATIONS, up.occupation), labelOf(EXPERIENCE, up.financial_experience)].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      </div>

      <section className="card" aria-label="Tampilan">
        <p className="sec">Tampilan</p>
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
        <section className="card" aria-label="Profil keuangan">
          <p className="sec">Profil keuangan (dari onboarding)</p>
          <div className="row">
            <span className="s mut sp">Pemasukan per bulan</span>
            <span className="s b num">{formatRupiah(fp.monthly_income + fp.additional_income)}</span>
          </div>
          <div className="row">
            <span className="s mut sp">Pengeluaran rutin</span>
            <span className="s b num">{formatRupiah(fp.monthly_expenses)}</span>
          </div>
          <div className="row">
            <span className="s mut sp">Tabungan awal</span>
            <span className="s b num">{formatRupiah(fp.current_savings)}</span>
          </div>
          <div className="row">
            <span className="s mut sp">Utang</span>
            <span className="s b num">{formatRupiah(fp.existing_debt)}</span>
          </div>
          <Link className="lnk" href="/onboarding">
            Ubah jawaban onboarding
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </section>
      )}

      <section className="col" style={{ gap: 8 }} aria-label="Segera hadir">
        <p className="sec">Segera hadir</p>
        {SOON.map((s) => (
          <div key={s} className="rowc" aria-disabled="true" style={{ minHeight: 52 }}>
            <span className="t sp mut">{s}</span>
            <span className="tag neu">Segera hadir</span>
          </div>
        ))}
      </section>

      <p className="s mut">Datamu tersimpan aman dan hanya bisa dibaca oleh akunmu.</p>

      <button
        className="btn danger"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOut();
          router.replace("/");
        }}
      >
        <LogOut size={18} aria-hidden="true" />
        Keluar
      </button>
    </main>
  );
}
