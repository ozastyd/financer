"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/** Bottom sheet with focus trapping, Escape to close and a labelled close button. */
export function Sheet({ open, onOpenChange, title, subtitle, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
