-- The Engineers Club — Contract Dashboard schema.
-- Run in the Supabase SQL editor, or with `supabase db push`.
--
-- Security model:
--   * The Next.js server talks to the database with the service-role key and authorises every
--     request itself (role + ownership checks in src/lib).
--   * Row-level security is enabled on every table as defence in depth: with the public
--     anon key, a signed-in sales rep can only ever read their own contracts and nothing can
--     be written directly.
--   * Signed contracts, template versions and audit events are immutable (triggers below).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------
do $$ begin
  create type public.staff_role as enum ('admin', 'sales');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contract_status as enum ('draft', 'sent', 'viewed', 'signed', 'declined', 'expired');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------------------------
-- Staff profiles (one per Supabase Auth user that may use the dashboard)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null check (char_length(full_name) between 1 and 120),
  role public.staff_role not null default 'sales',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_active_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

-- ---------------------------------------------------------------------------------------------
-- Contract template versions (append-only)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  title text not null,
  body text not null,
  notes text,
  body_sha256 text not null,
  is_active boolean not null default false,
  is_sample boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index if not exists template_versions_one_active on public.template_versions (is_active) where is_active;

create or replace function public.template_versions_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Template versions are immutable and cannot be deleted';
  end if;
  if new.body is distinct from old.body or new.title is distinct from old.title
     or new.version is distinct from old.version or new.body_sha256 is distinct from old.body_sha256 then
    raise exception 'Template versions are immutable; create a new version instead';
  end if;
  return new;
end $$;
drop trigger if exists template_versions_guard on public.template_versions;
create trigger template_versions_guard before update or delete on public.template_versions
  for each row execute function public.template_versions_guard();

create or replace function public.create_template_version(
  p_title text, p_body text, p_notes text, p_created_by uuid, p_body_sha256 text
) returns public.template_versions
language plpgsql security definer set search_path = public as $$
declare
  result public.template_versions;
begin
  lock table public.template_versions in share row exclusive mode;
  insert into public.template_versions (version, title, body, notes, created_by, body_sha256)
  values ((select coalesce(max(version), 0) + 1 from public.template_versions), p_title, p_body, p_notes, p_created_by, p_body_sha256)
  returning * into result;
  return result;
end $$;

create or replace function public.activate_template_version(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.template_versions where id = p_id) then
    raise exception 'Template version not found';
  end if;
  update public.template_versions set is_active = false where is_active and id <> p_id;
  update public.template_versions set is_active = true where id = p_id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Contracts
-- ---------------------------------------------------------------------------------------------
create sequence if not exists public.contract_reference_seq;

create or replace function public.next_contract_reference() returns text
language sql security definer set search_path = public as $$
  select 'TEC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.contract_reference_seq')::text, 4, '0');
$$;

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  created_by uuid not null references public.profiles (id),
  status public.contract_status not null default 'draft',

  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,

  duration_months integer check (duration_months in (1, 3, 6, 12)),
  duration_label text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  amount_paid numeric(12, 2) not null check (amount_paid >= 0),
  currency text not null check (currency in ('GBP', 'USD')),
  payment_status text not null check (payment_status in ('paid_in_full', 'deposit_paid', 'payment_plan')),
  payment_schedule text,
  outstanding_balance numeric(12, 2) not null default 0 check (outstanding_balance >= 0),

  template_version_id uuid not null references public.template_versions (id),
  field_values jsonb not null,

  document_path text,
  document_sha256 text,
  signed_document_path text,
  signed_document_sha256 text,

  esign_provider text not null check (esign_provider in ('dropbox_sign', 'demo')),
  provider_request_id text unique,
  provider_signature_id text,
  provider_data jsonb,

  link_nonce text not null,
  link_expires_at timestamptz,

  sent_at timestamptz,
  viewed_at timestamptz,
  consent_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  confirmation_sent_at timestamptz,

  is_demo boolean not null default false,
  retention_until date,
  anonymised_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contracts_created_by_idx on public.contracts (created_by, created_at desc);
