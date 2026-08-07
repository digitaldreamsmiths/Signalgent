-- Campaigns — Phase 1 of the govcon productization plan
-- (docs/specs/signalgent-govcon-v1.md).
--
-- Until now every prospect lived in one global per-company pool: no way to run
-- two efforts at once, compare results, or give one list different sequencing.
-- A campaign is a named slice of the pool. Prospects join at ingest (or stay
-- campaign-less — the legacy pool keeps working unchanged), the workspace
-- filters by campaign, and the follow-up sweep resolves its config per
-- prospect: campaign override when set, company setting otherwise.

create table public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  -- Follow-up overrides. NULL = inherit the company-level outreach_settings
  -- value; non-null wins. followup_enabled=false pauses sequences for the
  -- whole campaign even when the company toggle is on.
  followup_enabled boolean,
  followup_wait_days integer check (followup_wait_days is null or followup_wait_days >= 1),
  followup_max_touches integer check (followup_max_touches is null or followup_max_touches >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outreach_campaigns enable row level security;

create policy "Users read outreach_campaigns for their workspace companies"
  on public.outreach_campaigns for select
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_campaigns.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users insert outreach_campaigns for their workspace companies"
  on public.outreach_campaigns for insert
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_campaigns.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users update outreach_campaigns for their workspace companies"
  on public.outreach_campaigns for update
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_campaigns.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users delete outreach_campaigns for their workspace companies"
  on public.outreach_campaigns for delete
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_campaigns.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

-- Membership lives on the prospect. ON DELETE SET NULL: deleting a campaign
-- returns its prospects to the campaign-less pool rather than deleting them.
alter table public.outreach_prospects
  add column campaign_id uuid references public.outreach_campaigns(id) on delete set null;

create index outreach_prospects_campaign_id_idx on public.outreach_prospects (campaign_id);
