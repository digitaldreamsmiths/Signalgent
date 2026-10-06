-- Each company supplies its own Microsoft Entra app registration.
create table public.company_microsoft_oauth_configs (
  company_id uuid primary key references public.companies(id) on delete cascade,
  tenant_id uuid not null,
  client_id uuid not null,
  client_secret_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_microsoft_oauth_configs enable row level security;

create policy "Members can read their company Microsoft setup"
  on public.company_microsoft_oauth_configs for select
  using (exists (
    select 1 from public.companies c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = company_microsoft_oauth_configs.company_id
      and wm.user_id = auth.uid()
  ));

create policy "Admins can insert their company Microsoft setup"
  on public.company_microsoft_oauth_configs for insert
  with check (exists (
    select 1 from public.companies c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = company_microsoft_oauth_configs.company_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  ));

create policy "Admins can update their company Microsoft setup"
  on public.company_microsoft_oauth_configs for update
  using (exists (
    select 1 from public.companies c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = company_microsoft_oauth_configs.company_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  ))
  with check (exists (
    select 1 from public.companies c
    join public.workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id = company_microsoft_oauth_configs.company_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  ));
