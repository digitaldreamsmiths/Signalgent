-- Existing companies retain federal award enrichment; new companies choose during setup.
alter table public.companies
  add column use_usaspending boolean not null default true;
