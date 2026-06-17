-- Signalgent: add 'exported' to outreach_drafts.status.
--
-- Approved drafts that have been downloaded (CSV) and sent through the external
-- cold-email platform move to 'exported' so the Approved queue stays lean and
-- doesn't pile up with already-sent emails.

alter table public.outreach_drafts
  drop constraint if exists outreach_drafts_status_check;

alter table public.outreach_drafts
  add constraint outreach_drafts_status_check
    check (status in ('pending', 'approved', 'edited', 'rejected', 'exported'));
