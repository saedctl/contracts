-- The Engineers Club — database updates 0002 + 0003 in one file.
-- Paste into the Supabase SQL Editor and click Run. Safe to run more than once.
-- (0001_init.sql must already have been run.) Generated from supabase/migrations/.

-- App settings (company signature) and per-tier contract templates.
-- Run in the Supabase SQL Editor after 0001_init.sql. Safe to run more than once.

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

-- ---------------------------------------------------------------------------------------------
-- Per-tier contract templates: one active template per membership tier, plus an optional
-- "all tiers" template (tier is null) used for any tier without its own.
-- ---------------------------------------------------------------------------------------------
alter table public.template_versions add column if not exists tier text;
do $$ begin
  alter table public.template_versions add constraint template_versions_tier_check check (tier in ('premium', 'vip'));
exception when duplicate_object then null; end $$;

drop index if exists public.template_versions_one_active;
create unique index if not exists template_versions_one_active_per_tier
  on public.template_versions ((coalesce(tier, '*'))) where is_active;

create or replace function public.template_versions_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Template versions are immutable and cannot be deleted';
  end if;
  if new.body is distinct from old.body or new.title is distinct from old.title
     or new.version is distinct from old.version or new.body_sha256 is distinct from old.body_sha256
     or new.tier is distinct from old.tier then
    raise exception 'Template versions are immutable; create a new version instead';
  end if;
  return new;
end $$;

drop function if exists public.create_template_version(text, text, text, uuid, text);
create or replace function public.create_template_version(
  p_title text, p_body text, p_notes text, p_created_by uuid, p_body_sha256 text, p_tier text default null
) returns public.template_versions
language plpgsql security definer set search_path = public as $$
declare
  result public.template_versions;
begin
  lock table public.template_versions in share row exclusive mode;
  insert into public.template_versions (version, title, body, notes, created_by, body_sha256, tier)
  values ((select coalesce(max(version), 0) + 1 from public.template_versions), p_title, p_body, p_notes, p_created_by, p_body_sha256, p_tier)
  returning * into result;
  return result;
end $$;

create or replace function public.activate_template_version(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t_tier text;
begin
  select coalesce(tier, '*') into t_tier from public.template_versions where id = p_id;
  if not found then
    raise exception 'Template version not found';
  end if;
  update public.template_versions set is_active = false
    where is_active and id <> p_id and coalesce(tier, '*') = t_tier;
  update public.template_versions set is_active = true where id = p_id;
end $$;

revoke all on function public.create_template_version(text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.activate_template_version(uuid) from public, anon, authenticated;

-- Payments tracking and admin deletion. Run in the Supabase SQL Editor after 0002.
-- Safe to run more than once.

-- Balance due date, and when the outstanding balance was collected (payment bookkeeping,
-- not contract terms, so it may be recorded after signing).
alter table public.contracts add column if not exists balance_due_date date;
alter table public.contracts add column if not exists balance_collected_at timestamptz;
alter table public.contracts add column if not exists balance_collected_by uuid references public.profiles (id);
-- Payment plan: [{ id, amount, dueDate, collectedAt, collectedBy }]. Amounts and due dates are
-- fixed at generation; only the collected fields are updated afterwards (enforced by the app).
alter table public.contracts add column if not exists instalments jsonb not null default '[]'::jsonb;
create index if not exists contracts_balance_due_idx on public.contracts (balance_due_date) where balance_collected_at is null;

-- Signed contracts stay immutable apart from finalisation and payment bookkeeping.
create or replace function public.contracts_guard() returns trigger
language plpgsql as $$
declare
  allowed text[] := array['updated_at', 'confirmation_sent_at', 'signed_document_path', 'signed_document_sha256', 'provider_data',
                          'balance_collected_at', 'balance_collected_by', 'instalments'];
begin
  if coalesce(current_setting('app.retention_erasure', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft contracts can be deleted';
    end if;
    return old;
  end if;
  new.updated_at := now();
  if old.status = 'signed' then
    if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
      raise exception 'Signed contracts are immutable';
    end if;
    if old.signed_document_path is not null and new.signed_document_path is distinct from old.signed_document_path then
      raise exception 'Signed contracts are immutable';
    end if;
  end if;
  return new;
end $$;

-- Administrator deletion of any contract. The application checks the caller is an admin
-- and records the deletion in the audit log before calling this.
create or replace function public.admin_delete_contract(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.retention_erasure', 'on', true);
  delete from public.contracts where id = p_id;
  perform set_config('app.retention_erasure', 'off', true);
end $$;
revoke all on function public.admin_delete_contract(uuid) from public, anon, authenticated;
