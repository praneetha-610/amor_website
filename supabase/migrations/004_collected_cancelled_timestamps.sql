-- MIGRATION 004 — tracking when a reservation was collected / cancelled.
-- Already ran schema.sql earlier? Paste THIS in the Supabase SQL Editor and Run (safe to repeat).
-- (Or simply re-run the whole supabase/schema.sql — it includes this.)

alter table public.reservations add column if not exists collected_at timestamptz;
alter table public.reservations add column if not exists cancelled_at timestamptz;

notify pgrst, 'reload schema';
