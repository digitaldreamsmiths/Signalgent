-- Signalgent: fix infinite recursion in workspace_members RLS policies
--
-- The original workspace_members policies referenced workspace_members from
-- inside their own USING/WITH CHECK clauses, which re-applies the policy on
-- the inner query → Postgres returns
--   "infinite recursion detected in policy for relation workspace_members".
--
-- Fix: move the membership checks into SECURITY DEFINER functions that
-- bypass RLS for the membership probe only.

-- ============================================================
-- Helpers (SECURITY DEFINER, so they bypass RLS)
-- ============================================================

create or replace function public.is_workspace_member(ws_id uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = uid
  );
$$;

create or replace function public.is_workspace_owner(ws_id uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = uid and role = 'owner'
  );
$$;

create or replace function public.workspace_has_members(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id
  );
$$;

-- ============================================================
-- Rewrite workspace_members policies (no self-recursion)
-- ============================================================

drop policy if exists "Users can read members of their workspaces"
  on public.workspace_members;

create policy "Users can read members of their workspaces"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_members.workspace_id, auth.uid()));

drop policy if exists "Owners can insert workspace members"
  on public.workspace_members;

create policy "Owners can insert workspace members"
  on public.workspace_members for insert
  with check (
    public.is_workspace_owner(workspace_members.workspace_id, auth.uid())
    or not public.workspace_has_members(workspace_members.workspace_id)
  );

drop policy if exists "Owners can delete workspace members"
  on public.workspace_members;

create policy "Owners can delete workspace members"
  on public.workspace_members for delete
  using (public.is_workspace_owner(workspace_members.workspace_id, auth.uid()));
