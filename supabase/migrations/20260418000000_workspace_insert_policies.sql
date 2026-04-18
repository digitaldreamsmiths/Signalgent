-- Signalgent: RLS insert policies for workspace bootstrap
--
-- The initial schema enabled RLS on `workspaces` but never created an INSERT
-- policy, so onboarding (handleSubmit in app/onboarding/page.tsx) fails at
-- the first insert with "new row violates row-level security policy for
-- table workspaces". This adds the missing policies.

-- Any authenticated user may create a workspace. Ownership is asserted by
-- the subsequent `workspace_members` insert.
drop policy if exists "Authenticated users can create workspaces"
  on public.workspaces;

create policy "Authenticated users can create workspaces"
  on public.workspaces for insert
  with check (auth.uid() is not null);

-- The existing workspace_members insert policy allows the first member of a
-- brand-new workspace to insert (via its `or not exists` clause). Re-assert
-- it here idempotently in case it was lost during an earlier partial run.
drop policy if exists "Owners can insert workspace members"
  on public.workspace_members;

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
