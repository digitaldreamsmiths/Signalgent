-- NULL inherits the company sending timezone. Existing campaigns keep their
-- current behavior until an override is selected.
alter table public.outreach_campaigns
  add column timezone text;
