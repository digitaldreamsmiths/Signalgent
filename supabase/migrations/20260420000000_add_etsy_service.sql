-- Signalgent: Add 'etsy' to the connected_accounts.service enum.
--
-- Session 11 introduces Etsy as the first live integration for commerce mode.
-- The initial schema (20240101000000) declared the service column as a CHECK
-- constraint over a fixed set of strings. Widening it to include 'etsy'
-- requires dropping and re-adding the constraint.

alter table public.connected_accounts
  drop constraint if exists connected_accounts_service_check;

alter table public.connected_accounts
  add constraint connected_accounts_service_check
    check (service in (
      'gmail', 'outlook', 'linkedin_page', 'facebook_page',
      'shopify', 'stripe_account', 'quickbooks', 'plaid',
      'google_analytics', 'etsy'
    ));
