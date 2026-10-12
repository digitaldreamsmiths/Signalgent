-- Click tracking.
--
-- Why: half the copy variants ask the reader to visit a link, and that is the
-- natural response to them. With opens at ~43% and replies at 0% the only way
-- to tell "nobody is interested" from "they clicked and the landing page lost
-- them" is to see the clicks. Links in the HTML part are rewritten at send time
-- to /api/outreach/click/<open_token>?u=<destination>, which records and 302s.
--
-- The open token is reused rather than minting a third per-send token: a click
-- record is harmless if forged (unlike an unsubscribe), and reusing it means
-- every already-queued row gets click tracking without a rewrite. Clicks are
-- soft data for the same reason opens are: Outlook SafeLinks and corporate
-- gateways fetch links on delivery, which the 15-second ignore window absorbs.

alter table public.outreach_sends
  add column clicked_at timestamptz,
  add column last_clicked_at timestamptz,
  add column click_count integer not null default 0;

create index outreach_sends_company_clicked_idx
  on public.outreach_sends (company_id, clicked_at);
