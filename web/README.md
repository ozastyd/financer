# Financer — web

Mobile-first personal finance app for Indonesian Gen-Z. Next.js 16 (App Router), TypeScript, Tailwind 4, SQLite (Node's built-in `node:sqlite`), Zod, React Hook Form, Recharts, Lucide.

Self-hosted: each person has their own account (email + password) and private data, stored in a single SQLite file on the server.

## Run

```bash
npm install
cp .env.example .env.local   # then fill in SESSION_SECRET (and the optional AI/search keys)
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm run lint`, `npm test` (Vitest), `npm run typecheck`. Needs Node 22.13+ (for `node:sqlite`).

## Configuration (`.env.local`, see `.env.example`)

| Variable | Used for |
| --- | --- |
| `SESSION_SECRET` | Required. Signs the login cookie (`openssl rand -hex 32`). Replacing it signs every device out. |
| `DATABASE_PATH` | SQLite file. Default `./data/financer.db`; keep it outside the repo in production. |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | AI Coach through any OpenAI-compatible chat-completions API, server-side only. Without them the Coach answers with a deterministic summary of the user's own numbers and says so. |
| `AI_REASONING_EFFORT` | Optional, default `low`. `none` omits the parameter for providers that reject it. |
| `EXA_API_KEY` | Optional. Lets the Coach search the web (Exa) for current prices; sources are listed under the answer. |
| `GROQ_API_KEY` | Optional. Receipt / bank-screenshot / statement-PDF scanning with Groq's vision model (`SCAN_MODEL`, default `qwen/qwen3.8-27b`). Without it the scan endpoint returns 503. |

## New-user flow and accounts

- Welcome slides (`/`) → onboarding as a guest (`/onboarding`, answers kept in localStorage, `src/lib/pending-signup.ts`) → create account (`/masuk`; `POST /api/signup` saves the account, onboarding answers and first goal in one transaction) → Beranda. Returning users sign in at `/masuk?mode=masuk`.
- Passwords are scrypt hashes (`src/lib/password.ts`). Sessions are signed httpOnly cookies carrying the user id, valid 30 days (`src/lib/session.ts`).
- `src/proxy.ts` lets through only the welcome page, onboarding, sign-up/sign-in and brand assets without a session; route handlers call `requireUser()` (`src/lib/server.ts`) and scope every query to that user.
- Limits: 5 failed sign-ins per account per address and 20 per address per 15 minutes; 10 sign-ups per address per hour.
- A splash screen with the logo covers the first load (`SplashScreen` in `src/components/brand.tsx`).

## Database

- Schema and queries: `src/lib/db.ts`. Every table has `user_id`; composite foreign keys stop a transaction using another user's category or a deposit into another user's goal. Tables are created on first start (`pragma user_version` = 2); each new account gets the default categories. A trigger keeps goal balances in sync with deposits and withdrawals.

## Scanning (receipts, bank screenshots, statement PDFs)

- "+" menu → *Ambil foto* (camera) or *Unggah gambar* (image or PDF) → `/scan`.
- `POST /api/scan` (`src/lib/scan.ts`): images are resized and read by the vision model into JSON; text PDFs (`unpdf`) are read in chunks; password-protected PDFs prompt for the password. Files are never stored. Rows matching an existing transaction (same date, type, amount) are flagged as possible duplicates.
- `/scan` is a focused task (tab bar hidden). The review is kept in sessionStorage so a reload restores it; leaving with edits asks first.
- Receipts: a confirm card (photo, store, date, category, total checked against the items) with one *Simpan*; *Ubah* opens the fields, *Pisah per kategori* splits by category. A receipt matching an existing transaction is flagged.
- Statements: compact rows grouped by day, filters (Semua / Perlu dicek / Keluar / Masuk), tap a row to edit amount, type, date, category and description, bulk category, sticky totals. E-wallet top-ups, ATM withdrawals and own transfers are detected and left unticked with a reason.
- `POST /api/transactions/batch` saves all rows in one transaction and returns their ids; `DELETE` with those ids is the undo offered after saving.
- Groq free tier is about 4 scans per minute and 1,000 per day per key; each user is capped at 30 scans per hour.

## AI Coach

- `src/app/api/coach/route.ts` streams the answer as Server-Sent Events (status lines, text as it is written, sources at the end).
- The model gets a summary of totals (never individual transactions) plus the prompt in `src/lib/coach.ts`, and may call `web_search` for prices.
- Slow or stalled provider requests are hedged and retried; if the AI fails, a deterministic reply from the user's own numbers is returned.

## Layout

- `src/app/` — routes: `/masuk` (sign-in), `/onboarding`, and the signed-in shell `(app)/` with `beranda`, `transaksi`, `tujuan`, `tujuan/[id]`, `coach`, `profil`; read and write APIs under `api/`.
- `src/lib/` — money/date/goal/cash-flow helpers (unit tested), Zod schemas, database (`db.ts`), auth (`session.ts`, `password.ts`), web search (`search.ts`), client store (`store/local.ts`).
- `src/components/` — shell (bottom nav, "+" menu), sheets, charts, base UI.
