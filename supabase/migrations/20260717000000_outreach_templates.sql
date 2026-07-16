-- User-managed fallback templates + A/B tracking.
--
-- Until now the generic email used for prospects that can't be personalized was a
-- single hardcoded string (lib/integrations/outreach/template.ts). This lets a
-- company author several templates, have enrichment pick one at random (weighted)
-- per fallback prospect, deactivate ones that underperform, and track each
-- template's reply/bounce/opt-out rate via the template_id stamped on its drafts.
--
-- Scope: fallback (non-personalized) prospects only. USASpending-personalized
-- drafts are unaffected and keep template_id null.

-- ============================================================
-- 1. outreach_templates  (company-scoped, same RLS shape as outreach_prospects)
-- ============================================================
create table public.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  -- relative odds in the random rotation among active templates (>=1)
  weight integer not null default 1 check (weight >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outreach_templates enable row level security;

create policy "Users read outreach_templates for their workspace companies"
  on public.outreach_templates for select
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_templates.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users insert outreach_templates for their workspace companies"
  on public.outreach_templates for insert
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_templates.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users update outreach_templates for their workspace companies"
  on public.outreach_templates for update
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_templates.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users delete outreach_templates for their workspace companies"
  on public.outreach_templates for delete
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_templates.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create trigger outreach_templates_touch_updated_at
  before update on public.outreach_templates
  for each row execute function public.touch_outreach_updated_at();

create index outreach_templates_company_active_idx
  on public.outreach_templates (company_id, active);

-- ============================================================
-- 2. Stamp each fallback draft with the template it used (null = personalized).
--    on delete set null: deleting a template keeps historical drafts, just
--    unlinks them from the (now-gone) template's stats.
-- ============================================================
alter table public.outreach_drafts
  add column template_id uuid references public.outreach_templates(id) on delete set null;

create index outreach_drafts_template_idx
  on public.outreach_drafts (template_id);
