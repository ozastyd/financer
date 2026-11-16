"use client";

import { Check, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { cloneElement, forwardRef, isValidElement, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode } from "react";
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
  // The hint or error is read out with the field (aria-describedby on the control).
  const described = error ? `${htmlFor}-err` : hint ? `${htmlFor}-hint` : undefined;
  const control =
    described && isValidElement(children) && !(children.props as { "aria-describedby"?: string })["aria-describedby"]
      ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": described })
      : children;
  return (
    <div>
      <label className="lbl" htmlFor={htmlFor}>
        {label}
      </label>
      {control}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="s mut" style={{ marginTop: 6 }}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-err`} className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Password field with a show/hide button. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput({ className = "", ...rest }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input ref={ref} type={show ? "text" : "password"} className={`inp ${className}`} style={{ paddingRight: 52 }} autoCapitalize="none" spellCheck={false} {...rest} />
      <button
        type="button"
        className="pw-toggle"
        aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        aria-pressed={show}
        onClick={() => setShow((v) => !v)}
      >
        {show ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  );
});

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
