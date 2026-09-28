alter table public.outreach_settings
  drop constraint if exists outreach_settings_provider_check;

alter table public.outreach_settings
  add constraint outreach_settings_provider_check
  check (provider in ('dry_run', 'gmail', 'outlook', 'resend'));
