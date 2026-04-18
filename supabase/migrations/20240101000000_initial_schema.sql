-- Signalgent: Initial Schema
-- Tables: profiles, workspaces, workspace_members, companies,
--          connected_accounts, intelligence_briefs, api_usage

-- ============================================================
-- 1. profiles — extends auth.users
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================================
-- 2. workspaces
-- ============================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now()
);

alter table public.workspaces enable row level security;

create policy "Authenticated users can create workspaces"
  on public.workspaces for insert
  with check (auth.uid() is not null);

-- NOTE: The SELECT policy for workspaces references workspace_members,
-- so it's defined after that table is created (see below).

-- ============================================================
-- 3. workspace_members
-- ============================================================
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')) default 'member',
  created_at timestamptz default now(),
  unique(workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

create policy "Users can read members of their workspaces"
  on public.workspace_members for select
  using (
    exists (
      select 1 from public.workspace_members as wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "Owners can insert workspace members"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspace_members as wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
    or not exists (
      select 1 from public.workspace_members as wm
      where wm.workspace_id = workspace_members.workspace_id
    )
  );

create policy "Owners can delete workspace members"
  on public.workspace_members for delete
  using (
    exists (
      select 1 from public.workspace_members as wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

-- Deferred SELECT policy for workspaces (depends on workspace_members)
create policy "Users can read workspaces they belong to"
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = workspaces.id
        and workspace_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. companies
-- ============================================================
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  industry text,
  logo_url text,
  website text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.companies enable row level security;

create policy "Users can read companies in their workspaces"
  on public.companies for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = companies.workspace_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users can insert companies in their workspaces"
  on public.companies for insert
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = companies.workspace_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users can update companies in their workspaces"
  on public.companies for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_members.workspace_id = companies.workspace_id
        and workspace_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. connected_accounts
-- ============================================================
create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  service text not null check (service in (
    'gmail', 'outlook', 'linkedin_page', 'facebook_page',
    'shopify', 'stripe_account', 'quickbooks', 'plaid', 'google_analytics'
  )),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  account_identifier text,
  metadata jsonb default '{}',
  status text not null check (status in ('active', 'expired', 'revoked')) default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, service)
);

alter table public.connected_accounts enable row level security;

create policy "Users can read connected_accounts for their workspace companies"
  on public.connected_accounts for select
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = connected_accounts.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users can insert connected_accounts for their workspace companies"
  on public.connected_accounts for insert
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = connected_accounts.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users can update connected_accounts for their workspace companies"
  on public.connected_accounts for update
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = connected_accounts.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- 6. intelligence_briefs
-- ============================================================
create table public.intelligence_briefs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  brief_date date not null,
  summary text,
  email_insights jsonb default '{}',
  marketing_insights jsonb default '{}',
  finance_insights jsonb default '{}',
  commerce_insights jsonb default '{}',
  priority_actions jsonb default '[]',
  generated_at timestamptz,
  created_at timestamptz default now(),
  unique(company_id, brief_date)
);

alter table public.intelligence_briefs enable row level security;

create policy "Users can read briefs for their workspace companies"
  on public.intelligence_briefs for select
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = intelligence_briefs.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Users can insert briefs for their workspace companies"
  on public.intelligence_briefs for insert
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = intelligence_briefs.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. api_usage
-- ============================================================
create table public.api_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id),
  service text not null check (service in ('anthropic', 'fal')),
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 6),
  feature text,
  created_at timestamptz default now()
);

alter table public.api_usage enable row level security;

create policy "Users can read usage for their workspace companies"
  on public.api_usage for select
  using (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = api_usage.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

create policy "Authenticated users can insert usage for their workspace companies"
  on public.api_usage for insert
  with check (
    exists (
      select 1 from public.companies
      join public.workspace_members on workspace_members.workspace_id = companies.workspace_id
      where companies.id = api_usage.company_id
        and workspace_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- Trigger: auto-create profile on auth.users insert
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'first_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
