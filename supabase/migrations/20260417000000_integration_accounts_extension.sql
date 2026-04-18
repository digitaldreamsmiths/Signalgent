-- Signalgent: Integration status + metadata extension
-- Adds columns needed for the Session 5 integration infrastructure.
-- Safe to run on top of the initial schema.

-- ============================================================
-- 1. Widen status enum on connected_accounts
--    Existing: 'active' | 'expired' | 'revoked'
--    New:      'connected' | 'expired' | 'revoked' | 'error' | 'disconnected'
--
-- Strategy: drop old CHECK, add new one. Migrate 'active' -> 'connected'
-- for consistency with the app's vocabulary.
-- ============================================================

alter table public.connected_accounts
  drop constraint if exists connected_accounts_status_check;

update public.connected_accounts
  set status = 'connected'
  where status = 'active';

alter table public.connected_accounts
  alter column status set default 'connected';

alter table public.connected_accounts
  add constraint connected_accounts_status_check
    check (status in ('connected', 'expired', 'revoked', 'error', 'disconnected'));

-- ============================================================
-- 2. New metadata columns
--    - provider_account_id: stable identifier from the provider
--      (e.g. Stripe acct_xxx, Gmail email). Distinct from
--      account_identifier which callers were using loosely.
--    - account_label: human-readable display name shown in UI
--    - scopes: granted scopes/capabilities as a typed array
--    - last_synced_at: when we last pulled data successfully
--    - last_error: short message when status = 'error'
-- ============================================================

alter table public.connected_accounts
  add column if not exists provider_account_id text,
  add column if not exists account_label text,
  add column if not exists scopes text[],
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_error text;

-- ============================================================
-- 3. Confirm uniqueness on (company_id, service)
--    Already present in the initial migration; this statement
--    is a no-op if the constraint exists, and documents the
--    invariant we depend on for OAuth callback idempotency.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'connected_accounts_company_id_service_key'
  ) then
    alter table public.connected_accounts
      add constraint connected_accounts_company_id_service_key
      unique (company_id, service);
  end if;
end $$;

-- ============================================================
-- 4. Trigger: bump updated_at on row change
-- ============================================================

create or replace function public.touch_connected_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists connected_accounts_touch_updated_at on public.connected_accounts;
create trigger connected_accounts_touch_updated_at
  before update on public.connected_accounts
  for each row execute function public.touch_connected_accounts_updated_at();
