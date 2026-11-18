"use client";

import { BellRing, BellPlus, ChevronRight, Copy, ScrollText, Unplug } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./app-provider";
import { useToast } from "./toast";
import { Spinner } from "./ui/controls";
import { Sheet } from "./ui/sheet";
import { toAppError } from "@/lib/errors";
import { type NativeStatus, nativeApp } from "@/lib/native";
import { SOURCES } from "@/lib/notifications/parse";
import { api } from "@/lib/store/local";

interface Device {
  id: string;
  label: string | null;
  recording: boolean;
  created_at: string;
  last_seen_at: string | null;
}

const APPS = SOURCES.map((s) => s.label).join(", ");

/**
 * Profil section, only inside the Android app: connect this phone so bank and
 * e-wallet notifications are read into "Perlu dicek". The explanation comes
 * before Android's own permission screen (Play's prominent-disclosure rule).
 */
export function AutoRecord() {
  const toast = useToast();
  const { data } = useApp();
  const [app] = useState(() => nativeApp());
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const askedNotifications = useRef(false);

  const refresh = useCallback(async () => {
    if (!app) return;
    try {
      const s = await app.status();
      setStatus(s);
      // Right after notification access is granted, ask once to show Financer's own
      // "transaksi perlu dicek" notifications (Android 13+ shows a system prompt).
      if (s.connected && s.listenerEnabled && s.notificationsEnabled === false && !askedNotifications.current && app.requestNotifications) {
        askedNotifications.current = true;
        const r = await app.requestNotifications();
        setStatus({ ...s, notificationsEnabled: r.granted });
      }
      if (s.deviceId) {
        const list = await api<Device[]>("/api/devices");
        setDevice(list.find((d) => d.id === s.deviceId) ?? null);
      } else setDevice(null);
    } catch {
      setStatus({ listenerEnabled: false, connected: false, deviceId: null, queued: 0 });
    }
  }, [app]);

  // Coming back from Android settings: check again.
  useEffect(() => {
    if (!app) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first read of the phone's state
    void refresh();
    const onShow = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [app, refresh]);

  if (!app || !status) return null;

  const connected = status.connected && device !== null;

  const connect = async () => {
    setBusy(true);
    try {
      const { id, token } = await api<{ id: string; token: string }>("/api/devices", "POST", { label: "HP Android" });
      await app.connect({ token, deviceId: id, endpoint: `${window.location.origin}/api/notifications/ingest` });
      await refresh();
      if (!(await app.status()).listenerEnabled) await app.openListenerSettings();
    } catch (e) {
      const err = toAppError(e, "Gagal menghubungkan. Coba lagi.");
      if (err.kind !== "session") toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      if (device) await api(`/api/devices/${device.id}`, "DELETE");
      await app.disconnect();
      toast.success("Pencatatan otomatis dimatikan di HP ini.");
      await refresh();
    } catch (e) {
      toast.error(toAppError(e, "Gagal. Coba lagi.").message);
    } finally {
      setBusy(false);
    }
  };

  const setRecording = async (on: boolean) => {
    if (!device) return;
    try {
      await api(`/api/devices/${device.id}`, "PATCH", { recording: on });
      setDevice({ ...device, recording: on });
    } catch (e) {
      toast.error(toAppError(e, "Gagal. Coba lagi.").message);
    }
  };

  return (
    <section className="col" style={{ gap: 8 }} aria-labelledby="p-auto">
      <h2 id="p-auto" className="sec">
        Catat otomatis
      </h2>
      {!connected ? (
        <div className="card" style={{ gap: 10 }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className="icb g" aria-hidden="true">
              <BellRing size={20} />
            </span>
            <div className="col sp" style={{ gap: 4 }}>
              <p className="t b">Catat dari notifikasi bank & e-wallet</p>
              <p className="s pretty">
                Financer membaca notifikasi transaksi dari <b>{APPS}</b>, lalu memasukkannya ke &ldquo;Perlu dicek&rdquo; untuk kamu konfirmasi.
              </p>
              <p className="s mut pretty">
                Notifikasi dari aplikasi lain (chat, media sosial, dll.) tidak dibaca dan tidak dikirim. Teks notifikasi transaksi dikirim ke server Financer untuk dibaca. Bisa
                dimatikan kapan saja. <Link href="/privasi" style={{ color: "var(--pri)", textDecoration: "underline" }}>Kebijakan Privasi</Link>
              </p>
            </div>
          </div>
          <button className="btn" type="button" disabled={busy} onClick={connect}>
            {busy ? <Spinner label="Menghubungkan" /> : "Aktifkan"}
          </button>
          <p className="s mut" style={{ textAlign: "center" }}>
            Setelah ini Android meminta izin &ldquo;Akses notifikasi&rdquo; untuk Financer.
          </p>
        </div>
      ) : (
        <div className="menu">
          {status.listenerEnabled ? (
            <Link className="menu-item" href="/perlu-dicek">
              <span className="icb g" aria-hidden="true">
                <BellRing size={20} />
              </span>
              <span className="col sp" style={{ gap: 0 }}>
                <span className="t">Aktif di HP ini</span>
                <span className="s mut">
                  {(data.pendingCount ?? 0) > 0 ? `${data.pendingCount} transaksi perlu dicek` : "Belum ada yang perlu dicek"}
                  {status.queued > 0 ? ` · ${status.queued} menunggu dikirim` : ""}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" className="menu-item" onClick={() => void app.openListenerSettings()}>
              <span className="icb am" aria-hidden="true">
                <BellRing size={20} />
              </span>
              <span className="col sp" style={{ gap: 0 }}>
                <span className="t">Izinkan akses notifikasi</span>
                <span className="s mut">Buka pengaturan Android, lalu nyalakan Financer.</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
          {status.listenerEnabled && status.notificationsEnabled === false && app.requestNotifications && (
            <button
              type="button"
              className="menu-item"
              onClick={async () => {
                const r = await app.requestNotifications!();
                // Android stops showing the prompt after it was declined twice.
                if (!r.granted) toast.info("Nyalakan lewat Pengaturan HP → Aplikasi → Financer → Notifikasi.");
                void refresh();
              }}
            >
              <span className="icb am" aria-hidden="true">
                <BellPlus size={20} />
              </span>
              <span className="col sp" style={{ gap: 0 }}>
                <span className="t">Izinkan notifikasi Financer</span>
                <span className="s mut">Supaya kamu dikabari saat ada transaksi baru untuk dicek.</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
          <button type="button" role="switch" aria-checked={device?.recording ?? false} className="menu-item" onClick={() => void setRecording(!device?.recording)}>
            <span className="icb" aria-hidden="true">
              <ScrollText size={20} />
            </span>
            <span className="col sp" style={{ gap: 0 }}>
              <span className="t">Rekam notifikasi (mode uji)</span>
              <span className="s mut">Simpan teks asli untuk mengecek pembacaannya</span>
            </span>
            <span className={`switch-inline${device?.recording ? " on" : ""}`} aria-hidden="true">
              <i />
            </span>
          </button>
          {device?.recording && (
            <button type="button" className="menu-item" onClick={() => setSamplesOpen(true)}>
              <span className="icb" aria-hidden="true">
                <Copy size={20} />
              </span>
              <span className="t sp">Lihat & salin rekaman</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="menu-item" disabled={busy} onClick={disconnect}>
            <span className="icb" aria-hidden="true">
              <Unplug size={20} />
            </span>
            <span className="t sp">Matikan di HP ini</span>
          </button>
        </div>
      )}
      <SamplesSheet open={samplesOpen} onOpenChange={setSamplesOpen} />
    </section>
  );
}

interface Sample {
  package_name: string;
  title: string | null;
  text: string | null;
  parsed: boolean;
  posted_at: string | null;
}

function SamplesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const toast = useToast();
  const [samples, setSamples] = useState<Sample[] | null>(null);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload each time it opens
    setSamples(null);
    api<Sample[]>("/api/notifications/samples")
      .then(setSamples)
      .catch(() => setSamples([]));
  }, [open]);

  const asText = (samples ?? []).map((s) => `[${s.package_name}] ${s.parsed ? "TERBACA" : "TIDAK TERBACA"} ${s.posted_at ?? ""}\n${s.title ?? ""}\n${s.text ?? ""}`).join("\n\n");

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Rekaman notifikasi" subtitle="Hanya dari aplikasi bank dan e-wallet yang didukung">
      {!samples ? (
        <p className="s mut">Memuat…</p>
      ) : samples.length === 0 ? (
        <p className="s mut">Belum ada. Lakukan transaksi atau tunggu notifikasi bank/e-wallet masuk.</p>
      ) : (
        <ul className="sample-list">
          {samples.map((s, i) => (
            <li key={i}>
              <p className="s b">
                {s.package_name} · <span className={s.parsed ? "pos" : "warn-text"}>{s.parsed ? "terbaca" : "tidak terbaca"}</span>
              </p>
              <p className="s">{s.title}</p>
              <p className="s mut">{s.text}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="sheet-foot">
        <button
          className="btn"
          type="button"
          disabled={!samples?.length}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(asText);
              toast.success("Rekaman disalin. Tempel ke chat untuk dikirim.");
            } catch {
              toast.error("Gagal menyalin.");
            }
          }}
        >
          <Copy size={18} aria-hidden="true" />
          Salin semua
        </button>
        <button
          className="lnk sheet-foot-link"
          type="button"
          disabled={!samples?.length}
          onClick={async () => {
            await api("/api/notifications/samples", "DELETE").catch(() => undefined);
            setSamples([]);
          }}
        >
          Hapus rekaman
        </button>
      </div>
    </Sheet>
  );
}
