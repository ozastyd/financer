"use client";

import { ChevronRight, Compass, Ellipsis, Plus, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet } from "./ui/sheet";
import { iosBrowser, isIPhone, isStandalone } from "@/lib/platform";

/**
 * Profil, iPhone only: iOS has no install prompt, so this explains Share →
 * Add to Home Screen. Hidden once Financer runs from the Home Screen icon.
 */
export function InstallIPhone() {
  const [show, setShow] = useState(false);
  const [browser, setBrowser] = useState<"safari" | "other" | "in-app">("safari");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decided on the client only
    setShow(isIPhone() && !isStandalone());
    setBrowser(iosBrowser());
  }, []);
  if (!show) return null;

  return (
    <>
      <button type="button" className="menu-item install-row" onClick={() => setOpen(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small static app icon */}
        <img className="install-icon" src="/brand/icon-192.png" alt="" width={44} height={44} />
        <span className="col sp" style={{ gap: 0 }}>
          <span className="t b">Pasang Financer di layar utama</span>
          <span className="s mut">Buka seperti aplikasi: layar penuh, sekali ketuk.</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Pasang di layar utama" subtitle="Sekitar 10 detik, tanpa App Store">
        {browser === "in-app" ? (
          <div className="col" style={{ gap: 12 }}>
            <p className="t pretty">Kamu sedang membuka Financer di dalam aplikasi lain (misalnya Instagram atau WhatsApp). Dari sini Financer belum bisa dipasang.</p>
            <ol className="install-steps">
              <li>
                <span className="install-n num" aria-hidden="true">1</span>
                <span className="t sp">
                  Ketuk menu <b>•••</b> atau ikon kompas <Compass size={16} aria-label="kompas" className="inline-ic" /> di pojok layar.
                </span>
              </li>
              <li>
                <span className="install-n num" aria-hidden="true">2</span>
                <span className="t sp">
                  Pilih <b>Buka di Safari</b> (Open in Safari).
                </span>
              </li>
              <li>
                <span className="install-n num" aria-hidden="true">3</span>
                <span className="t sp">Di Safari, buka Profil lagi dan ikuti panduan ini.</span>
              </li>
            </ol>
          </div>
        ) : (
          <div className="col" style={{ gap: 14 }}>
            <ol className="install-steps">
              <li>
                <span className="install-n num" aria-hidden="true">1</span>
                <span className="t sp">
                  Ketuk <b>Bagikan</b> <Share size={17} aria-label="ikon Bagikan" className="inline-ic" />{" "}
                  {browser === "safari" ? "di bilah bawah Safari." : "di pojok kanan atas."}
                  <span className="s mut install-alt">
                    Tidak kelihatan? Ketuk <Ellipsis size={15} aria-label="tiga titik" className="inline-ic" /> dulu, lalu Bagikan.
                  </span>
                </span>
              </li>
              <li>
                <span className="install-n num" aria-hidden="true">2</span>
                <span className="t sp">
                  Gulir ke bawah, pilih <b>Tambah ke Layar Utama</b> <Plus size={16} aria-label="ikon tambah" className="inline-ic boxed" />
                  <span className="s mut install-alt">Add to Home Screen</span>
                </span>
              </li>
              <li>
                <span className="install-n num" aria-hidden="true">3</span>
                <span className="t sp">
                  Ketuk <b>Tambah</b> di pojok kanan atas.
                </span>
              </li>
            </ol>
            <div className="install-preview" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- small static app icon */}
              <img src="/brand/icon-192.png" alt="" width={56} height={56} />
              <span className="s b">Financer</span>
            </div>
            <p className="s mut pretty" style={{ textAlign: "center" }}>
              Ikon Financer muncul di layar utama. Buka dari sana: tampil penuh tanpa bilah browser, dan kamu tetap masuk.
            </p>
          </div>
        )}
        <div className="sheet-foot">
          <button className="btn" type="button" onClick={() => setOpen(false)}>
            Mengerti
          </button>
        </div>
      </Sheet>
    </>
  );
}
