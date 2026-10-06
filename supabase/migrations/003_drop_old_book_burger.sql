-- Run AFTER the new code is deployed (see 002). Removes the old booking function,
-- which had no consent check, so nothing can bypass the consent rule via the database.
drop function if exists public.book_burger(text, text, date, text, text, int, int, int, text);
notify pgrst, 'reload schema';
