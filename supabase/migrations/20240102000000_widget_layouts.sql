-- Signalgent: Widget Layout Persistence
-- Stores per-user, per-company widget layouts so they survive across devices.
-- This replaces the localStorage-only approach from Session 3.

create table public.widget_layouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  mode_id text not null,
  layout jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, user_id, mode_id)
);

alter table public.widget_layouts enable row level security;

create policy "Users can read own widget layouts"
  on public.widget_layouts for select
  using (auth.uid() = user_id);

create policy "Users can insert own widget layouts"
  on public.widget_layouts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own widget layouts"
  on public.widget_layouts for update
  using (auth.uid() = user_id);

create policy "Users can delete own widget layouts"
  on public.widget_layouts for delete
  using (auth.uid() = user_id);
