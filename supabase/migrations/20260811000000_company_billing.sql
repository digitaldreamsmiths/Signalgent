-- Plans + entitlements — Phase 4 of the govcon productization plan
-- (docs/specs/signalgent-govcon-v1.md).
--
-- IMPORTANT: absence of a row means UNLIMITED, not "trial". Every existing
-- tenant keeps sending exactly as it does today until someone deliberately
-- puts it on a plan; a default-to-trial would have silently throttled live
-- production sending the moment this migration landed.
--
-- The stripe_* columns are unused until the checkout/webhook chunk — this
-- table is the thing Stripe will write into, and it enforces limits on its own
-- in the meantime.

create table public.company_billing (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- Matches a key in lib/billing/plans.ts. Text (not an enum) so adding a plan
  -- is a code change, not a migration.
  plan_key text not null default 'trial',
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz,
  -- Filled by the Stripe chunk; harmless nulls until then.
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_billing enable row level security;

-- Read-only to users: plan changes come from Stripe webhooks (service role) or
-- an admin, never from the browser. No insert/update/delete policy on purpose.
create policy "Users read company_billing for their workspace companies"
  on public.company_billing for select
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = company_billing.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

comment on table public.company_billing is
  'Plan + subscription state per company. NO ROW = unlimited (grandfathered); see lib/billing/plans.ts.';
