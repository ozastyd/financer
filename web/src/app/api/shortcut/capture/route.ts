import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { todayJakarta } from "@/lib/date";
import { addPending, deviceByTokenHash, listCategories, touchDevice } from "@/lib/db";
import { captureItems, captureReply } from "@/lib/notifications/capture";
import { occurredAt } from "@/lib/notifications/ingest";
import { ScanError, scanEnabled, scanImage } from "@/lib/scan";
import { makeLimiter } from "@/lib/server";

// Called by the "Catat ke Financer" iPhone shortcut (Back Tap or the share
// sheet) with the device code as a bearer token and the screenshot as a form
// file. The image is read once by the scan and never stored; what it finds
// goes to "Perlu dicek". The reply is plain text: the shortcut shows it as
// its notification.

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const perDevice = makeLimiter(20, 60 * 60 * 1000);

const text = (body: string, status = 200, headers?: Record<string, string>) =>
  new NextResponse(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...headers } });

/** One line per attempt in the server log (never the code or the image), to help set up a shortcut. */
const log = (req: Request, status: number, why: string) =>
  console.info(`shortcut capture: ${status} ${why} (type=${(req.headers.get("content-type") ?? "-").split(";")[0]}, auth=${req.headers.has("authorization") ? "yes" : "no"})`);

/**
 * The image, sent either as a form field "file" (Request Body: Form) or as the
 * whole body (Request Body: File) — both are easy to pick in Shortcuts.
 */
async function readImage(req: Request): Promise<{ buf: Buffer; type: string; name: string } | null> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type === "multipart/form-data" || type === "application/x-www-form-urlencoded") {
    const form = await req.formData();
    const file = form.get("file") ?? [...form.values()].find((v) => v instanceof File) ?? null;
    if (!(file instanceof File) || file.size === 0) return null;
    return { buf: Buffer.from(await file.arrayBuffer()), type: file.type, name: file.name };
  }
  const buf = Buffer.from(await req.arrayBuffer());
  return buf.length ? { buf, type: type === "application/octet-stream" ? "" : type, name: "" } : null;
}

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^\s*Bearer\s*/i, "").replace(/\s+/g, "");
  const device = token.length >= 20 ? deviceByTokenHash(createHash("sha256").update(token).digest("hex")) : undefined;
  if (!device) {
    log(req, 401, token ? "unknown code" : "no code");
    return text("Kode Financer tidak valid. Buka Financer › Profil › Catat otomatis untuk kode baru.", 401);
  }
  if (!scanEnabled) return text("Pembacaan layar sedang tidak tersedia. Coba lagi nanti.", 503);
  const wait = perDevice.blocked(device.id);
  if (wait) return text("Sudah banyak yang dikirim dalam sejam terakhir. Coba lagi nanti.", 429, { "retry-after": String(wait) });

  let image: Awaited<ReturnType<typeof readImage>>;
  try {
    image = await readImage(req);
  } catch {
    image = null;
  }
  if (!image) {
    log(req, 400, "no image");
    return text("Gambar tidak terkirim. Coba lagi.", 400);
  }
  if (image.buf.length > MAX_BYTES) return text("Gambar terlalu besar.", 413);
  if (image.type && !IMAGE_TYPES.has(image.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(image.name)) {
    log(req, 415, `not an image: ${image.type}`);
    return text("Yang dikirim bukan gambar.", 415);
  }

  perDevice.hit(device.id);
  touchDevice(device.id);
  const buf = image.buf;
  const categories = listCategories(device.user_id);
  try {
    const result = await scanImage(buf, categories, todayJakarta());
    const items = captureItems(result);
    const at = occurredAt(undefined);
    const imageHash = createHash("sha256").update(buf).digest("hex");
    let added = 0;
    items.forEach((it, i) => {
      const isNew = addPending(device.user_id, {
        source: "screenshot",
        type: it.type,
        amount: it.amount,
        description: it.description.slice(0, 120),
        counterparty: null,
        category_hint: categories.find((c) => c.id === it.category_id)?.name ?? null,
        maybe_transfer: /transfer|top ?up|kirim uang|send money/i.test(it.description) ? 1 : 0,
        occurred_date: it.date && it.date <= at.date ? it.date : at.date,
        occurred_time: !it.date || it.date === at.date ? at.time : null,
        raw_title: null,
        raw_text: null,
        fingerprint: `${imageHash}:${i}`,
      });
      if (isNew) added++;
    });
    log(req, 200, `found ${items.length}, added ${added}`);
    return text(captureReply(items, added));
  } catch (e) {
    if (e instanceof ScanError) return text(e.code === "busy" ? "Sedang ramai. Coba lagi sebentar lagi." : "Layar ini belum bisa dibaca. Coba lagi.", e.code === "busy" ? 429 : 422);
    console.error("shortcut capture: failed", e instanceof Error ? e.name : "");
    return text("Gagal membaca layar. Coba lagi.", 502);
  }
}
