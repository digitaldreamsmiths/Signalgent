/**
 * Organization-name resolution for prospects the USASpending enrichment never
 * names (it is disabled for non-federal companies, so every prospect carried a
 * null recipient_name and every template greeting rendered as a bare "Hi,").
 *
 * Two sources, tried in order, both tuned for precision over recall because a
 * wrong name in a salutation reads worse than no name:
 *
 *   1. The organization's own website: og:site_name, else <title>, cleaned of
 *      the "Home |", "Welcome to", and "City, ST" furniture sites bolt on.
 *      Only for addresses on a real domain; free-mail says nothing.
 *   2. The address itself, read by a small model with a hard "say NONE unless
 *      it is obvious" rule, for free-mail addresses like
 *      stjamesmethodistaugusta@gmail.com. Accepted only when the answer keeps
 *      a token that actually appears in the address, so the model cannot
 *      invent a church that is not spelled out in front of it.
 */

import { getAnthropicClient, logUsage } from '@/lib/llm/client'
import { pickModel } from '@/lib/llm/models'

export const FREEMAIL_RE = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|comcast|bellsouth|att|sbcglobal|verizon|cox|charter|earthlink|protonmail|proton|myfairpoint|windstream|frontier|juno|netzero|centurylink|optonline|roadrunner|rr|twc|embarqmail|suddenlink|mindspring|pacbell|swbell|prodigy|zoominternet|hughes|wildblue|q|mchsi|cableone|nycap|frontiernet|epbfi|tds|gci|citlink|kc)\.(com|net|org|me)$/i

export type OrgNameSource = 'site' | 'address'
export interface OrgName { name: string; source: OrgNameSource }

const MAX_LEN = 60
const FETCH_TIMEOUT_MS = 8000

/** Segments that are page furniture rather than a name. */
const FURNITURE_RE = /^(home|homepage|home page|welcome|welcome home|official (web)?site|website|index|main|untitled|new page|site)$/i
/** Whole titles that mean the fetch did not reach a real site. */
const JUNK_RE = /\b(404|not found|just a moment|attention required|access denied|forbidden|error|coming soon|under construction|parked|is for sale|domain|godaddy|wix\.com|squarespace|wordpress|login|sign in|cloudflare|suspended|expired|telephone|telecom\w*|internet|broadband|cable|wireless|fiber|webmail|email|hosting|non-?profit)\b/i
/** Tokens that mark a segment as the organization rather than a tagline. */
const ORG_TOKEN_RE = /\b(church|chapel|parish|cathedral|ministr\w*|fellowship|ucc|umc|elca|lcms|pca|pcusa|baptist|methodist|lutheran|presbyterian|episcopal|anglican|catholic|nazarene|assembl\w*|congregation\w*|temple|synagogue|community|christian|bible|gospel|mission\w*|tabernacle|worship|saint|st\.|first|trinity|grace|faith|hope|calvary|covenant|redeemer|emmanuel|immanuel|bethel|zion|wesley|disciples|brethren|mennonite|friends|vineyard|reformed|orthodox|evangelical|pentecostal|apostolic|aog|cogic|cathedral|basilica|abbey|parish)\b/i

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

/** Denomination initialisms that stay upper-case when a shouted name is un-shouted. */
const KEEP_CAPS = new Set(['UCC', 'UMC', 'ELCA', 'LCMS', 'PCUSA', 'PCA', 'CME', 'AME', 'AOG', 'COGIC', 'LDS', 'SDA', 'RCA', 'CRC', 'EPC', 'ECO', 'VT', 'NH', 'NY', 'NJ', 'NC', 'SC', 'GA', 'FL', 'TX', 'CA', 'WA', 'OR', 'PA', 'MA', 'CT', 'RI', 'ME', 'MD', 'VA', 'OH', 'MI', 'IL', 'IN', 'WI', 'MN', 'IA', 'MO', 'KS', 'NE', 'CO', 'AZ', 'NM', 'NV', 'UT', 'ID', 'MT', 'WY', 'ND', 'SD', 'OK', 'AR', 'LA', 'MS', 'AL', 'TN', 'KY', 'WV', 'DE', 'DC', 'AK', 'HI'])

/** Un-shout any ALL-CAPS word of four or more letters ("GRINNELL United" ->
 * "Grinnell United"), leaving initialisms alone. */
