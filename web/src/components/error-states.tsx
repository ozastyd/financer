"use client";

import { MapPinOff, RotateCw, TriangleAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { referenceCode } from "@/lib/errors";

// Full-screen states from the error catalogue (A2, A3, A4, A6).

function FullState({ icon, tone, title, children }: { icon: ReactNode; tone: "neu" | "amb" | "red"; title: string; children: ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const iconClass = tone === "red" ? "icb rd" : tone === "amb" ? "icb am" : "icb";
  return (
    <main className="state safe">
      <span className={iconClass}>{icon}</span>
      <div className="col" style={{ gap: 8 }}>
        <h1 className="h1" ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>
          {title}
        </h1>
      </div>
      {children}
    </main>
  );
}

/** A4: a screen crashed while rendering. */
export function CrashState({ error, onRetry, showHomeLink = true }: { error: unknown; onRetry: () => void; showHomeLink?: boolean }) {
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  const code = referenceCode(digest || undefined);
  useEffect(() => {
    console.error(`[${code}]`, error);
  }, [code, error]);
  return (
    <FullState icon={<TriangleAlert size={32} aria-hidden="true" />} tone="red" title="Ada yang tidak beres">
      <p className="t mut" style={{ marginTop: -8 }}>
        Halaman ini gagal dimuat. Coba muat ulang; kalau masih gagal, kembali ke Beranda. Datamu tidak hilang.
      </p>
      <button className="btn" type="button" style={{ borderRadius: 999 }} onClick={onRetry}>
        <RotateCw size={20} aria-hidden="true" />
        Muat ulang
      </button>
      {showHomeLink && (
        <Link className="btn ghost" href="/beranda" style={{ borderRadius: 999 }}>
          Ke Beranda
        </Link>
      )}
      <p className="ref">Kode untuk bantuan: {code}</p>
    </FullState>
  );
}

/** A2: the server could not be reached on first load. A3 when the device is offline. */
export function ServiceDownState({ offline, onRetry, busy }: { offline: boolean; onRetry: () => void; busy?: boolean }) {
  if (offline) {
    return (
      <FullState icon={<WifiOff size={32} aria-hidden="true" />} tone="neu" title="Kamu sedang offline">
        <p className="t mut" style={{ marginTop: -8 }}>
          Sambungkan ke internet untuk melihat dan mencatat keuanganmu. Halaman ini akan memuat sendiri begitu koneksi kembali.
        </p>
        <button className="btn" type="button" style={{ borderRadius: 999 }} onClick={onRetry} disabled={busy}>
          <RotateCw size={20} aria-hidden="true" />
          Coba lagi
        </button>
      </FullState>
    );
  }
  return (
    <FullState icon={<WifiOff size={32} aria-hidden="true" />} tone="amb" title="Layanan sedang gangguan">
      <p className="t mut" style={{ marginTop: -8 }}>
        Kami tidak bisa menghubungi server sekarang. Datamu aman dan tidak hilang; ini biasanya pulih dalam beberapa menit.
      </p>
      <button className="btn" type="button" style={{ borderRadius: 999 }} onClick={onRetry} disabled={busy}>
        <RotateCw size={20} aria-hidden="true" />
        {busy ? "Mencoba…" : "Coba lagi"}
      </button>
      <div className="rowc" style={{ alignItems: "flex-start", padding: 14 }}>
        <div className="col sp" style={{ gap: 2 }}>
          <p className="t b">Koneksimu normal?</p>
          <p className="s mut">Kalau situs lain juga tidak terbuka, masalahnya ada di internetmu. Coba ganti Wi-Fi atau data seluler.</p>
        </div>
      </div>
    </FullState>
  );
}

/** A6: unknown URL. */
export function NotFoundState() {
  return (
    <FullState icon={<MapPinOff size={32} aria-hidden="true" />} tone="neu" title="Halaman tidak ditemukan">
      <p className="t mut" style={{ marginTop: -8 }}>
        Mungkin tautannya salah atau halamannya sudah dipindah. Datamu tetap aman.
      </p>
      <Link className="btn" href="/beranda" style={{ borderRadius: 999 }}>
        Ke Beranda
      </Link>
    </FullState>
  );
}
