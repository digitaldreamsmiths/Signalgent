-- Contact-name enrichment — Phase 0 of the govcon productization plan
-- (docs/specs/signalgent-govcon-v1.md).
--
-- The pipeline only ever knew email → domain → company, never a person, so
-- every email opened with a bare "Hi,". The baseline fix is a pure localpart
-- parse (bob.smith@ → "Bob Smith", lib/integrations/outreach/contact-name.ts)
-- that needs no storage; this column holds the MANUAL override, which always
-- beats the parse. Code treats a missing column as "no override" — the parse
-- keeps working before this migration is applied.
--
-- Lives on outreach_prospects (RLS already enabled with company-scoped
-- policies), distinct from recipient_name, which is the resolved COMPANY name.

alter table public.outreach_prospects
  add column contact_name text;

comment on column public.outreach_prospects.contact_name is
  'Person name for the greeting (manual override; null = derive from email localpart). recipient_name is the company.';
