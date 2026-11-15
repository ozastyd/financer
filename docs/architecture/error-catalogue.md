# Financial OS — Error Catalogue

Status: for review · Date: 15 Nov 2026 · Designs: page "Error & notifikasi" on the Financial OS design canvas

Every way the app can fail or interrupt the user, what they see, and how they recover. Copy is final draft in Bahasa Indonesia; codes (A1, B2…) are used in code comments and tests.

## 1. Principles

1. **Say what happened and what to do next**, in casual Indonesian. Never blame the user.
2. **Never lose what the user typed.** A failed save keeps the form open with its input.
3. **Never report a failure that didn't happen.** If a save succeeded but the refresh after it failed, say it was saved.
4. **Never show raw codes or English system text.** The crash page alone shows a short reference code for support.
5. **Match the surface to the scope:** a field problem stays at the field, an action result is a toast, a lost connection is a banner, and only a screen that cannot work at all gets a full-screen state.
6. **Errors are not empty states.** "No transactions yet" is guidance, not an error, and keeps its friendly empty card.

## 2. Surfaces

| Surface | Use for | Behaviour | Accessibility |
|---|---|---|---|
| **Full-screen state** | The screen cannot work at all (A1, A2, A4–A6) | Icon, title, one-line reason, one primary action, one secondary link | Title is the page `h1`; focus moves to it |
| **Banner** | Ongoing conditions (offline, service degraded, stale data) | Thin strip under the status bar, stays until resolved; no dismiss for offline | `role="status"`, announced once |
| **Toast** | Result of an action (saved, deleted, failed to save) | Bottom, above the nav; one at a time, queued. Success/info hide after 4 s; errors stay until dismissed or retried | Success/info `role="status"`; error `role="alert"`; never steals focus; actions are real buttons |
| **Inline field error** | One field is wrong | Red text under the field, field border red | `aria-describedby` + `aria-invalid` |
| **Inline card** | One section failed to load | Card in place of the section with "Coba lagi" | Retry is a button |
| **Sheet** | The user must decide before continuing (session expired, plan limit) | Bottom sheet over the current screen; content underneath is kept | Focus trapped in the sheet; Escape closes where safe |

## 3. The catalogue

Legend for **Today**: ✅ handled well · 🟡 partly handled · ❌ not handled.

### A. App and connection

| Code | Situation | How it's detected | Surface | Copy | Action | Today |
|---|---|---|---|---|---|---|
| A1 | Supabase keys missing in this deployment | `isConfigured` false at build time | Full-screen | **Layanan belum dikonfigurasi** · Financial OS belum tersambung ke database, jadi belum bisa dipakai. Ini masalah pengaturan, bukan kesalahanmu. | — (admin note shown) | ✅ |
| A2 | Supabase unreachable or answering 5xx on first load | Session/profile load throws a network or 5xx error | Full-screen | **Layanan sedang gangguan** · Kami tidak bisa menghubungi server sekarang. Datamu aman dan tidak hilang. | Coba lagi · Cek status koneksi | 🟡 generic "Data belum bisa dimuat" |
| A2b | Same, after the app has loaded | A query fails with network/5xx while cached data exists | Banner (amber) | Sebagian data belum bisa dimuat. Yang tampil mungkin belum terbaru. | Coba lagi | ❌ |
| A3 | Device goes offline | `navigator.onLine` false / `offline` event | Banner (neutral, persistent); save buttons disabled with hint | Kamu sedang offline. Perubahan belum bisa disimpan. | Auto-retries on reconnect; toast "Kembali online" | ❌ |
| A4 | Unexpected crash while rendering a screen | Route `error.tsx` boundary | Full-screen inside the app shell (nav stays) | **Ada yang tidak beres** · Halaman ini gagal dimuat. Coba muat ulang; kalau masih gagal, kembali ke Beranda. · Kode: `ERR-xxxx` | Muat ulang · Ke Beranda | ❌ Next default (English) |
| A5 | Crash in the root layout | `global-error.tsx` | Minimal full page (own styles, no app shell) | **Financial OS gagal dibuka** · Muat ulang halaman ini. | Muat ulang | ❌ |
| A6 | Unknown URL | `not-found.tsx` | Full-screen | **Halaman tidak ditemukan** · Mungkin tautannya salah atau halamannya sudah dipindah. | Ke Beranda | ❌ Next default (English) |
| A7 | Slow network: a load takes over 8 s | Query pending timer | Hint under the loading state | Masih memuat… koneksimu sepertinya lambat. | Coba lagi (after 15 s) | ❌ |

