-- Signalgent: Add 'pinterest' to the connected_accounts.service enum.
--
-- Session 15 introduces Pinterest as the first LIVE data integration
-- for marketing mode (LinkedIn from Session 13 ships identity-only).
-- Pinterest's developer platform is friendlier than LinkedIn's — own
-- account + pin reads work without app review.

alter table public.connected_accounts
  drop constraint if exists connected_accounts_service_check;

alter table public.connected_accounts
  add constraint connected_accounts_service_check
    check (service in (
      'gmail', 'outlook', 'linkedin_page', 'linkedin', 'facebook_page',
      'shopify', 'stripe_account', 'quickbooks', 'plaid',
      'google_analytics', 'etsy', 'pinterest'
    ));
