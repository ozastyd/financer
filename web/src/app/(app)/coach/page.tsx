"use client";

import { Spinner } from "@/components/ui/controls";

/** The Coach is a sheet now; the shell opens it and moves this address to Beranda. */
export default function CoachPage() {
  return (
    <main className="scr safe" style={{ justifyContent: "center", alignItems: "center" }}>
      <Spinner label="Membuka AI Coach" />
    </main>
  );
}
