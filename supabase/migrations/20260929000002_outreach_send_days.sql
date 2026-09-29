-- Weekdays use JavaScript/Postgres extract(dow) numbering: Sunday=0.
-- Keep the existing Monday-Friday behavior until a company changes it.
alter table public.outreach_settings
  add column send_days integer[] not null default array[1, 2, 3, 4, 5]
  check (cardinality(send_days) between 1 and 7
    and send_days <@ array[0, 1, 2, 3, 4, 5, 6]);
