-- Provider-agnostic outreach sending layer.
--
-- outreach_settings: per-company sender identity + drip controls (daily cap,
--   business-hours window, min gap, CAN-SPAM footer fields, provider, active).
-- outreach_sends: one row per send attempt for a draft (touch). The SEND
--   lifecycle (queued -> sending -> sent | failed | canceled) is tracked here,
--   kept separate from review status (outreach_drafts) and outcome
--   (outreach_prospects.disposition).

create table public.outreach_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  sender_name text,
  sender_email text,
  reply_to text,
  daily_send_limit int not null default 25,
  send_window_start text not null default '09:00',
  send_window_end text not null default '17:00',
  timezone text not null default 'America/New_York',
  min_gap_minutes int not null default 6,
  signature text,
  physical_address text,
  unsubscribe_line text,
  provider text not null default 'dry_run' check (provider in ('dry_run', 'gmail', 'resend')),
  active boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.outreach_sends (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  draft_id uuid not null references public.outreach_drafts(id) on delete cascade,
  provider text not null,
  recipient_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'canceled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index outreach_sends_company_status_sched_idx
  on public.outreach_sends (company_id, status, scheduled_at);

-- RLS: workspace-membership gate (mirrors outreach_prospects / outreach_drafts).
alter table public.outreach_settings enable row level security;
alter table public.outreach_sends enable row level security;

create policy "rw outreach_settings for workspace companies"
  on public.outreach_settings for all
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_settings.company_id
        and workspace_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_settings.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "rw outreach_sends for workspace companies"
  on public.outreach_sends for all
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_sends.company_id
        and workspace_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = outreach_sends.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

-- ── Automated drip trigger (run ONCE in the Supabase SQL editor, with your prod
-- URL + CRON_SECRET, to drive the worker every 5 minutes). Requires pg_cron +
-- pg_net extensions. Left commented so it doesn't run in CI / other envs.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('outreach-send-drip', '*/5 * * * *', $$
--   select net.http_post(
--     url := 'https://YOUR_APP_URL/api/outreach/cron',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
--   );
-- $$);
