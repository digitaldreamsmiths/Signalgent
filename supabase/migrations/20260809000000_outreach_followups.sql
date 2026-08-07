-- Automatic follow-up sequences — Phase 1 of the govcon productization plan
-- (docs/specs/signalgent-govcon-v1.md).
--
-- Follow-ups existed but were generated one prospect at a time by hand. These
-- settings drive a cron sweep that generates + queues the next touch for any
-- prospect whose last touch was SENT >= followup_wait_days business days ago
-- with no reply, up to followup_max_touches total touches. Off by default —
-- enabling it is an explicit choice in Sending settings.
--
-- Per-company for now; the campaigns table (next Phase 1 chunk) will carry
-- per-campaign overrides with these as the fallback.

alter table public.outreach_settings
  add column followup_enabled boolean not null default false,
  add column followup_wait_days integer not null default 4 check (followup_wait_days >= 1),
  add column followup_max_touches integer not null default 3 check (followup_max_touches >= 1);

comment on column public.outreach_settings.followup_enabled is
  'Cron auto-generates and queues the next touch when the last one has gone unanswered.';
comment on column public.outreach_settings.followup_wait_days is
  'Business days to wait after a sent touch before the next one.';
comment on column public.outreach_settings.followup_max_touches is
  'Total touches per prospect including the opener.';