create index if not exists contracts_status_idx on public.contracts (status);
create index if not exists contracts_customer_email_idx on public.contracts (lower(customer_email));

-- Signed contracts are immutable. Only finalisation bookkeeping may change afterwards, and a
-- stored signed document can never be replaced. Retention erasure goes through
-- anonymise_contract(), which sets a transaction-local flag.
create or replace function public.contracts_guard() returns trigger
language plpgsql as $$
declare
  allowed text[] := array['updated_at', 'confirmation_sent_at', 'signed_document_path', 'signed_document_sha256', 'provider_data'];
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
drop trigger if exists contracts_guard on public.contracts;
create trigger contracts_guard before update or delete on public.contracts
  for each row execute function public.contracts_guard();

create or replace function public.anonymise_contract(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.retention_erasure', 'on', true);
  update public.contracts set
    customer_name = '[erased]', customer_email = 'erased@invalid', customer_phone = '[erased]',
    field_values = '{}'::jsonb, payment_schedule = null, provider_data = null,
    document_path = null, signed_document_path = null, anonymised_at = now()
  where id = p_id;
  perform set_config('app.retention_erasure', 'off', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Audit trail, email log, webhook idempotency (append-only)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts (id) on delete set null,
  actor_type text not null check (actor_type in ('staff', 'customer', 'provider', 'system')),
  actor_id uuid,
  actor_label text,
  event text not null,
  details jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_contract_idx on public.audit_events (contract_id, created_at desc);
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts (id) on delete set null,
  kind text not null,
  "to" text not null,
  subject text not null,
  provider_message_id text,
  simulated boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists email_log_contract_idx on public.email_log (contract_id, created_at desc);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  provider text not null,
  event_type text not null,
  payload jsonb,
  received_at timestamptz not null default now()
);

create or replace function public.append_only_guard() returns trigger
language plpgsql as $$
begin
  -- Deleting a draft contract nulls its audit references (FK on delete set null); allow only that.
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'contract_id') = (to_jsonb(old) - 'contract_id') and new.contract_id is null then
    return new;
  end if;
  raise exception '% is append-only', tg_table_name;
end $$;
drop trigger if exists audit_events_append_only on public.audit_events;
create trigger audit_events_append_only before update or delete on public.audit_events
  for each row execute function public.append_only_guard();
drop trigger if exists email_log_append_only on public.email_log;
create trigger email_log_append_only before update or delete on public.email_log
  for each row execute function public.append_only_guard();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.template_versions enable row level security;
alter table public.contracts enable row level security;
alter table public.audit_events enable row level security;
alter table public.email_log enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists "profiles: read self or admin" on public.profiles;
create policy "profiles: read self or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists "templates: staff read" on public.template_versions;
create policy "templates: staff read" on public.template_versions
  for select to authenticated using (public.is_active_staff());

drop policy if exists "contracts: owner or admin read" on public.contracts;
create policy "contracts: owner or admin read" on public.contracts
  for select to authenticated using (public.is_admin() or (created_by = auth.uid() and public.is_active_staff()));

drop policy if exists "audit: owner or admin read" on public.audit_events;
create policy "audit: owner or admin read" on public.audit_events
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.contracts c
      where c.id = audit_events.contract_id and c.created_by = auth.uid() and public.is_active_staff()
    )
  );

drop policy if exists "email log: owner or admin read" on public.email_log;
create policy "email log: owner or admin read" on public.email_log
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.contracts c
      where c.id = email_log.contract_id and c.created_by = auth.uid() and public.is_active_staff()
    )
  );
-- No insert/update/delete policies: all writes go through the server (service role).
-- webhook_events has no policies at all: invisible to anon/authenticated roles.

revoke all on function public.create_template_version(text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.activate_template_version(uuid) from public, anon, authenticated;
revoke all on function public.anonymise_contract(uuid) from public, anon, authenticated;
revoke all on function public.next_contract_reference() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Private storage for contract PDFs (no public access; served only via the app after auth)
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false;
-- No storage.objects policies are created for this bucket, so only the service role can
-- read or write it. Files are uploaded with upsert disabled and are never overwritten.
