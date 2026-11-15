"use client";

import { useCountUp } from "@/lib/motion";
import { formatRupiah } from "@/lib/money";

/** A rupiah amount that counts to its value. Screen readers get the final value only. */
export function AnimatedRupiah({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const shown = useCountUp(value);
  return (
    <p className={className} style={style}>
      <span aria-hidden="true">{formatRupiah(Math.round(shown))}</span>
      <span className="sr-only">{formatRupiah(value)}</span>
    </p>
  );
}
