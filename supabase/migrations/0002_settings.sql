-- App settings (e.g. the company signature applied to contracts).
-- Run in the Supabase SQL Editor after 0001_init.sql.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "settings: admin read" on public.app_settings;
create policy "settings: admin read" on public.app_settings
  for select to authenticated using (public.is_admin());
-- No write policies: only the server (service role) writes settings.

-- Allow signature images in the private contracts bucket alongside PDFs.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg']
where id = 'contracts';
