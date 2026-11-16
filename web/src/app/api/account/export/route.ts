import { NextResponse } from "next/server";
import { exportRows } from "@/lib/db";
import { todayJakarta } from "@/lib/date";
import { requireUser } from "@/lib/server";

const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Everything the user recorded as a CSV file (opens in Excel and Google Sheets). */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const lines = [["Tanggal", "Jenis", "Kategori / tujuan", "Jumlah (Rp)", "Catatan"].join(",")];
  for (const r of exportRows(auth.uid)) lines.push([r.date, r.kind, r.label, r.amount, r.note].map(cell).join(","));
  // The byte-order mark makes Excel read the file as UTF-8.
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="financer-${todayJakarta()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
