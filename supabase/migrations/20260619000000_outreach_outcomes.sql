-- Outcome tracking for outreach prospects.
--
-- The pipeline went dark after "export": no record of what happened to a sent
-- draft. This adds a prospect-level disposition (the outcome of the whole
-- conversation) so we can surface reply-rate metrics and, in a follow-up
-- migration, suppress prospects that have already replied or bounced.
--
-- "Sent" is not a new field: a draft with status = 'exported' already means it
-- was exported to the sending tool. Disposition is recorded manually in-app.

alter table public.outreach_prospects
  add column disposition text not null default 'open'
    check (disposition in ('open', 'interested', 'not_interested', 'bounced', 'unsubscribed')),
  add column disposition_at timestamptz;

-- Existing RLS (read/insert/update/delete by workspace membership) already
-- covers these columns; no new policy needed.
