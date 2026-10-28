begin;

-- Every attempt to publish a content item to a channel. A row is inserted
-- with status 'publishing' BEFORE the provider call, and the partial unique
-- index below allows one non-failed row per (content, channel), so two
-- overlapping publishers can never both post. A failed row stays for the
-- record; a later attempt inserts a new one.
create table public.platform_publications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  content_id uuid not null references public.platform_content(id) on delete cascade,
  channel text not null check (channel in ('email','linkedin','instagram','facebook','pinterest')),
  account_id uuid references public.connected_accounts(id),
  status text not null check (status in ('publishing','published','failed')),
  provider_post_id text,
  post_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index platform_publications_live on public.platform_publications(content_id, channel) where status <> 'failed';
create index platform_publications_company on public.platform_publications(company_id, created_at desc);

alter table public.platform_publications enable row level security;
create policy workspace_access on public.platform_publications for all to authenticated
  using (exists (select 1 from public.companies c join public.workspace_members m on m.workspace_id=c.workspace_id where c.id=company_id and m.user_id=auth.uid()))
  with check (exists (select 1 from public.companies c join public.workspace_members m on m.workspace_id=c.workspace_id where c.id=company_id and m.user_id=auth.uid()));
grant select, insert, update, delete on public.platform_publications to authenticated;

-- Opt-in per item: the scheduler only posts planned items that asked for it,
-- so existing planned content never publishes itself when this ships.
alter table public.platform_content add column if not exists auto_publish boolean not null default false;

commit;
