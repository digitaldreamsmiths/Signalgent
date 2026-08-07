-- Per-tenant offer profile — Phase 0 of the govcon productization plan
-- (docs/specs/signalgent-govcon-v1.md).
--
-- Until now the product being pitched was hardcoded across sender.ts, the
-- Stage 3 register in draft.ts, and template-library.ts, so the app could only
-- ever sell SourceGent. This table makes the pitch per-company. Code falls back
-- to the built-in SourceGent defaults when a company has no row (or before this
-- migration is applied — the loader treats a missing table as "no row"), so
-- existing behavior is unchanged until a profile is saved.

create table public.outreach_offer_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- What is being sold, as it appears in prose ("SourceGent").
  product text not null,
  -- Bare domain shown in signatures ("sourcegent.io").
  site text not null,
  -- Signature block pieces ("Best", "Eudon Delemar").
  sign_off text not null,
  signature_name text not null,
  -- Social proof, phrased for prose and deliberately approximate
  -- ("About twenty contractors", "over $4M in active pursuits").
  user_count text not null,
  pipeline text not null,
  -- Who the recipient is, for the drafting register ("a government contractor").
  audience text not null,
  -- One or two concrete sentences describing what the product does, in prose.
  -- Feeds the register's pitch rule and the built-in template rotation.
  pitch text not null,
  -- Concrete artifacts the pitch may name (the register requires at least one).
  artifacts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outreach_offer_profiles enable row level security;

create policy "Users read outreach_offer_profiles for their workspace companies"
  on public.outreach_offer_profiles for select
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_offer_profiles.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users insert outreach_offer_profiles for their workspace companies"
  on public.outreach_offer_profiles for insert
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_offer_profiles.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users update outreach_offer_profiles for their workspace companies"
  on public.outreach_offer_profiles for update
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_offer_profiles.company_id
        and workspace_members.user_id = auth.uid()
    )
  );
