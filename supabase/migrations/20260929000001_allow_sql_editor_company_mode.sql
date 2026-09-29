-- The SQL editor runs as postgres without a request JWT. Keep workspace API
-- callers restricted while allowing database administrators to fix flags.
create or replace function public.protect_company_profile_flags()
returns trigger language plpgsql as $$
begin
  if current_user <> 'postgres'
     and auth.role() is distinct from 'service_role'
     and (new.is_sample is distinct from old.is_sample or
          new.legacy_sourcegent_defaults is distinct from old.legacy_sourcegent_defaults) then
    raise exception 'Company mode is managed by an administrator';
  end if;
  return new;
end;
$$;
