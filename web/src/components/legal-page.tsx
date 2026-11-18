import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./brand";

/** Public reading page (privacy policy, account deletion): readable measure, no app chrome. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="scr safe legal" style={{ gap: 20, paddingInline: 24, paddingBottom: 40 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="ibtn" href="/" aria-label="Ke halaman awal">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <BrandMark height={28} />
        <span style={{ width: 44, flex: "none" }} />
      </div>
      <header className="col" style={{ gap: 6 }}>
        <h1 className="h1" style={{ fontSize: 30 }}>
          {title}
        </h1>
        <p className="s mut">Terakhir diperbarui {updated}</p>
      </header>
      <article className="legal-body">{children}</article>
    </main>
  );
}
