"use client";

// Bridge to the Financer Android app's native code (mobile/android). The
// website runs inside the app's WebView, where Capacitor exposes registered
// native plugins on window.Capacitor. In a normal browser none of this exists.

export interface NativeStatus {
  /** The user granted Financer notification access in Android settings. */
  listenerEnabled: boolean;
  /** This phone is connected to an account (has a device token). */
  connected: boolean;
  deviceId: string | null;
  /** Notifications waiting on the phone to be sent. */
  queued: number;
}

interface FinancerNativePlugin {
  status(): Promise<NativeStatus>;
  openListenerSettings(): Promise<void>;
  connect(opts: { token: string; deviceId: string; endpoint: string }): Promise<void>;
  disconnect(): Promise<void>;
  flush(): Promise<{ sent: number }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  registerPlugin?: <T>(name: string) => T;
  Plugins?: Record<string, unknown>;
}

let cached: FinancerNativePlugin | null | undefined;

/** The native plugin when running inside the Android app, otherwise null. */
export function nativeApp(): FinancerNativePlugin | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.()) return (cached = null);
  cached = (cap.Plugins?.FinancerNative as FinancerNativePlugin | undefined) ?? cap.registerPlugin?.<FinancerNativePlugin>("FinancerNative") ?? null;
  return cached;
}

/** Disconnects this phone from the account (on sign-out): revokes its token and clears it on the phone. */
export async function disconnectThisPhone(): Promise<void> {
  const app = nativeApp();
  if (!app) return;
  try {
    const s = await app.status();
    if (s.deviceId) await fetch(`/api/devices/${encodeURIComponent(s.deviceId)}`, { method: "DELETE" }).catch(() => undefined);
    await app.disconnect();
  } catch {
    // best effort: the server also rejects tokens of deleted accounts
  }
}
