# Amor Fati — the complete guide

1. [How the website works](#1-how-the-website-works)
2. [Go live: Supabase + Vercel, step by step](#2-go-live-supabase--vercel-step-by-step)
3. [The admin panel (staff manual)](#3-the-admin-panel-staff-manual)
4. [Day-to-day: what you change and where](#4-day-to-day-what-you-change-and-where)
5. [The script fonts](#5-the-script-fonts)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. How the website works

**What a customer sees**

```
Instagram link ─► Landing page ─► Burger page (or "Claim yours") ─► pick date ─► quantity
   ─► name + mobile ─► review (burger, date, qty, total) ─► tick "I understand…" ─► RESERVE
   ─► POP-UP "YOU GOT ONE." with the big reservation ID (AF-XXXXXX)
   ─► customer SCREENSHOTS it ─► visits the cafe on that date and shows the ID / screenshot
   ─► staff type the ID in /admin ─► tap ✓ MARK COLLECTED ─► the ID is struck through and logged with the time
```

- **The customer never types an ID to book.** The ID is *created by the system* and shown to them in the pop-up
  (and on a permanent ticket page).
- **Lost the ticket?** *My reservation* asks only for **name + mobile number** and lists their bookings with the IDs.
  A wrong name and an unknown number give the same generic answer, and repeated guessing is rate-limited.

- Dates offered: **today + the next 2 days** (India time). At 12:00 AM IST the window moves forward by itself.
  Today's card turns to "CLOSED" after 10:00 PM (30 minutes before the 10:30 PM close).
- **30 per burger per day.** The "X LEFT" number and progress bar are calculated by the server from the
  database every time: `30 − burgers already reserved for that burger and date`. The browser never decides it.
  Pages re-check every 10 seconds, when the phone wakes, and straight after a booking — so the count drops immediately.
- At 0 left the date shows **SOLD OUT** and can't be selected.
- **Two people tapping Reserve for the last burger at the same instant:** the database processes them one after
  the other (a lock per burger+date). One gets it; the other sees "SORRY — THAT LAST BURGER WAS JUST CLAIMED."
- Double-tapping or refreshing never makes a second booking. The same mobile can't book the same burger twice on one date.
- **The consent tick is mandatory** — the button stays disabled without it, the server refuses a booking without it,
  and the database refuses it too. The time of consent is saved with the booking.
- Customers **cannot cancel**. Only a signed-in admin can.
- Nothing is charged online. The page says so; payment happens at the cafe.

**Where things live**

| What | Where |
|---|---|
| All text, prices, hours, phone, Instagram, daily limit, ingredients | `config/site.ts` (one file) |
| The reservations (names, mobiles, IDs…) | Your **Supabase** database, table `reservations` |
| Admin password & database keys | **Vercel → Settings → Environment Variables** (never in the code) |

---

## 2. Go live: Supabase + Vercel, step by step

> **Why this matters:** without a database the site has nowhere to store bookings. Right now your live site has no
> database connected, so counts can't go down and `/admin` is disabled. These 4 steps fix that. ~15 minutes, free tier is enough.

### Step 1 — Create the database (Supabase)
1. Go to **supabase.com → Start your project** → sign in with GitHub.
2. **New project** → name it `amor-fati`, choose a strong database password (save it), region **South Asia (Mumbai)**.
   Wait ~2 minutes while it sets up.
3. Left menu → **SQL Editor** → **New query**.
4. Open the file **`supabase/schema.sql`** from this project, copy *everything*, paste it in, press **Run**.
   You should see "Success. No rows returned". This creates the `reservations` table and the booking rules.

   > **Already ran an earlier version of `schema.sql`?** Just paste and Run the *updated* `supabase/schema.sql` again.
   > It is safe to repeat: it only adds what's missing (the `collected_at` / `cancelled_at` tracking columns) and never touches your bookings.
   > (The site also keeps working if you forget — it just won't record collection times until you do.)
5. Check it worked: left menu → **Table Editor** → you should see `reservations` (empty).

### Step 2 — Copy the two keys
Supabase → **Project Settings (gear) → API**:
- **Project URL** → this is `SUPABASE_URL`
- **service_role** key (click *Reveal*) → this is `SUPABASE_SERVICE_ROLE_KEY`

⚠️ The `service_role` key is a master key. Never post it publicly, never put it in the code or in Instagram/WhatsApp.
(The site only uses it on the server.)

### Step 3 — Add the settings in Vercel
Vercel → your project → **Settings → Environment Variables**. Add these (tick **Production**, Preview and Development):

| Name | Value |
|---|---|
| `SUPABASE_URL` | the Project URL from step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 2 |
| `ADMIN_PASSWORD` | the staff password (see "Login details" in the chat message / choose your own, 20+ characters) |
| `APP_SECRET` | a long random string (`openssl rand -hex 32`, or the one provided) |
| `NEXT_PUBLIC_SITE_URL` | `https://amor-website-nine.vercel.app` (or your own domain) |

### Step 4 — Redeploy
Vercel → **Deployments** → the latest one → **⋯ → Redeploy** (environment variables only apply to new deployments).

### Check it works (2 minutes)
1. Open the site — the yellow/red banner at the top is gone.
2. Make a test booking with your own number. Confirm the count drops (e.g. 30 → 29).
3. Open `/admin`, sign in, find your booking by name — then **Cancel** it. The count goes back up.
4. In Supabase → Table Editor → `reservations` you'll see the row (and `consent_accepted_at`).

### Optional
- **Your own domain:** Vercel → Settings → Domains.
- **Backups:** Supabase → Database → Backups (daily on paid plans). You can always export the table to CSV from the Table Editor, or use **⇩ CSV** in the admin panel.
- **Not using Supabase?** Any Postgres works, but the code talks to Supabase's API. The data layer is isolated in `lib/db/` if you ever want to swap it.

---

## 3. The admin panel (staff manual)

**Address:** `https://<your-site>/admin` — works great on a phone. Bookmark it / add to home screen.

**Sign in:** the password you set as `ADMIN_PASSWORD`. Session lasts 12 hours. **SIGN OUT** when leaving a shared phone.
Wrong password 6 times → locked for 15 minutes.

**The screen, top to bottom**
1. **TODAY** — for each burger: sold / 30, a progress bar, how many left, how many already collected.
2. **Search box** (stays pinned as you scroll) — type a **name**, **mobile number (even just the last 4–5 digits)** or **AF-ID**.
3. **Chips** (swipe sideways): TODAY · TOMORROW · NEXT 3 DAYS · THIS WEEK · CUSTOM; and ALL / SUPER CHEESE / NASHVILLE. Plus a status filter.
4. **Totals** for the chosen dates: bookings, burgers, to-collect, collected, cancelled.
5. Three tabs:
   - **ALL BOOKINGS** — one card per reservation: big **reservation ID** (tap to copy), **name**, **mobile** (tap to call, or WhatsApp),
     burger × quantity, total ₹, date, when it was booked (IST), and whether they accepted the no-show policy.
   - **WHO BOOKED WHAT** — the kitchen/counter list: per burger, per date, everyone who booked, with ID, name, quantity, mobile.
   - **DAILY SALES** — per date: sold / 30 and how many left, per burger.
   - **⇩ CSV** — downloads the current list (opens in Excel / Google Sheets).

**At the counter — the 10-second routine**
1. Customer shows their **ID or the screenshot** (or tells you their name / mobile).
2. Type it in the search box — the 6 characters after "AF-", the name, or the last 5 digits of the mobile.
   While you search, the screen shows only the answer, and it searches **all dates**.
3. Read the coloured banner on the card:
   - 🟢 **VALID TODAY — hand over 2 × NASHVILLE** → tap **✓ MARK COLLECTED**. The ID is struck through and the time is recorded.
   - ⚪ **ALREADY COLLECTED at 2:41 PM — don't serve again** → someone already used this ID (or a copy of the screenshot).
   - 🟡 **NOT FOR TODAY — booked for OCT 9** → don't serve (the button says COLLECT ANYWAY and asks you to confirm).
   - 🔴 **CANCELLED** → don't serve.
4. Clear the search (✕) to go back to the day view.

**COLLECTED LOG tab** — the running record of who showed which ID: time collected, struck-through ID, name, burger × quantity,
plus how many burgers were handed over in total. Use **⇩ CSV** to keep a copy.

**Buttons on each booking**
- **✓ COLLECTED** — they picked it up.
- **NO SHOW** — they never came (the burger was made, so it still counts against the 30). **UNDO** reverses a mis-tap.
- **CANCEL** *(admin only)* — asks "Cancel this reservation?" with the details. **YES, CANCEL** puts the burgers straight back
  in stock so someone else can book them. It cannot be undone. **KEEP IT** closes the box without changes.

Customers have no cancel button anywhere; the cancel action only works while signed in as admin.

**Changing the password:** Vercel → Environment Variables → edit `ADMIN_PASSWORD` → Redeploy. (Everyone is signed out.)

---

## 4. Day-to-day: what you change and where

Open `config/site.ts`:
- Prices: `price` under each burger (currently Super Cheese ₹329, Nashville ₹299).
- Daily limit: `DAILY_LIMIT` (30 → 40 changes everything).
- Hours: `location.hours` (shown everywhere) and `todayBookingCutoff`.
- Phone, Instagram, address, Maps link, ingredient descriptions, headline copy.
- Teaser marquee text at the bottom: `teaserMessage`.

After editing: commit + push to GitHub → Vercel redeploys automatically (~1 minute).

---

## 5. The script fonts

See `public/fonts/README.md`. Until you add the licensed files the burger titles use free look-alike scripts
(Yellowtail / Lobster). Add the files with the exact names and they switch automatically.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Red banner "SETUP NEEDED" | Supabase keys missing in Vercel (step 3) or you haven't redeployed (step 4). |
| `/admin` says "Admin is disabled" | `ADMIN_PASSWORD` isn't set in Vercel. |
| Collected / cancelled times show nothing | Re-run the updated `supabase/schema.sql` (adds the tracking columns). |
| Booking says "Something went wrong" | The SQL in step 1 wasn't run, or the keys are wrong/typo'd. Check Vercel → Deployments → Functions logs. |
| Counts don't go down | Same as above — the site isn't connected to the database. |
| "Incorrect password" | Passwords are case-sensitive; Vercel needs a redeploy after changing it. |
| Vercel deploy fails | Open the deployment → Build Logs → copy the red error. |
