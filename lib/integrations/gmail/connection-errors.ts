export const GMAIL_CONNECTION_ERRORS = {
  cancelled: 'Gmail connection was cancelled. Your existing connection was kept.',
  invalid_state: 'This connection attempt expired or could not be verified. Start again from Connections.',
  unauthorized: 'Sign in to the same business account that started this connection, then try again.',
  configuration: 'Gmail setup is incomplete on the server. Check the existing Google, OAuth state, and encryption settings in Vercel.',
  exchange: 'Google could not complete this connection. Start a fresh connection attempt.',
  profile: 'Google did not provide the mailbox identity. Your existing account was kept. Try connecting again.',
  migration: 'The database needs the workspace update before you can add another Gmail account. Your existing mailbox is still available.',
  save: 'Gmail authorized successfully, but the app could not save the connection. Check the database setup and try again.',
} as const

export function gmailConnectionError(error: unknown, fallback: keyof typeof GMAIL_CONNECTION_ERRORS) {
  const message = error instanceof Error ? error.message : ''
  if (/ACCOUNT_MIGRATION_REQUIRED|42P10|no unique or exclusion constraint/i.test(message)) return 'migration' as const
  if (/OAUTH_STATE_SECRET|INTEGRATION_ENCRYPTION_KEY|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET/.test(message)) return 'configuration' as const
  return fallback
}
