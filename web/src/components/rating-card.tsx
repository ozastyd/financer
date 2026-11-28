"use client";

import { useEffect, useRef, useState } from "react";
import HelpfulRating, { type HelpfulFeedback } from "@/components/kokonutui/helpful-rating";
import { Sheet } from "@/components/ui/sheet";
import { RATING_REASONS } from "@/lib/rating";

/** Seconds on Beranda before the card comes up, so it never greets the user. */
const DELAY_MS = 4000;
/** Asked at most once per app visit, even if Beranda is opened again. */
let checkedThisVisit = false;

/**
 * "Seberapa Financer membantumu?" for people who have used the app for a while
 * (the server decides who: see lib/rating.ts). Shown in a sheet on Beranda,
 * only while nothing else is open.
 */
export function RatingCard({ allowed }: { allowed: boolean }) {
  const [open, setOpen] = useState(false);
  const [eligible, setEligible] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (checkedThisVisit) return;
    checkedThisVisit = true;
    fetch("/api/rating", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { ask: false }))
      .then((d: { ask?: boolean }) => setEligible(!!d.ask))
      .catch(() => {
        /* no card this visit */
      });
  }, []);

  // Comes up a few seconds into a calm moment on Beranda; anything else opening first postpones it.
  useEffect(() => {
    if (!eligible || !allowed || open) return;
    const t = setTimeout(() => {
      setEligible(false);
      setOpen(true);
      void fetch("/api/rating", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "asked" }) }).catch(() => {});
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [eligible, allowed, open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const submit = async (f: HelpfulFeedback) => {
    const res = await fetch("/api/rating", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    if (!res.ok) throw new Error(String(res.status));
    closeTimer.current = setTimeout(() => setOpen(false), 2500);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Satu pertanyaan singkat">
      <HelpfulRating
        question="Seberapa Financer membantumu?"
        lowReasons={RATING_REASONS.low}
        highReasons={RATING_REASONS.high}
        onSubmit={submit}
        allowChange={false}
        className="max-w-none border-0 bg-transparent p-0 pb-2"
      />
    </Sheet>
  );
}
