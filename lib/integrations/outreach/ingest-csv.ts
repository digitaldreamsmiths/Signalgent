/**
 * Column-aware prospect import.
 *
 * The paste box and the upload button used to feed one text blob to a regex
 * that kept only the addresses. A list builder's CSV knows more than that: the
 * organization (which is what `{company}` renders as), a contact name, a city
 * and state, and the role or qualification notes that explain why the address
 * is on the list. For a free-mail address like mundelein75pto@gmail.com the
 * organization column is the ONLY way the greeting ever gets a name; the
 * website-based resolver has nothing to read.
 *
 * `parseProspectCsv` returns null for anything that is not a delimited file
 * with a header naming an email column, and the caller falls back to the
 * regex. Pure module: no client, unit-testable.
 */

export interface ParsedProspect {
  /** Lower-cased, trimmed. May still be invalid; the caller validates. */
  email: string
  recipient_name: string | null
  contact_name: string | null
  location: string | null
  notes: string | null
}

const EMAIL_HEADER = /e-?mail/i
const ORG_HEADER = /organi[sz]ation|company|school|church|business|account|employer|institution/i
const CONTACT_HEADER = /^(contact( name)?|first ?name|full ?name|person|name)$/i
const CITY_HEADER = /^(city|town)$/i
const STATE_HEADER = /^(state|st|province)$/i
const LOCATION_HEADER = /^location$/i
/** Anything explanatory worth keeping on the prospect, in header order. */
const NOTES_HEADER = /role|type|title|fit|qualif|notes?|segment|tier|comment|reason|source/i
const MAX_NOTES = 600

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === delimiter) { row.push(field); field = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
      continue
    }
    field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

function detectDelimiter(firstLine: string): string {
  if (firstLine.includes('\t')) return '\t'
  if (!firstLine.includes(',') && firstLine.includes(';')) return ';'
  return ','
}

function clean(s: string | undefined): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t ? t : null
}

export function parseProspectCsv(text: string): ParsedProspect[] | null {
  const body = text.replace(/^﻿/, '')
  const firstLine = body.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = detectDelimiter(firstLine)
  if (!firstLine.includes(delimiter)) return null
  const rows = parseDelimited(body, delimiter)
  if (rows.length < 2) return null
  const header = rows[0].map((h) => h.trim())
  const emailIdx = header.findIndex((h) => EMAIL_HEADER.test(h))
  if (emailIdx < 0) return null
  // A header that is itself an address is data, not a header.
  if (/@/.test(header[emailIdx])) return null

  const orgIdx = header.findIndex((h) => ORG_HEADER.test(h) && !EMAIL_HEADER.test(h))
  const contactIdx = header.findIndex((h) => CONTACT_HEADER.test(h))
  const cityIdx = header.findIndex((h) => CITY_HEADER.test(h))
  const stateIdx = header.findIndex((h) => STATE_HEADER.test(h))
  const locationIdx = header.findIndex((h) => LOCATION_HEADER.test(h))
  const used = new Set([emailIdx, orgIdx, contactIdx, cityIdx, stateIdx, locationIdx])
  const notesIdx = header.map((h, i) => (!used.has(i) && NOTES_HEADER.test(h) ? i : -1)).filter((i) => i >= 0)

  const out: ParsedProspect[] = []
  for (const cells of rows.slice(1)) {
    const email = clean(cells[emailIdx])?.toLowerCase()
    if (!email) continue
    const city = cityIdx >= 0 ? clean(cells[cityIdx]) : null
    const state = stateIdx >= 0 ? clean(cells[stateIdx]) : null
    const location = locationIdx >= 0 ? clean(cells[locationIdx]) : [city, state].filter(Boolean).join(', ') || null
    const notes = notesIdx
      .map((i) => ({ h: header[i], v: clean(cells[i]) }))
      .filter((n) => n.v)
      .map((n) => `${n.h}: ${n.v}`)
      .join(' · ')
    out.push({
      email,
      recipient_name: orgIdx >= 0 ? clean(cells[orgIdx]) : null,
      contact_name: contactIdx >= 0 ? clean(cells[contactIdx]) : null,
      location,
      notes: notes ? notes.slice(0, MAX_NOTES) : null,
    })
  }
  return out
}
