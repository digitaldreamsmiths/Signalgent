-- Campaign-scoped templates + imported prospect notes.
--
-- Why: a company's fallback templates were one flat rotation. PlateTell runs a
-- church campaign and is starting a school (PTA/PTO) campaign from the same
-- mailbox; with both sets active, enrichment would hand school copy to
-- churches and church copy to schools, and "Re-draft templates" would rewrite
-- church drafts with whichever set won the dice. A template may now belong to
-- one campaign. The picker uses a prospect's campaign templates when it has
-- any, else the campaign-less (shared) templates, else the built-in rotation.
--
-- NULL campaign_id = shared: every existing template keeps rotating for every
-- prospect exactly as before, until it is assigned.
--
-- ON DELETE SET NULL: deleting a campaign returns its templates to the shared
-- pool rather than deleting copy. Archive the campaign (which stops its
-- sequences) and deactivate the templates to retire them.

alter table public.outreach_templates
  add column campaign_id uuid references public.outreach_campaigns(id) on delete set null;

create index outreach_templates_campaign_idx
  on public.outreach_templates (company_id, campaign_id, active);

comment on column public.outreach_templates.campaign_id is
  'Campaign this template rotates for; null = shared with every campaign that has no templates of its own.';

-- Free-text carried in from a CSV import (role, qualification, anything the
-- list builder knew that the email alone does not say). Shown on the prospect
-- detail; never sent.
alter table public.outreach_prospects
  add column notes text;

comment on column public.outreach_prospects.notes is
  'Import notes (CSV role / fit columns). Shown in the workspace, never sent.';
