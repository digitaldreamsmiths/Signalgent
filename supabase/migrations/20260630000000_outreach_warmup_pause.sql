-- Deliverability: sending warmup ramp + bounce auto-pause.
--
-- Warmup: instead of hitting daily_send_limit from day one, the per-day send cap
-- ramps from warmup_start_per_day, growing warmup_increment_per_day each sending
-- weekday, up to daily_send_limit. The scheduler (nextSlot/computeBatchSlots)
-- reads this effective cap per day. warmup_started_at anchors the ramp (set when
-- sending first goes active).
--
-- Auto-pause: when the recent bounce rate over a window exceeds the threshold,
-- the cron flips active=false and records pause_reason='bounce_rate' so the UI
-- can explain why sending stopped (vs. a manual pause).

alter table public.outreach_settings
  add column warmup_enabled boolean not null default true,
  add column warmup_start_per_day int not null default 10,
  add column warmup_increment_per_day int not null default 5,
  add column warmup_started_at timestamptz,
  add column bounce_pause_enabled boolean not null default true,
  add column bounce_pause_threshold numeric not null default 0.05,
  add column bounce_pause_window_days int not null default 7,
  add column bounce_pause_min_sends int not null default 20,
  add column pause_reason text check (pause_reason in ('manual', 'bounce_rate'));
