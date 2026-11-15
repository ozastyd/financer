# Financer — web

Mobile-first personal finance app for Indonesian Gen-Z. Next.js 16 (App Router), TypeScript, Tailwind 4, SQLite (Node's built-in `node:sqlite`), Zod, React Hook Form, Recharts, Lucide.

This build is self-hosted for a small group: one shared password, one data set, stored in a single SQLite file on the server.

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

## Sign-in

- No password exists on first start: `/masuk` asks the first visitor to create one (min. 8 characters). It is stored as a scrypt hash in the database (`app_settings`).
- After that, everyone signs in with that password. Sessions last 30 days (httpOnly signed cookie); 5 wrong tries lock the sign-in for 15 minutes per client.
- `src/proxy.ts` guards every page and API route except the sign-in endpoints.
- To start over (new password, empty data): stop the app, move the database file away, start it again.

## Database

- Schema and queries: `src/lib/db.ts`. Tables are created on first start; default categories are seeded once. A trigger keeps goal balances in sync with deposits and withdrawals.

## AI Coach

- `src/app/api/coach/route.ts` streams the answer as Server-Sent Events (status lines, text as it is written, sources at the end).
- The model gets a summary of totals (never individual transactions) plus the prompt in `src/lib/coach.ts`, and may call `web_search` for prices.
- Slow or stalled provider requests are hedged and retried; if the AI fails, a deterministic reply from the user's own numbers is returned.

## Layout

- `src/app/` — routes: `/masuk` (sign-in), `/onboarding`, and the signed-in shell `(app)/` with `beranda`, `transaksi`, `tujuan`, `tujuan/[id]`, `coach`, `profil`; read and write APIs under `api/`.
- `src/lib/` — money/date/goal/cash-flow helpers (unit tested), Zod schemas, database (`db.ts`), auth (`session.ts`, `password.ts`), web search (`search.ts`), client store (`store/local.ts`).
- `src/components/` — shell (bottom nav, "+" menu), sheets, charts, base UI.
