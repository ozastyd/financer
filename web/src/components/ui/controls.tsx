"use client";

import { Check, LoaderCircle } from "lucide-react";
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { formatAmountInput, parseRupiahInput } from "@/lib/money";

export function Spinner({ label = "Memuat" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Tag({ tone, children }: { tone?: "blu" | "amb" | "neu"; children: ReactNode }) {
  return <span className={`tag${tone ? ` ${tone}` : ""}`}>{children}</span>;
}

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  on?: boolean;
  filter?: boolean;
  check?: boolean;
}

export function Chip({ on, filter, check, className = "", children, ...rest }: ChipProps) {
  return (
    <button type="button" aria-pressed={on} className={`chip${filter ? " f" : ""}${on ? " on" : ""} ${className}`} {...rest}>
      {check && on && <Check size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}

interface SegOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={`seg${options.length === 3 ? " three" : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? "on" : ""} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label className="lbl" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="s mut" style={{ marginTop: 6 }}>{hint}</p>}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type AmountInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onValueChange: (v: number | null) => void;
};

/** Text input that keeps whole rupiah and shows "Rp1.500.000" formatting. */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput({ value, onValueChange, className = "", ...rest }, ref) {
  return (
    <div style={{ position: "relative" }}>
      <span className="b mut" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} aria-hidden="true">
        Rp
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={`inp num ${className}`}
        style={{ paddingLeft: 44 }}
        value={formatAmountInput(value)}
        onChange={(e) => onValueChange(parseRupiahInput(e.target.value))}
        {...rest}
      />
    </div>
  );
});

export function useFieldId(prefix: string) {
  const id = useId();
  return `${prefix}-${id.replace(/:/g, "")}`;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="err" role="alert" style={{ marginTop: 0 }}>
      {message}
    </p>
  );
}
