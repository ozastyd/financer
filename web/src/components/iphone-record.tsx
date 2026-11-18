"use client";

import { BookOpen, ChevronRight, Smartphone, Unplug, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "./toast";
import { toAppError } from "@/lib/errors";
import { IPHONE_LABEL, isIPhone, lastUsedLabel } from "@/lib/platform";
import { api } from "@/lib/store/local";

interface Device {
  id: string;
  label: string | null;
  last_seen_at: string | null;
}

const DISMISS = "financer:iphone-card-dismissed";

/** iPhone codes connected to this account (from the "Catat ke Financer" shortcut). */
function useIPhoneDevices(active: boolean) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const load = useCallback(async () => {
    try {
      setDevices((await api<Device[]>("/api/devices")).filter((d) => d.label === IPHONE_LABEL));
    } catch {
      setDevices([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load
    if (active) void load();
  }, [active, load]);
  return { devices, reload: load };
}

/** Beranda: tells iPhone users about Back Tap until they set it up or dismiss it. */
export function IPhoneCard() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS) === "1";
    } catch {
      /* optional */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decided on the client only
    setShow(isIPhone() && !dismissed);
  }, []);
  const { devices } = useIPhoneDevices(show);
  if (!show || !devices || devices.some((d) => d.last_seen_at)) return null;

  return (
    <section className="ip-card" aria-labelledby="ip-card-title">
      <span className="ip-mark sm" aria-hidden="true">
        <Smartphone size={22} strokeWidth={1.8} />
        <i />
        <i />
      </span>
      <div className="col sp" style={{ gap: 2, minWidth: 0 }}>
        <h2 id="ip-card-title" className="t b">
          Catat dari layar, tanpa ngetik
        </h2>
        <p className="s pretty">Ketuk 2x belakang iPhone di halaman bukti transaksi, Financer yang mencatat.</p>
        <Link className="lnk" href="/catat-iphone" style={{ minHeight: 40 }}>
          Atur sekarang
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <button
        type="button"
        className="ibtn ip-close"
        aria-label="Tutup"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISS, "1");
          } catch {
            /* optional */
          }
          setShow(false);
        }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

/** Profil → Catat otomatis on an iPhone. */
export function IPhoneRecord() {
  const toast = useToast();
  const [iphone, setIphone] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decided on the client only
    setIphone(isIPhone());
  }, []);
  const { devices, reload } = useIPhoneDevices(iphone);
  if (!iphone || !devices) return null;
  const used = devices.filter((d) => d.last_seen_at).sort((a, b) => ((a.last_seen_at ?? "") < (b.last_seen_at ?? "") ? 1 : -1));

  const disconnect = async () => {
    try {
      await Promise.all(devices.map((d) => api(`/api/devices/${d.id}`, "DELETE")));
      try {
        window.localStorage.removeItem("financer:iphone-setup");
      } catch {
        /* optional */
      }
      toast.success("Shortcut diputus. Kodenya tidak berlaku lagi.");
      await reload();
    } catch (e) {
      toast.error(toAppError(e, "Gagal. Coba lagi.").message);
    }
  };

  return (
    <section className="col" style={{ gap: 8 }} aria-labelledby="p-auto-ip">
      <h2 id="p-auto-ip" className="sec">
        Catat otomatis
      </h2>
      {used.length === 0 ? (
        <Link className="menu-item ip-row" href="/catat-iphone">
          <span className="ip-mark sm" aria-hidden="true">
            <Smartphone size={20} strokeWidth={1.8} />
            <i />
            <i />
          </span>
          <span className="col sp" style={{ gap: 0 }}>
            <span className="t b">Ketuk 2x belakang iPhone</span>
            <span className="s mut">Catat transaksi dari layar bukti transaksi. Atur sekali, sekitar 2 menit.</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      ) : (
        <div className="menu">
          <Link className="menu-item" href="/perlu-dicek">
            <span className="icb g" aria-hidden="true">
              <Smartphone size={20} />
            </span>
            <span className="col sp" style={{ gap: 0 }}>
              <span className="t">Aktif di iPhone</span>
              <span className="s mut">Terakhir dipakai {lastUsedLabel(used[0].last_seen_at)}</span>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
          <Link className="menu-item" href="/catat-iphone">
            <span className="icb" aria-hidden="true">
              <BookOpen size={20} />
            </span>
            <span className="t sp">Panduan pemasangan</span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
          <button type="button" className="menu-item" onClick={disconnect}>
            <span className="icb" aria-hidden="true">
              <Unplug size={20} />
            </span>
            <span className="t sp">Putuskan shortcut</span>
          </button>
        </div>
      )}
    </section>
  );
}
