"use client";

import { Bike, Laptop, Shirt, Smartphone, Sparkles, Utensils, Wallet, Bus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { BrandMark } from "@/components/brand";

// Welcome for brand-new visitors: three slides to swipe through, then
// "Mulai" starts onboarding (the account is created at the end of it).

interface Slide {
  title: string;
  body: string;
  stage: ReactNode;
}

function TxRow({ icon, title, sub, amount, positive }: { icon: ReactNode; title: string; sub: string; amount: string; positive?: boolean }) {
  return (
    <div className="row" style={{ gap: 12 }}>
      <span className={`icb${positive ? " g" : ""}`} style={{ width: 40, height: 40, borderRadius: 12 }}>
        {icon}
      </span>
      <div className="col sp" style={{ gap: 0 }}>
        <p className="s b">{title}</p>
        <p className="s mut">{sub}</p>
      </div>
      <p className={`s b num ${positive ? "pos" : "neg"}`}>{amount}</p>
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    title: "Kejar target tabunganmu",
    body: "Buat tujuan seperti dana darurat atau laptop baru, lalu lihat progresnya naik setiap kamu menabung.",
    stage: (
      <>
        <div className="intro-card welcome-card" style={{ left: "50%", top: 64, width: 220, height: 190, marginLeft: -150, transform: "rotate(-10deg)", opacity: 0.7 }} />
        <div className="intro-card welcome-card" style={{ left: "50%", top: 52, width: 230, height: 196, marginLeft: -128, transform: "rotate(-4deg)", opacity: 0.85 }} />
        <div className="intro-card welcome-card" style={{ left: "50%", top: 40, width: 250, marginLeft: -110, transform: "rotate(4deg)", background: "var(--hero)", color: "#f1f5f4", gap: 12, padding: 18 }}>
          <p className="s" style={{ opacity: 0.75 }}>
            Tujuan utama
          </p>
          <p className="h2">Rp10 Juta Pertamaku</p>
          <div className="bar" style={{ background: "var(--heroline)" }}>
            <i style={{ width: "40%", background: "#5EE0B0" }} />
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="s num">Rp4.000.000</p>
            <p className="s" style={{ opacity: 0.75 }}>
              40%
            </p>
          </div>
        </div>
        <span className="intro-card welcome-tag" style={{ left: "50%", top: 222, marginLeft: 20 }}>
          Mulai nabung
        </span>
      </>
    ),
  },
  {
    title: "Catat dalam hitungan detik",
    body: "Pemasukan dan pengeluaran tercatat rapi per kategori, jadi kamu tahu ke mana uangmu pergi.",
    stage: (
      <>
        <span className="intro-card welcome-tag soft" style={{ right: 28, top: 52, transform: "rotate(8deg)" }}>
          Tercatat otomatis
        </span>
        <div className="intro-card welcome-card" style={{ left: 34, right: 34, top: 82, opacity: 0.9 }}>
          <TxRow icon={<Utensils size={18} aria-hidden="true" />} title="Makan siang" sub="Makan & minum" amount="−Rp25.000" />
        </div>
        <div className="intro-card welcome-card" style={{ left: 18, right: 18, top: 150, padding: 18, zIndex: 1 }}>
          <TxRow icon={<Wallet size={18} aria-hidden="true" />} title="Gaji bulan ini" sub="Gaji" amount="+Rp5.000.000" positive />
        </div>
        <div className="intro-card welcome-card" style={{ left: 34, right: 34, top: 228, opacity: 0.9 }}>
          <TxRow icon={<Bus size={18} aria-hidden="true" />} title="Ongkos kuliah" sub="Transport" amount="−Rp12.000" />
        </div>
      </>
    ),
  },
  {
    title: "Mau beli sesuatu? Tanya dulu",
    body: "AI Coach mengecek harga terbaru di internet dan menghitung apakah kamu mampu, tanpa mengganggu tujuanmu.",
    stage: (
      <>
        <span className="orbit-ring" style={{ left: "50%", top: 170, width: 300, height: 300, margin: "-150px 0 0 -150px" }} />
        <span className="orbit-ring" style={{ left: "50%", top: 170, width: 190, height: 190, margin: "-95px 0 0 -95px" }} />
        <span className="intro-card orbit-core" style={{ left: "50%", top: 170, margin: "-48px 0 0 -48px" }}>
          <Sparkles size={40} aria-hidden="true" />
        </span>
        <span className="intro-card orbit-node" style={{ left: "50%", top: 58, marginLeft: -112 }}>
          <Laptop size={26} aria-hidden="true" />
        </span>
        <span className="intro-card orbit-node" style={{ left: "50%", top: 120, marginLeft: 76 }}>
          <Bike size={26} aria-hidden="true" />
        </span>
        <span className="intro-card orbit-node" style={{ left: "50%", top: 222, marginLeft: -150 }}>
          <Shirt size={26} aria-hidden="true" />
        </span>
        <span className="intro-card orbit-node" style={{ left: "50%", top: 244, marginLeft: 40 }}>
          <Smartphone size={26} aria-hidden="true" />
        </span>
        <span className="intro-card welcome-tag soft" style={{ left: "50%", top: 40, marginLeft: 24 }}>
          Cek harga real-time
        </span>
      </>
    ),
  },
];

export default function WelcomePage() {
  const { status } = useApp();
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    if (status === "ready" || status === "error") router.replace("/beranda");
  }, [status, router]);

  // Follow the swipe: the slide whose center is in view is the current one.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <main className="intro welcome flex flex-1 flex-col">
      <div style={{ display: "flex", justifyContent: "center", padding: "22px 20px 4px" }}>
        <BrandMark height={34} />
      </div>

      <div ref={track} className="welcome-track" aria-roledescription="carousel" aria-label="Kenalan dengan Financer">
        {SLIDES.map((s, i) => (
          <section
            key={s.title}
            className={`welcome-slide${i === index ? " on" : ""}`}
            aria-roledescription="slide"
            aria-label={`${i + 1} dari ${SLIDES.length}`}
            aria-hidden={i !== index}
          >
            <div aria-hidden="true" className="welcome-stage">
              {s.stage}
            </div>
            <div className="welcome-copy">
              <h1 className="h1">{s.title}</h1>
              <p className="t mut">{s.body}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="scr" style={{ padding: "22px 24px 28px", gap: 14, background: "transparent" }}>
        <div className="welcome-dots" role="group" aria-label="Pilih slide">
          {SLIDES.map((s, i) => (
            <button key={s.title} type="button" aria-label={`Slide ${i + 1}`} aria-current={i === index} onClick={() => goTo(i)} />
          ))}
        </div>
        <div className="sp" />
        {last ? (
          <Link className="btn" href="/onboarding" style={{ height: 56 }}>
            Mulai
          </Link>
        ) : (
          <button className="btn" type="button" style={{ height: 56 }} onClick={() => goTo(index + 1)}>
            Lanjut
          </button>
        )}
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
