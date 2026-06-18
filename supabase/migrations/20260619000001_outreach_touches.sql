-- Multi-touch follow-up sequences.
--
-- A prospect can now have more than one draft: step 1 is the initial email,
-- step 2+ are follow-ups generated on demand. This replaces the
-- one-draft-per-prospect unique with a (prospect_id, step) unique.

alter table public.outreach_drafts
  add column step int not null default 1;

-- Drop the existing unique(prospect_id) regardless of its generated name.
do $$
declare cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.outreach_drafts'::regclass
    and contype = 'u'
    and conkey = array(
      select attnum from pg_attribute
      where attrelid = 'public.outreach_drafts'::regclass and attname = 'prospect_id'
    );
  if cname is not null then
    execute format('alter table public.outreach_drafts drop constraint %I', cname);
  end if;
end $$;

alter table public.outreach_drafts
  add constraint outreach_drafts_prospect_step_key unique (prospect_id, step);
