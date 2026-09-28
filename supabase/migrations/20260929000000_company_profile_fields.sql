-- Company identity is distinct from connected OAuth accounts and outreach copy.
-- These fields are scoped to a single company row and stay blank until supplied.
alter table public.companies
  add column legacy_sourcegent_defaults boolean not null default false,
  add column is_sample boolean not null default false,
  add column description text not null default '',
  add column contact_email text not null default '',
  add column contact_phone text not null default '',
  add column linkedin_name text not null default '',
  add column instagram_name text not null default '',
  add column facebook_name text not null default '',
  add column pinterest_name text not null default '';

-- Preserve the original live SourceGent company's historical fallback copy.
update public.companies set legacy_sourcegent_defaults = true
where lower(trim(name)) like 'sourcegent%';

update public.companies set is_sample = true
where lower(trim(name)) in ('abc corp.', 'platetell')
  and workspace_id in (select workspace_id from public.companies where legacy_sourcegent_defaults);

-- Workspace members may edit profile text, but cannot promote a sample company
-- or enable the legacy SourceGent fallback through a direct API update.
create function public.protect_company_profile_flags()
returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'service_role' and
     (new.is_sample is distinct from old.is_sample or
      new.legacy_sourcegent_defaults is distinct from old.legacy_sourcegent_defaults) then
    raise exception 'Company mode is managed by an administrator';
  end if;
  return new;
end;
$$;
create trigger protect_company_profile_flags_before_update
before update on public.companies
for each row execute function public.protect_company_profile_flags();

create function public.default_company_profile_flags()
returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.is_sample := false;
    new.legacy_sourcegent_defaults := false;
  end if;
  return new;
end;
$$;
create trigger default_company_profile_flags_before_insert
before insert on public.companies
for each row execute function public.default_company_profile_flags();
