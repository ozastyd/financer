import { NextResponse } from "next/server";
import { todayJakarta } from "@/lib/date";
import { hasSimilarTransaction, listCategories } from "@/lib/db";
import { ScanError, scanEnabled, scanImage, scanPdf } from "@/lib/scan";
import { makeLimiter, requireUser } from "@/lib/server";

// Reads an uploaded receipt photo, bank-app screenshot or statement PDF and
// returns the transactions found, for the user to review before saving.
// The file is never stored.

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
// Each scan uses the shared free-tier vision quota; keep one account from using it all.
const perUser = makeLimiter(30, 60 * 60 * 1000);

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  if (!scanEnabled) return NextResponse.json({ error: "Fitur scan sedang tidak tersedia." }, { status: 503 });

  const wait = perUser.blocked(auth.uid);
  if (wait) return NextResponse.json({ error: "Kamu sudah banyak scan dalam sejam terakhir." }, { status: 429, headers: { "retry-after": String(wait) } });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "File tidak terkirim. Coba lagi." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Pilih foto atau file dulu." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File terlalu besar (maksimal 10 MB)." }, { status: 413 });
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf && !IMAGE_TYPES.has(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    return NextResponse.json({ error: "Format belum didukung. Pakai foto (JPG/PNG) atau PDF." }, { status: 415 });
  }
  const password = form.get("password");

  perUser.hit(auth.uid);
  const categories = listCategories(auth.uid);
  const today = todayJakarta();
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const result = isPdf
      ? await scanPdf(buf, typeof password === "string" && password ? password : undefined, categories, today, Date.now() + 60_000)
      : await scanImage(buf, categories, today);
    const transactions = result.transactions.map((t) => ({
      ...t,
      duplicate: Boolean(t.date && hasSimilarTransaction(auth.uid, t.date, t.type, t.amount)),
    }));
    return NextResponse.json({ ...result, transactions, source: isPdf ? "pdf" : "image" });
  } catch (e) {
    if (e instanceof ScanError) {
      const status = e.code === "busy" ? 429 : e.code === "password" ? 422 : 422;
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status, headers: e.retryAfter ? { "retry-after": String(e.retryAfter) } : undefined },
      );
    }
    console.error("scan: failed", e instanceof Error ? e.name : "");
    return NextResponse.json({ error: "Gagal membaca file. Coba lagi.", code: "failed" }, { status: 502 });
  }
}
