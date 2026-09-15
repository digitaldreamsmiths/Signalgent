begin;

-- Keep the oldest connected account as the legacy outreach/default account.
-- New inbox operations explicitly select an account ID.
update public.connected_accounts set account_identifier = service where account_identifier is null;
alter table public.connected_accounts drop constraint if exists connected_accounts_company_id_service_key;
alter table public.connected_accounts add constraint connected_accounts_company_service_identity_key unique(company_id, service, account_identifier);

create table public.platform_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(name) between 1 and 180),
  objective text not null default '',
  status text not null default 'draft' check(status in ('draft','active','completed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, company_id)
);
create table public.platform_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, email text not null, organization text not null default '',
  tags text[] not null default '{}',
  subscription text not null default 'not_subscribed' check(subscription in ('not_subscribed','subscribed','unsubscribed')),
  consent_note text not null default '', notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(subscription <> 'subscribed' or length(trim(consent_note)) > 0)
);
create unique index platform_contacts_email on public.platform_contacts(company_id, lower(email));
create table public.platform_content (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check(length(title) between 1 and 180), body text not null default '',
  channels text[] not null check(cardinality(channels)>0 and channels <@ array['email','linkedin','instagram','facebook','pinterest']::text[]),
  status text not null default 'draft' check(status in ('draft','review','approved','planned','archived')),
  planned_at timestamptz, campaign_id uuid, image_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(campaign_id, company_id) references public.platform_campaigns(id, company_id),
  check(status <> 'planned' or planned_at is not null)
);
create index platform_content_calendar on public.platform_content(company_id, planned_at);
create index platform_content_updated on public.platform_content(company_id, updated_at desc);
create index platform_campaigns_company on public.platform_campaigns(company_id);

-- Claims are inserted before sending. Uncertain sends cannot be retried blindly.
create table public.platform_mail_operations (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id),
  status text not null check(status in ('sending','sent','uncertain')),
  provider_message_id text,
  created_at timestamptz not null default now()
);

-- Every record is scoped by company; the FK also prevents cross-company campaigns.
do $$
declare t text;
begin
  foreach t in array array['platform_campaigns','platform_contacts','platform_content','platform_mail_operations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy workspace_access on public.%I for all to authenticated using (exists (select 1 from public.companies c join public.workspace_members m on m.workspace_id=c.workspace_id where c.id=company_id and m.user_id=auth.uid())) with check (exists (select 1 from public.companies c join public.workspace_members m on m.workspace_id=c.workspace_id where c.id=company_id and m.user_id=auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
commit;
