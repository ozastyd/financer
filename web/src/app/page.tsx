"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/components/app-provider";

export default function IntroPage() {
  const { status } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (status === "ready" || status === "error") router.replace("/beranda");
  }, [status, router]);

  return (
    <main className="intro flex flex-1 flex-col">
      {/* Illustration: a preview of the app's cards, clearly marked as an example */}
      <div
        aria-hidden="true"
        className="intro-stage"
        style={{ position: "relative", height: 420, flex: "none", background: "var(--pris)", borderRadius: "0 0 36px 36px", overflow: "hidden" }}
      >
        <span className="tag neu" style={{ position: "absolute", left: 20, top: 20, background: "var(--sf)" }}>
          Contoh tampilan
        </span>
        <div className="intro-card float hero" style={{ left: 22, top: 76, width: 232, transform: "rotate(-6deg)" }}>
          <div className="row">
            <p className="s mut sp">Tujuan utama</p>
          </div>
          <p className="h2">Rp10 Juta Pertamaku</p>
          <div className="bar" style={{ background: "var(--heroline)" }}>
            <i style={{ width: "40%", background: "#5EE0B0" }} />
          </div>
          <p className="s mut">Naik tiap kamu setor</p>
        </div>
        <div className="intro-card float" style={{ right: 18, top: 64, width: 136, alignItems: "center", transform: "rotate(7deg)" }}>
          <svg width="72" height="72" viewBox="0 0 88 88">
            <circle cx="44" cy="44" r="38" fill="none" strokeWidth="8" style={{ stroke: "var(--sf2)" }} />
            <circle cx="44" cy="44" r="38" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray="150 238.8" transform="rotate(-90 44 44)" style={{ stroke: "var(--pri)" }} />
          </svg>
          <p className="s b" style={{ textAlign: "center" }}>
            Progres tujuan
          </p>
        </div>
        <div className="intro-card float" style={{ left: 50, top: 252, width: 276, transform: "rotate(3deg)" }}>
          <div className="row">
            <span className="icb bl" style={{ width: 32, height: 32, borderRadius: 10 }}>
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <p className="s b sp">AI Coach</p>
          </div>
          <p className="s">Tanya &ldquo;aku mampu beli ini nggak?&rdquo; dan dapat hitungan dari catatanmu sendiri.</p>
        </div>
      </div>

      <div className="scr" style={{ padding: "28px 24px 32px", gap: 14 }}>
        <h1 className="h1" style={{ fontSize: 36, lineHeight: 1.12 }}>
          Uangmu, tujuanmu, masa depanmu.
        </h1>
        <p className="t mut">Catat pengeluaran, kejar target, dan tanya AI kapan pun kamu bingung soal uang.</p>
        <div className="sp" />
        <Link className="btn" href="/masuk" style={{ height: 56 }}>
          Mulai
        </Link>
        <p className="s" style={{ textAlign: "center" }}>
          Sudah punya akun?{" "}
          <Link className="b" href="/masuk?mode=masuk" style={{ color: "var(--pri)", display: "inline-block", padding: "12px 4px" }}>
            Masuk
          </Link>
        </p>
      </div>
    </main>
  );
}
