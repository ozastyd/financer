# Financial OS — web

Mobile-first personal finance app for Indonesian Gen-Z. Next.js 16 (App Router), TypeScript, Tailwind 4, Supabase (auth + Postgres with RLS), Zod, React Hook Form, Recharts, Lucide.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts: `npm run build`, `npm run lint`, `npm test` (Vitest), `npm run typecheck`.

## Configuration (`.env.local`, see `.env.example`)

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required. Auth (email magic link) and data. Without them the app shows a "Layanan belum dikonfigurasi" screen. |
| `SUPABASE_DB_URL` | Only for `npm run db:migrate` and `npm run db:check-rls`. |
| `ANTHROPIC_API_KEY` | AI Coach, read on the server only (`src/app/api/coach/route.ts`). Without a valid key the Coach answers with a deterministic summary of the user's own numbers and says so. |

Magic links redirect to `/auth/callback`; add `http://localhost:3000/auth/callback` (and your deployed URL) to the Supabase Auth redirect allow-list.

## Database

- Schema: `supabase/migrations/` (profiles, categories, transactions, goals, contributions; FKs, CHECK constraints, RLS so users only touch their own rows; a trigger keeps goal balances in sync).
- `npm run db:migrate` applies the migration files; `npm run db:check-rls` simulates two users inside a rolled-back transaction and checks isolation.
- Default categories are seeded per user on first sign-in via `seed_default_categories()`.

## Layout

- `src/app/` — routes: intro `/`, `/masuk`, `/onboarding`, and the signed-in shell `(app)/` with `beranda`, `transaksi`, `tujuan`, `tujuan/[id]`, `coach`, `profil`; write APIs under `api/`.
- `src/lib/` — money/date/goal/cash-flow helpers (unit tested), Zod schemas, data stores (`store/supabase.ts`, `store/local.ts`).
- `src/components/` — shell (bottom nav, "+" menu), sheets, charts, base UI.
