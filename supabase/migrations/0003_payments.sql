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
