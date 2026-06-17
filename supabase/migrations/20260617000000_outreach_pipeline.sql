-- Signalgent: Outreach pipeline (Stage 1 govcon cold-outreach intelligence).
--
-- Two tables, both company-scoped with the same RLS shape as connected_accounts
-- (companies -> workspace_members -> auth.uid()):
--   outreach_prospects : one ingested target (email), its resolved USASpending
--                        identity + enrichment, and lifecycle status.
--   outreach_drafts    : the Stage 3 draft for a prospect, plus the facts
--                        contract and the review-queue status.
--
-- Send path is OUT OF SCOPE (routes through a dedicated cold-email platform);
-- there is no send status here on purpose.

-- ============================================================
-- 1. outreach_prospects
-- ============================================================
create table public.outreach_prospects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  domain text,
  -- lifecycle: new -> (enriched | skipped | drafted | error)
  status text not null default 'new'
    check (status in ('new', 'enriched', 'skipped', 'drafted', 'error')),
  -- when skipped, which stage and why (enrich | synthesis | draft)
  skip_stage text check (skip_stage in ('enrich', 'synthesis', 'draft')),
  skip_reason text,
  -- resolved USASpending identity (null until enriched)
  recipient_name text,
  recipient_id text,
  uei text,
  resolution_confidence numeric(4, 3),
  resolution_method text check (resolution_method in ('heuristic', 'ai_judge')),
  business_types text[] default '{}',
  location text,
  -- the aggregated ContractorProfile (award footprint)
  footprint jsonb,
  enriched_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, email)
);

alter table public.outreach_prospects enable row level security;

create policy "Users read outreach_prospects for their workspace companies"
  on public.outreach_prospects for select
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_prospects.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users insert outreach_prospects for their workspace companies"
  on public.outreach_prospects for insert
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_prospects.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users update outreach_prospects for their workspace companies"
  on public.outreach_prospects for update
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_prospects.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users delete outreach_prospects for their workspace companies"
  on public.outreach_prospects for delete
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_prospects.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. outreach_drafts
-- ============================================================
create table public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  -- denormalized for RLS + direct company-scoped queries
  company_id uuid not null references public.companies(id) on delete cascade,
  subject text not null,
  body text not null,
  angle text,
  synthesis_confidence numeric(4, 3),
  facts_for_draft jsonb not null default '[]',
  facts_used jsonb not null default '[]',
  drifted_facts jsonb not null default '[]',
  -- false when the drift check found a hallucinated fact (review carefully)
  clean boolean not null default true,
  -- review queue: pending -> (approved | edited | rejected)
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'edited', 'rejected')),
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- one current draft per prospect (regeneration overwrites)
  unique (prospect_id)
);

alter table public.outreach_drafts enable row level security;

create policy "Users read outreach_drafts for their workspace companies"
  on public.outreach_drafts for select
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_drafts.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users insert outreach_drafts for their workspace companies"
  on public.outreach_drafts for insert
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_drafts.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users update outreach_drafts for their workspace companies"
  on public.outreach_drafts for update
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_drafts.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users delete outreach_drafts for their workspace companies"
  on public.outreach_drafts for delete
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_drafts.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. updated_at touch triggers (reuse pattern from connected_accounts)
-- ============================================================
create or replace function public.touch_outreach_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger outreach_prospects_touch_updated_at
  before update on public.outreach_prospects
  for each row execute function public.touch_outreach_updated_at();

create trigger outreach_drafts_touch_updated_at
  before update on public.outreach_drafts
  for each row execute function public.touch_outreach_updated_at();

-- ============================================================
-- 4. Helpful indexes for the review-queue reads
-- ============================================================
create index outreach_prospects_company_status_idx
  on public.outreach_prospects (company_id, status);
create index outreach_drafts_company_status_idx
  on public.outreach_drafts (company_id, status);
