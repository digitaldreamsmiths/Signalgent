-- Reply preview.
--
-- The reply/bounce scanner (20260629000000_outreach_reply_detection.sql) only
-- COUNTS inbound activity — it flips disposition to 'replied'/'bounced' but keeps
-- nothing about the message, so the UI could show "1 reply" with no way to see
-- what was said. The Gmail metadata fetch the scanner already does returns the
-- sender, subject, and a ~200-char snippet per message at no extra cost; persist
-- them so a detected reply (or bounce) can be previewed in-app.
--
-- Snippet-level only by design: the full body stays in Gmail (click through to
-- read/respond). These columns hold the LATEST detected inbound message.
alter table public.outreach_prospects
  add column reply_from text,
  add column reply_subject text,
  add column reply_snippet text;