function unshout(s: string): string {
  return s.replace(/\b[A-Z][A-Z'’]{3,}\b/g, (w) => (KEEP_CAPS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
}

/** "United Church OF Christ" -> "United Church of Christ" (never the first word). */
function lowerConnectives(s: string): string {
  return s.replace(/(?<=\S\s)\b(OF|THE|AND|IN|AT|FOR)\b/g, (w) => w.toLowerCase())
}

/** Words that, on their own, do not name anything ("Church", "UCC",
 * "Congregational Church", "United Church of Christ"). A name must keep at
 * least one specific word once these are removed. */
const GENERIC_WORD_RE = /^(the|a|an|of|and|at|in|church|chapel|parish|congregation\w*|congregational|united|christ|ucc|umc|elca|lcms|pca|pcusa|baptist|methodist|lutheran|presbyterian|episcopal|anglican|catholic|nazarene|assembly|assemblies|god|community|christian|fellowship|ministries|ministry|home|welcome|site|website|official|page)$/i

export function isSpecificName(name: string, opts: { source?: OrgNameSource } = {}): boolean {
  const words = name.replace(/[^A-Za-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.some((w) => w.length >= 3 && !GENERIC_WORD_RE.test(w))) return true
  // A church's own site titled "Community United Methodist Church" really is
  // its name; three or more words is enough to not read as a merge field.
  // A model reading an address gets no such benefit of the doubt.
  return opts.source === 'site' && words.length >= 3
}

/** Role words that a mailbox localpart is made of; none of them name an org. */
const LOCAL_ROLE_RE = /^(office|admin|administrator|info|pastor|rev|contact|contactus|secretary|mail|email|hello|communications|staff|church|the|of|us|team|main|front|desk|hq|welcome|general|connect|connections|worship|youth|kids|children|music|missions|outreach|ministry|ministries|cyf|ed|christianed|financial|finance|treasurer|clerk|moderator|deacon|elder|elders|session|council|trustees|parish|parishoffice)$/i

/** Whether the mailbox localpart itself names an organization, as opposed to
 * a role: "eldoraucc" does (eldora + ucc), "churchoffice" does not. */
export function localNamesOrg(local: string): boolean {
  const stripped = local.toLowerCase().replace(/[^a-z]/g, ' ')
    .replace(/ucc|umc|church|naz|pres|bapt|luth|epis|chapel|parish|congregational|congo|cong|fellowship|ministries/g, ' ')
  const rest = stripped.split(/\s+/).filter((w) => w.length >= 3 && !LOCAL_ROLE_RE.test(w))
  return rest.length > 0 && /ucc|umc|church|naz|pres|bapt|luth|epis|chapel|parish|cong|fellowship|ministries/.test(local.toLowerCase())
}

/**
 * Turn a page title into a name, or null. Pure, so it is cheap to test:
 *   "Home | First Baptist Church of Jesup"      -> "First Baptist Church of Jesup"
 *   "Welcome to Grace UMC - Covington, GA"      -> "Grace UMC"
 *   "St. Paul's Episcopal :: Worship Times"     -> "St. Paul's Episcopal"
 */
export function cleanSiteTitle(raw: string): string | null {
  let t = decodeEntities(raw).replace(/\s+/g, ' ').trim()
  if (!t || JUNK_RE.test(t)) return null
  t = t.replace(/^welcome( home)? to\s+/i, '').replace(/^(the )?official (web)?site of\s+/i, '')
  // Separators sites use between name and tagline/place. A lone " I " is a
  // pipe that lost its glyph in the title ("First UMC I Manchester, NH").
  const segments = t
    .split(/\s*(?:\||–|—|::|:|•|›|»|\/|\s-\s|\sI\s)\s*/)
    .map((s) => s.trim().replace(/[.!]+$/, ''))
    .filter((s) => s && !FURNITURE_RE.test(s))
  if (segments.length === 0) return null
  const pick = segments.find((s) => ORG_TOKEN_RE.test(s)) ?? segments[0]
  let name = pick
    // Drop the place, in the forms sites write it:
    //   "First Baptist Church, Jesup, GA"       (comma, city, state code)
    //   "Saint Paul's Church Augusta, GA"       (city, state code, no comma)
    //   "Hudson UMC in Hudson, Ohio"            ("in" + city, any state)
    //   "First Congregational UCC, Fort Pierce" (comma + city, no state)
    .replace(/,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\b.*$/, '')
    .replace(/\s+in\s+[A-Z][A-Za-z .'-]+(?:,\s*[A-Za-z ]+)?$/, '')
    .replace(/\s*[-–—]\s*[A-Za-z .'-]+,\s*[A-Z]{2}\b.*$/, '')
    .replace(/\s+([A-Z][A-Za-z.'-]+(?:\s[A-Z][A-Za-z.'-]+)?),\s*[A-Z]{2}\b.*$/, (_m, city: string) => {
      // Never eat an organization word: "Church Jackson, TN" keeps "Church".
      const words = city.split(' ')
      const keep = words.filter((w) => ORG_TOKEN_RE.test(w))
      return keep.length ? ` ${keep.join(' ')}` : ''
    })
    .replace(/,\s*[A-Z][A-Za-z .'-]+(?:,\s*[A-Za-z ]+)?$/, (m, off: number, str: string) => (ORG_TOKEN_RE.test(str.slice(0, off)) ? '' : m))
    .trim()
  name = lowerConnectives(unshout(name.replace(/^(home|welcome)\s+[-|:]?\s*/i, '').replace(/\s+[-|:]?\s*(home|welcome)$/i, '').replace(/[\s\-–—|:]+$/, '').trim()))
  if (name.length < 3 || name.length > MAX_LEN) return null
  if (!/[a-z]/i.test(name)) return null
  return name
}

function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)
  if (og?.[1]) return og[1]
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return title?.[1] ?? null
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SignalgentBot/1.0; +https://signalgent.com)', Accept: 'text/html' },
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!/html|xml/i.test(type)) return null
    const text = await res.text()
    return text.slice(0, 200_000)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Name from the address's domain website, or null. Tries www. first (most church
 * sites redirect the apex there), then the apex. */
export async function fetchSiteName(email: string): Promise<string | null> {
  const d = (email.split('@')[1] ?? '').trim().toLowerCase()
  if (!d || FREEMAIL_RE.test(d)) return null
  for (const host of [`www.${d}`, d]) {
    const html = await fetchHtml(`https://${host}/`)
    if (!html) continue
    const title = extractTitle(html)
    const name = title ? cleanSiteTitle(title) : null
    if (name && isSpecificName(name, { source: 'site' }) && siteNameBelongsToDomain(name, email)) return name
  }
  return null
}

/** A small ISP or hosting domain (rose.net, partnercom.net) serves a page whose
 * title is the ISP, not the church using one of its mailboxes. Accept a site
 * name only when it reads as an organization or shares a word with the domain
 * ("The Old Meeting House" for oldmeetinghouse.org). */
export function siteNameBelongsToDomain(name: string, email: string): boolean {
  const [local = '', domain = ''] = email.toLowerCase().split('@')
  if (ORG_TOKEN_RE.test(name)) return true
  // The organization is spelled in the localpart (eldoraucc@heartofiowa.net):
  // the domain is a provider, and its page title ("Heart of Iowa") is not us.
  if (localNamesOrg(local)) return false
  const label = domain.split('.')[0].replace(/[^a-z0-9]/g, '')
  const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length >= 4 && !/^(the|and|of)$/.test(w))
  return words.some((w) => label.includes(w))
}

/** The address must actually spell the name: every significant word of the
 * model's answer (minus connectives and punctuation) has to appear, squashed,
 * in the localpart or domain. Blocks "St. James Methodist" being invented
 * from stjm@gmail.com. */
function supportedByAddress(name: string, email: string): boolean {
  const hay = email.toLowerCase().replace(/[^a-z0-9]/g, '')
  const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/)
    .filter((w) => w && !/^(the|of|and|at|in|church|st|saint)$/.test(w))
  if (words.length === 0) return false
  return words.every((w) => hay.includes(w) || (w.length > 5 && hay.includes(w.slice(0, 5))))
}

/** Name read off the address by a small model, or null. */
export async function guessNameFromAddress(email: string): Promise<string | null> {
  const local = email.split('@')[0] ?? ''
  if (local.replace(/[^a-z]/gi, '').length < 6) return null
  const model = pickModel('resolve')
  const started = Date.now()
  const res = await getAnthropicClient().messages.create({
    model,
    max_tokens: 40,
    system:
      'You expand an organization email address into the organization name, only when the address spells it out. ' +
      'Reply with the name alone, in title case. Keep denomination abbreviations exactly as written in the address (ucc stays UCC, umc stays UMC, fbc stays FBC); never expand or add words the address does not contain. ' +
      'If the address is a person, a role (office, info, pastor), or anything you would have to guess at, reply exactly NONE.',
    messages: [{ role: 'user', content: email }],
  })
  const text = res.content.map((c) => ('text' in c ? c.text : '')).join('').trim()
  logUsage({
    task: 'resolve', model,
    inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens,
    cacheReadTokens: res.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
    durationMs: Date.now() - started,
  })
  if (!text || /^none\b/i.test(text) || text.length > MAX_LEN || /\n/.test(text)) return null
  if (!ORG_TOKEN_RE.test(text) || !isSpecificName(text, { source: 'address' })) return null
  // Mailbox furniture read as a name ("OFCMGR FMC UCC", "UCC At V Office"):
  // role fragments, single letters, or capitals that are not a denomination.
  if (/\b(ofc|mgr|office|staff|admin|sec|secretary|pastor|info|contact|mail)\b/i.test(text)) return null
  if (text.split(/\s+/).some((w) => w.length === 1 || (/^[A-Z]{2,}$/.test(w) && !KEEP_CAPS.has(w)))) return null
  if (!supportedByAddress(text, email)) return null
  return text
}

/** Resolve a name for one address: website first, then the address itself. */
export async function resolveOrgName(email: string): Promise<OrgName | null> {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (!domain) return null
  if (!FREEMAIL_RE.test(domain)) {
    const fromSite = await fetchSiteName(email)
    if (fromSite) return { name: fromSite, source: 'site' }
  }
  const fromAddress = await guessNameFromAddress(email).catch(() => null)
  return fromAddress ? { name: fromAddress, source: 'address' } : null
}

/** Re-check a stored name against the current rules (used to clean up names
 * written by an earlier, looser version of the resolver). Returns the name to
 * keep, possibly re-cased, or null to clear it. */
export function revalidateName(name: string, email: string, source: OrgNameSource): string | null {
  const cleaned = cleanSiteTitle(name)
  if (!cleaned || !isSpecificName(cleaned, { source })) return null
  if (source === 'site' && !siteNameBelongsToDomain(cleaned, email)) return null
  return cleaned
}
