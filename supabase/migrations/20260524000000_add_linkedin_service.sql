-- Signalgent: Add 'linkedin' to the connected_accounts.service enum.
--
-- Session 13 introduces LinkedIn as the first live integration for marketing
-- mode. The initial schema declared `linkedin_page` as a placeholder for the
-- eventual company-page-tier integration; the member-tier OAuth we're
-- shipping first uses the distinct value `linkedin`. Both can coexist if a
-- future commercial-page integration ever lands.

alter table public.connected_accounts
  drop constraint if exists connected_accounts_service_check;

alter table public.connected_accounts
  add constraint connected_accounts_service_check
    check (service in (
      'gmail', 'outlook', 'linkedin_page', 'linkedin', 'facebook_page',
      'shopify', 'stripe_account', 'quickbooks', 'plaid',
      'google_analytics', 'etsy'
    ));
