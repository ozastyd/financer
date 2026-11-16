"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** When true, closing (scrim tap, Esc, close button) first asks before throwing the input away. */
  dirty?: boolean;
  /** Second line of the discard question, e.g. what was being filled in. */
  discardText?: string;
}

/** Bottom sheet with focus trapping, Escape to close and a labelled close button. */
export function Sheet({ open, onOpenChange, title, subtitle, children, dirty = false, discardText = "Isian yang belum disimpan akan hilang." }: SheetProps) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new open starts without the question
    if (open) setConfirm(false);
  }, [open]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (o) return onOpenChange(true);
        if (dirty && !confirm) return setConfirm(true);
        onOpenChange(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="sheet" aria-describedby={undefined}>
          <div className="grab" aria-hidden="true" />
          <div className="row">
            <div className="col sp" style={{ gap: 0 }}>
              <Dialog.Title className="h2">{title}</Dialog.Title>
              {subtitle && <div className="s mut">{subtitle}</div>}
            </div>
            <Dialog.Close className="ibtn" aria-label="Tutup">
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
          {confirm && (
            <div className="discard pinned" role="alertdialog" aria-labelledby="sheet-discard-title">
              <p id="sheet-discard-title" className="t b">
                Buang isian ini?
              </p>
              <p className="s mut">{discardText}</p>
              <div className="g2">
                <button type="button" className="btn ghost sm" autoFocus onClick={() => setConfirm(false)}>
                  Lanjut isi
                </button>
                <button type="button" className="btn danger sm" onClick={() => onOpenChange(false)}>
                  Buang
                </button>
              </div>
            </div>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
