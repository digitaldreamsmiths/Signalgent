-- Auto reply & bounce detection.
--
-- Closes the outreach feedback loop. A cron scan pass reads each open prospect's
-- Gmail thread and, on detecting an inbound reply or a bounce, moves the prospect
-- off 'open' (which the send worker already treats as a suppression signal).
--
-- Replies land in a new neutral 'replied' disposition — distinct from the manual
-- 'interested'/'not_interested' outcomes — so the human still triages sentiment,
-- but follow-ups stop and the reply-rate metric becomes trustworthy.

-- Recreate the disposition CHECK to allow 'replied' (added to the set defined in
-- 20260619000000_outreach_outcomes.sql).
alter table public.outreach_prospects
  drop constraint outreach_prospects_disposition_check,
  add constraint outreach_prospects_disposition_check
    check (disposition in ('open', 'replied', 'interested', 'not_interested', 'bounced', 'unsubscribed'));

-- Per-send audit of when a reply / bounce was detected in its thread.
alter table public.outreach_sends
  add column replied_at timestamptz,
  add column bounced_at timestamptz;

-- Throttle cursor: the scan pass skips a company whose last scan is recent, to
-- bound Gmail API load under the 5-minute cron.
alter table public.outreach_settings
  add column last_reply_scan_at timestamptz;
