import "server-only";

// Outgoing email (password reset links) through Mailjet's Send API v3.1.
// Configure in .env.local:
//   MAILJET_API_KEY     API key from Mailjet (Account settings → API key management)
//   MAILJET_SECRET_KEY  the matching secret key
//   MAIL_FROM           a sender address Mailjet has validated, e.g. noreply@financer.my.id
//   MAIL_FROM_NAME      optional display name (default "Financer")
//   MAILJET_API_URL     optional override (used for local testing)
// Without the keys and MAIL_FROM, email is off and "Lupa kata sandi" is hidden.

const API_URL = process.env.MAILJET_API_URL || "https://api.mailjet.com/v3.1/send";

export const mailConfigured = () => Boolean(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY && process.env.MAIL_FROM);

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(m: Mail): Promise<void> {
  const auth = Buffer.from(`${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`).toString("base64");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: process.env.MAIL_FROM, Name: process.env.MAIL_FROM_NAME || "Financer" },
          To: [{ Email: m.to }],
          Subject: m.subject,
          TextPart: m.text,
          HTMLPart: m.html,
        },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as { Messages?: { Status?: string; Errors?: { ErrorMessage?: string }[] }[] } | null;
  const msg = json?.Messages?.[0];
  if (!res.ok || msg?.Status !== "success") {
    throw new Error(`mail: Mailjet ${res.status} ${msg?.Errors?.map((e) => e.ErrorMessage).join("; ") ?? ""}`.trim());
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** The reset email: plain, readable on any client, in Indonesian. */
export function resetMail(to: string, link: string, minutes: number): Mail {
  const text = `Halo,

Ada permintaan untuk mengatur ulang kata sandi akun Financer dengan email ini.
Buka tautan berikut untuk membuat kata sandi baru (berlaku ${minutes} menit, sekali pakai):

${link}

Kalau kamu tidak meminta ini, abaikan saja email ini. Kata sandimu tidak berubah.

Financer`;
  const html = `<!doctype html><html lang="id"><body style="margin:0;background:#f5f6f2;font-family:Arial,Helvetica,sans-serif;color:#101b17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;padding:28px">
<tr><td style="font-size:20px;font-weight:700;color:#047857;padding-bottom:16px">Financer</td></tr>
<tr><td style="font-size:18px;font-weight:700;padding-bottom:8px">Atur ulang kata sandi</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:20px">Ada permintaan untuk mengatur ulang kata sandi akun Financer dengan email ini. Tekan tombol di bawah untuk membuat kata sandi baru. Tautan berlaku ${minutes} menit dan hanya bisa dipakai sekali.</td></tr>
<tr><td style="padding-bottom:20px"><a href="${esc(link)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:999px">Buat kata sandi baru</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#4b5a54;padding-bottom:12px">Kalau tombolnya ga bisa ditekan, salin tautan ini ke browser:<br><span style="word-break:break-all">${esc(link)}</span></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#4b5a54">Kalau kamu tidak meminta ini, abaikan saja email ini. Kata sandimu tidak berubah.</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject: "Atur ulang kata sandi Financer", html, text };
}
