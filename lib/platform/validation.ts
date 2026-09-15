import { CHANNELS, type ContentItem, type Contact, type Campaign } from './types'

function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string') throw new Error('Enter a valid text value.')
  const clean = value.trim()
  if ((required && !clean) || clean.length > max) throw new Error(`Enter ${required ? '1–' : 'up to '}${max} characters.`)
  return clean
}
export function validateContent(input: ContentItem) {
  const title = text(input.title, 180, true)
  const body = text(input.body, 50000)
  if (!Array.isArray(input.channels) || !input.channels.length || input.channels.some(c => !(c in CHANNELS))) throw new Error('Choose at least one supported channel.')
  if (!['draft', 'review', 'approved', 'planned', 'archived'].includes(input.status)) throw new Error('Choose a valid content status.')
  if (input.status !== 'draft' && input.status !== 'archived' && !body) throw new Error('Add content before submitting for review or planning.')
  const planned_at = input.planned_at ? new Date(input.planned_at).toISOString() : null
  if (input.status === 'planned' && !planned_at) throw new Error('Choose a date and time for this plan.')
  let image_url = input.image_url ? text(input.image_url, 2048) : null
  if (image_url) {
    const url = new URL(image_url)
    if (url.protocol !== 'https:') throw new Error('Use an HTTPS image address.')
    image_url = url.href
  }
  return { title, body, channels: [...new Set(input.channels)], status: input.status, planned_at, campaign_id: input.campaign_id || null, image_url }
}
export function validateContact(input: Contact) {
  const email = text(input.email, 254, true).toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('Enter a valid email address.')
  if (!['not_subscribed', 'subscribed', 'unsubscribed'].includes(input.subscription)) throw new Error('Choose a valid subscription status.')
  const consent_note = text(input.consent_note, 2000)
  if (input.subscription === 'subscribed' && !consent_note) throw new Error('Record where and when this person subscribed.')
  if (!Array.isArray(input.tags) || input.tags.length > 20) throw new Error('Use up to 20 tags.')
  return { name: text(input.name, 180, true), email, organization: text(input.organization, 180), tags: input.tags.map(t => text(t, 50, true)), subscription: input.subscription, consent_note, notes: text(input.notes, 10000) }
}
export function validateCampaign(input: Campaign) {
  if (!['draft', 'active', 'completed'].includes(input.status)) throw new Error('Choose a valid campaign status.')
  return { name: text(input.name, 180, true), objective: text(input.objective, 5000), status: input.status }
}
export function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
