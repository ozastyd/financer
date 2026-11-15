"use client";

import { useEffect } from "react";
import { referenceCode } from "@/lib/errors";

// A5: the root layout itself failed. Renders its own document without the app's
// stylesheet, so everything it needs is inline. Follows the saved theme.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  const code = referenceCode(digest || undefined);
  useEffect(() => console.error(`[${code}]`, error), [code, error]);

  const themeScript = `try{var t=localStorage.getItem('fo-theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.setAttribute('data-theme','dark')}catch(e){}`;
  const css = `
    :root{--bg:#F5F6F2;--ink:#101B17;--mut:#56655F;--pri:#047857;--onpri:#FFFFFF}
    [data-theme="dark"]{--bg:#0B1220;--ink:#F1F5F4;--mut:#A3B0BD;--pri:#34D399;--onpri:#04261B}
    body{margin:0;min-height:100vh;display:flex;justify-content:center;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    main{width:100%;max-width:440px;box-sizing:border-box;padding:96px 28px 40px;display:flex;flex-direction:column;gap:18px}
    h1{margin:0;font-size:26px;line-height:1.2;font-weight:800}
    p{margin:0;color:var(--mut);font-size:15px;line-height:1.5}
    button{height:52px;border:0;border-radius:999px;background:var(--pri);color:var(--onpri);font:inherit;font-size:16px;font-weight:700;cursor:pointer}
    button:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
    small{color:var(--mut);font-size:12px;font-weight:700;text-align:center;letter-spacing:.04em}`;

  return (
    <html lang="id">
      <head>
        <title>Financial OS gagal dibuka</title>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main>
          <h1>Financial OS gagal dibuka</h1>
          <p>Ada masalah saat memuat aplikasi. Muat ulang halaman ini; datamu tidak hilang.</p>
          <button type="button" onClick={() => retry()}>
            Muat ulang
          </button>
          <small>Kode untuk bantuan: {code}</small>
        </main>
      </body>
    </html>
  );
}