### B. Account and session

| Code | Situation | How it's detected | Surface | Copy | Action | Today |
|---|---|---|---|---|---|---|
| B1 | Session expired while using the app | Any API or Supabase call returns 401 / JWT expired | Sheet over the current screen; the unsaved form underneath is kept | **Sesi kamu berakhir** · Demi keamanan, kamu perlu masuk lagi. Isian yang belum disimpan tetap ada di layar ini. | Kirim tautan masuk (pre-filled email) · Nanti | 🟡 plain inline text |
| B2 | Magic link expired or already used | Callback fails → `/masuk?error=link` | Inline card on sign-in | **Tautan masuk sudah tidak berlaku** · Tautan hanya bisa dipakai sekali dan berlaku sebentar. Minta tautan baru. | Kirim tautan baru | 🟡 message only |
| B3 | Too many sign-in emails requested | Supabase rate-limit error on `signInWithOtp` | Inline field error with countdown | Terlalu sering meminta tautan. Coba lagi dalam 0:45. | Button re-enables after countdown | 🟡 no countdown |
| B4 | Email not arriving | User waits after "sent" | Help text on the sent screen after 30 s | Belum masuk? Cek folder Spam atau Promosi, atau kirim ulang. | Kirim ulang | ❌ |
| B5 | Invalid email typed | Zod validation | Inline field error | Format email belum benar. | Fix field | ✅ |
| B6 | Signed in, onboarding unfinished | Shell guard | Redirect to onboarding at the saved step | — | — | ✅ |

### C. Saving data

| Code | Situation | How it's detected | Surface | Copy | Action | Today |
|---|---|---|---|---|---|---|
| C1 | A field is invalid (amount, date, name, target) | Client Zod / form rules | Inline field error | e.g. Masukkan jumlahnya dulu. · Tanggal tidak valid. · Nama wajib diisi. | Fix field | ✅ |
| C2 | Server rejected the data (400, check constraint) | API 400 | Error toast; sheet stays open | Data belum bisa disimpan: {alasan dari server}. | Ubah lalu simpan | 🟡 inline text |
| C3 | Category or goal no longer exists (deleted on another device) | API 400 (23503) / 404 | Error toast + data refresh; goal page shows its "not found" state | Kategori atau tujuan ini sudah tidak ada. Datanya kami muat ulang. | — | 🟡 |
| C4 | Withdrawal larger than the goal balance | Rule check (client + server) | Inline field error | Jumlah melebihi saldo tujuan. | Ubah jumlah | ✅ |
| C4b | Deposit to a paused goal | Rule check | Inline note in the sheet with an action | Tujuan ini sedang dijeda. Lanjutkan dulu untuk setor. | Lanjutkan tujuan | 🟡 no action button |
| C4c | Deposit to a completed goal / pause a completed goal | Rule check | Inline note | Tujuan ini sudah tercapai. 🎉 | — | ✅ |
| C5 | Save failed (500 or network drop mid-request) | API 5xx / fetch throws | Error toast with retry; sheet stays open with input | Gagal menyimpan. Periksa koneksimu lalu coba lagi. | Coba lagi | 🟡 inline text |
| C5b | Save succeeded but the refresh after it failed | Write OK, `invalidateQueries`/`refresh` throws | Success toast, then banner A2b | Tersimpan. (banner: Sebagian data belum bisa dimuat…) | Coba lagi on banner | ❌ shows a false "gagal" |
| C6 | Delete failed | API error | Error toast | Gagal menghapus. Coba lagi. | Coba lagi | 🟡 inline / "Gagal." |
| C7 | Double tap on Save | Pending state | Button disabled with spinner | Menyimpan… | — | ✅ |
| C8 | Free-plan limit reached (1 active goal; later chats, challenges) | Server limit check (phase 2) | Sheet, friendly tone, not red | **Paket Gratis: 1 tujuan aktif** · Selesaikan atau jeda tujuan yang ada, atau coba Pro untuk tujuan tanpa batas. | Lihat Pro · Jeda tujuan lain | ❌ |
| C9 | Onboarding saved, but the suggested first goal failed to create | Second request fails | Info toast; onboarding still completes | Profilmu tersimpan. Tujuan pertama belum terbuat, kamu bisa bikin dari menu Tujuan. | Bikin tujuan | 🟡 inline |

