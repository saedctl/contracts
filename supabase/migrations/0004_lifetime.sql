-- Lifetime memberships have no end date. Run in the Supabase SQL Editor after 0003.
-- Safe to run more than once.
alter table public.contracts alter column end_date drop not null;
