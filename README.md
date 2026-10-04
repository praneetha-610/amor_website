# AMOR FATI — Limited Burger Drop

Pre-booking site for two limited burgers (30 each, every day) at Amor Fati Cafe, Tirupati.
Next.js 16 (App Router) · TypeScript · Supabase/PostgreSQL · no UI libraries.

## Run it now (Demo Mode — no setup)

```bash
npm install
npm run dev          # http://localhost:3000
npm run qa           # (second terminal) end-to-end booking + race-condition tests
```

Without Supabase credentials the site runs in **DEMO MODE**: a yellow banner shows on every page, data lives in
server memory (resets on restart) and is seeded with obviously fake "Demo Guest" bookings so the UI isn't empty
(`DEMO_SEED=false` starts empty). Admin: `/admin`, password `demo`.

## Go live

1. **Supabase**: create a project → SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql) once.
2. Copy `.env.example` → `.env.local` and fill in (the exact spot is documented in `lib/db/supabase.ts`):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only; never `NEXT_PUBLIC_`)
   - `ADMIN_PASSWORD` (long & random), `APP_SECRET` (`openssl rand -hex 32`), `NEXT_PUBLIC_SITE_URL`
3. **Deploy** (Vercel): import the repo, add the same env vars, deploy. Any Node host works (`npm run build && npm start`).
   In production the site **refuses to start on demo data** unless you set `DEMO_MODE=true`.
4. Point your domain, share the link on Instagram/WhatsApp, print the QR code.

## Edit everything in one file: [`config/site.ts`](config/site.ts)

Daily limit (30 → 40: change `DAILY_LIMIT`), prices, copy, ingredients & descriptions, max quantity per customer,
booking window, today's cutoff time, phone / WhatsApp / Instagram / address / map link, payment & consent text.
Search for `TODO` for placeholders to replace (prices, phone, address, ingredient text).

**Photography:** the burgers are built-in SVG illustrations. Drop real photos in `/public/burgers/` and set
`photo: "/burgers/cheese.webp"` on the burger in the config — it replaces the illustration everywhere.

## How inventory & overbooking protection work

- Remaining = `limit − Σ quantity of non-cancelled reservations`, computed **on the server** from the database.
  The browser only displays it (polled every 20s).
- Booking is a single Postgres function, `book_burger()`. It takes a **per-(burger, date) advisory lock**, recounts
  inventory, checks duplicates and inserts inside one transaction — two people clicking for the last burger are
  serialized; the second gets `SORRY — THAT LAST BURGER WAS JUST CLAIMED.`
- `completed` and `no_show` still count as claimed (the burger was made); only `cancelled` releases stock. Cancelled is final.
- Duplicates: unique index on (mobile, burger, date) for live reservations + an idempotency key per form
  submission, so refresh/double-tap never creates a second booking.
- Demo store gets the same guarantees from single-threaded synchronous check-and-insert.

## Security notes

- Table has RLS enabled with no policies, and RPCs are revoked from `anon` — only the server key can touch data.
- Public API returns inventory numbers only. Confirmation pages need a signed link token; "My reservation" needs
  reservation ID **and** mobile.
- Admin: password → HMAC-signed httpOnly, SameSite=Strict cookie (12h). All `/api/admin/*` re-check it.
- Server-side validation + sanitisation of every field; same-origin check; security headers; `/admin` is `noindex`.
- Rate limits are in-memory per instance (`lib/rate-limit.ts`). On serverless, swap in Upstash Redis for hard limits
  (database constraints already prevent overbooking/duplicates regardless).

## Structure

```
app/(site)/   landing, /super-cheese, /nashville, /reserve, /reserved/[id], /my-reservation
app/admin/    staff dashboard      app/api/   availability, reservations, lookup, admin/*
components/   UI (booking flow, meters, burger art)     config/site.ts   all editable content
lib/          dates (IST), validation, inventory, reservations, security, db/{supabase,demo}
supabase/schema.sql   styles/   scripts/qa-booking.mjs
```

## Assumptions to confirm

- Payment is at the cafe (no online payment) — edit `paymentNote`.
- Today's reservations close at 21:30 IST (`todayBookingCutoff`); booking window is 14 days.
- One live reservation per mobile per burger per date (can still book both burgers).