### D. Loading data

| Code | Situation | How it's detected | Surface | Copy | Action | Today |
|---|---|---|---|---|---|---|
| D1 | Beranda totals failed | `useDashboard` error | Inline card in the cash-flow section | Gagal memuat ringkasan. Periksa koneksimu, lalu coba lagi. | Coba lagi | ✅ |
| D2 | Transaction list failed | `useTransactionPages` / `useMonthTotals` error | Inline card | Gagal memuat transaksi. Periksa koneksimu, lalu coba lagi. | Coba lagi | ✅ |
| D3 | "Load more" page failed | `fetchNextPage` error | Inline under the list, keeps loaded rows | Gagal memuat lanjutan. | Coba lagi | ❌ |
| D4 | Goal history failed | `useGoalContributions` error | Inline card in the history sheet | Gagal memuat riwayat. | Coba lagi | 🟡 no button |
| D5 | Goal not found (wrong link or deleted) | Goal missing from session data | Full-screen inside the shell | **Tujuan tidak ditemukan** · Mungkin sudah dihapus. | Kembali ke Tujuan | ✅ |
| D6 | Empty data (not an error) | Zero rows | Existing empty cards | — | Catat pertama | ✅ |

### E. AI Coach

| Code | Situation | How it's detected | Surface | Copy | Action | Today |
|---|---|---|---|---|---|---|
| E1 | AI not configured, provider down or busy | Route returns `source: "fallback"` | Normal reply bubble tagged "Jawaban otomatis" with the reason | (existing notices) | — | ✅ |
| E2 | Hourly/daily limit reached (429) | API 429 | System bubble with reset time | Kamu sudah bertanya 5 kali hari ini. Kuota balik besok jam 00.00, atau coba Pro untuk lebih banyak. | Lihat Pro | 🟡 no timing |
| E3 | Message too long | Client length check | Counter under input, red past 2000 | 2.140 / 2.000 karakter | Persingkat | 🟡 |
| E4 | Could not read the user's data (502) | API 502 | Inline error under the input; question kept | Gagal membaca datamu. Coba lagi. | Coba lagi | ✅ |
| E5 | Offline while asking | fetch throws | Automatic answer from cached totals, tagged | Tidak ada koneksi, jadi ini jawaban otomatis dari angkamu. | — | ✅ |

### F. Positive and neutral notifications

| Code | Situation | Surface | Copy | Action |
|---|---|---|---|---|
| F1 | Transaction saved | Success toast | Transaksi tersimpan. | — |
| F2 | Transaction deleted | Success toast with undo (8 s) | Transaksi dihapus. | Urungkan |
| F3 | Deposit / withdrawal recorded | Success toast | Setoran Rp200.000 tercatat. | — |
| F4 | Goal completed | Celebration toast (existing goal-page celebration stays) | Tujuan tercapai! 🎉 | Lihat |
| F5 | Back online | Info toast | Kembali online. | — |
| F6 | Sign-in link sent | Inline success state (existing) | Tautan masuk sudah dikirim ke {email}. | Kirim ulang |

## 4. Mapping server responses to surfaces

| Server says | Shown as |
|---|---|
| 400 with a field-level reason (Zod) | Inline field error when the field is on screen, else error toast |
| 400 business rule (`lib/rules.ts`) | Inline note in the sheet (C4, C4b, C4c) |
| 401 | Session-expired sheet (B1) |
| 404 / 23503 | Error toast + refresh (C3), or the screen's not-found state (D5) |
| 429 | Limit message for that feature (B3, E2) |
| 502 / 503 / 5xx / network | Error toast with retry for writes (C5); inline card or banner for reads (D1–D4, A2b) |

The API keeps returning `{ error: string }`; phase 2 adds a stable `code` field (e.g. `SESSION_EXPIRED`, `PLAN_LIMIT`) so the client chooses the surface by code, not by HTTP status alone.

## 5. Implementation notes (next round, after design approval)

- `ToastProvider` + `useToast()` inside `AppProvider`; one live region at the app root.
- `useOnline()` hook driving the offline banner and disabling save buttons.
- `app/error.tsx`, `app/(app)/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` in Bahasa Indonesia.
- `mutate()` in `app-provider.tsx`: separate the write result from the refresh result (fixes C5b).
- A shared `classifyError()` that turns any thrown error or response into one of the codes above.
- Add a soft red token (`--reds`) for error toasts in both themes.
