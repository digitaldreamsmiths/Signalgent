/**
 * Deliverability preflight — Phase 2 of docs/specs/signalgent-govcon-v1.md.
 *
 * A stranger who connects a mailbox and starts sending without SPF/DKIM/DMARC
 * lands in spam, blames the tool, and burns their domain doing it. These are
 * plain DNS lookups (no third-party service, no key) turned into pass / warn /
 * fail verdicts with a concrete fix for each.
 *
 * Split deliberately:
 *   - `evaluate*` are PURE functions over raw record strings — unit-testable
 *     without touching DNS.
 *   - the lookup helpers do the I/O, mirroring deliverability.ts: short
 *     timeout, and any transient/unknown DNS error resolves to 'unknown'
 *     rather than a scary red failure the user can't act on.
 *
 * Node runtime only (node:dns). Called from a server action.
 */

import { promises as dns } from 'node:dns'

const TIMEOUT_MS = 4000

/** Selectors we probe for DKIM. DKIM selectors are arbitrary, so a miss here
 * means "couldn't verify", never "not configured". Google Workspace's default
 * is `google`; the rest cover the common ESPs a govcon shop is likely to use. */
const DKIM_SELECTORS = ['google', 'default', 'selector1', 'selector2', 'k1', 'k2', 'mail', 'dkim', 's1', 's2', 'mandrill', 'zoho']

export type Verdict = 'pass' | 'warn' | 'fail' | 'unknown'

export interface CheckResult {
  key: 'sender_domain' | 'spf' | 'dkim' | 'dmarc' | 'mx' | 'tracking_domain'
  label: string
  verdict: Verdict
  /** One line on what was found. */
  detail: string
  /** What to do about it, when it isn't a pass. */
  fix?: string
}

export interface DomainCheck {
  domain: string
  results: CheckResult[]
  /** Worst verdict across the checks — drives the summary badge. */
  overall: Verdict
  checked_at: string
}

// ── Pure evaluators ──────────────────────────────────────────────────────────

/** Mechanisms that each cost a DNS lookup against SPF's hard limit of 10. */
const LOOKUP_MECHANISMS = /\b(include:|a[:\s]|mx[:\s]|ptr[:\s]?|exists:|redirect=)/g

export function countSpfLookups(record: string): number {
  return (record.match(LOOKUP_MECHANISMS) ?? []).length
}

/** Provider → the SPF include that authorizes it, for the alignment check. */
const PROVIDER_INCLUDE: Record<string, { needle: RegExp; label: string; include: string }> = {
  // `redirect=` authorizes just as validly as `include:` — gmail.com's own
  // record is "v=spf1 redirect=_spf.google.com", and matching only include:
  // reported a false failure against it.
  gmail: { needle: /(include:|redirect=)_?spf\.google\.com|include:google\.com/i, label: 'Gmail / Google Workspace', include: 'include:_spf.google.com' },
  resend: { needle: /(include:|redirect=)(amazonses\.com|_spf\.resend\.com)/i, label: 'Resend', include: 'include:_spf.resend.com' },
}

/** Consumer mailbox domains. You cannot publish DNS for these, so SPF/DKIM/
 * DMARC advice about them is unactionable noise — the real finding is the
 * sending address itself. Mirrors FREE_PROVIDERS in the workspace UI. */
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'fastmail.com', 'hey.com',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net',
])

export function isConsumerDomain(domain: string): boolean {
  return CONSUMER_DOMAINS.has(domain.trim().toLowerCase())
}

/** The finding that replaces SPF/DKIM/DMARC when you send from a mailbox
 * domain you don't control. */
export function evaluateConsumerSender(domain: string): CheckResult {
  return {
    key: 'sender_domain',
    label: 'Sending domain',
    verdict: 'fail',
    detail: `You’re sending from ${domain}, a consumer mailbox domain. You can’t publish SPF, DKIM, or DMARC for it, and cold outreach from consumer addresses is heavily filtered — bulk-sender rules at Google and Yahoo expect authenticated mail from a domain you own.`,
    fix: 'Send from a domain you control (e.g. you@yourcompany.com, or a dedicated subdomain). Connect that mailbox, then re-run these checks.',
  }
}

/** `txt` = every TXT record on the domain. `provider` (when given) adds the
 * alignment check: sending through a provider your SPF doesn't authorize is a
 * silent SPF failure on every message. */
export function evaluateSpf(txt: string[], provider?: string): CheckResult {
  const spf = txt.filter((r) => /^v=spf1\b/i.test(r.trim()))
  if (spf.length === 0) {
    return {
      key: 'spf',
      label: 'SPF',
      verdict: 'fail',
      detail: 'No SPF record found.',
      fix: 'Add a TXT record on this domain listing who may send for you. For Google Workspace: "v=spf1 include:_spf.google.com ~all".',
    }
  }
  if (spf.length > 1) {
    return {
      key: 'spf',
      label: 'SPF',
      verdict: 'fail',
      detail: `${spf.length} SPF records found — more than one is invalid and receivers treat SPF as broken.`,
      fix: 'Merge them into a single "v=spf1 …" TXT record and delete the extras.',
    }
  }
  const record = spf[0].trim()
  const lookups = countSpfLookups(record)
  // Provider alignment first: it's the failure that actually costs delivery on
  // every send, where the rest are hardening.
  const expect = provider ? PROVIDER_INCLUDE[provider] : undefined
  if (expect && !expect.needle.test(record)) {
    return {
      key: 'spf',
      label: 'SPF',
      verdict: 'warn',
      detail: `SPF doesn’t authorize ${expect.label}, but that’s what you send through — messages can fail SPF.`,
      fix: `Add "${expect.include}" to the SPF record for this domain (unless you relay through something else that is already listed).`,
    }
  }
  if (/[?+]all\s*$/i.test(record)) {
    return {
      key: 'spf',
      label: 'SPF',
      verdict: 'warn',
      detail: `SPF ends in "${record.match(/[?+]all/i)?.[0]}", which tells receivers to accept mail from anyone.`,
      fix: 'End the record with "~all" (softfail) or "-all" (hardfail) so SPF actually protects the domain.',
    }
  }
  if (lookups > 10) {
    return {
      key: 'spf',
      label: 'SPF',
      verdict: 'warn',
      detail: `SPF uses about ${lookups} DNS lookups; the limit is 10 and going over makes it fail.`,
      fix: 'Remove unused include: mechanisms, or flatten them into IP ranges.',
    }
  }
  // `redirect=` delegates the whole policy (including `all`) to another record,
  // and RFC 7208 says the two must not coexist — so "no all" is correct there,
  // not a finding.
  const hasRedirect = /\bredirect=/i.test(record)
  if (!hasRedirect && !/[~-]all\s*$/i.test(record)) {
    return {
      key: 'spf',
      label: 'SPF',
      verdict: 'warn',
      detail: 'SPF record has no "all" mechanism at the end, so receivers get no instruction for unlisted senders.',
      fix: 'Append "~all" to the end of the record.',
    }
  }
  return {
    key: 'spf',
    label: 'SPF',
    verdict: 'pass',
    detail: `Valid SPF record${lookups > 7 ? ` (${lookups} of 10 DNS lookups used)` : ''}.`,
  }
}

/**
 * `txt` = TXT at `_dmarc.<domain>`; `orgTxt` = TXT at `_dmarc.<base domain>`.
 *
 * Receivers fall back to the organizational domain's policy when a subdomain
 * has none (RFC 7489 §6.6.3), so a subdomain sender with no record of its own
 * is still covered — reporting that as "no DMARC" is a false alarm.
 */
export function evaluateDmarc(txt: string[], orgTxt: string[] = []): CheckResult {
  const find = (rs: string[]) => rs.map((r) => r.trim()).find((r) => /^v=DMARC1\b/i.test(r))
  const own = find(txt)
  const inherited = own ? undefined : find(orgTxt)
  const rec = own ?? inherited
  if (!rec) {
    return {
      key: 'dmarc',
      label: 'DMARC',
      verdict: 'fail',
      detail: 'No DMARC record found.',
      fix: 'Add a TXT record at _dmarc.<your domain>. Start in monitoring mode: "v=DMARC1; p=none; rua=mailto:you@yourdomain.com", then tighten to p=quarantine once reports look clean.',
    }
  }
  // An inherited policy counts, but say so — and honor sp= (subdomain policy)
  // when the parent sets one, since that's what actually applies here.
  if (inherited) {
    const sp = rec.match(/\bsp\s*=\s*(none|quarantine|reject)\b/i)?.[1]?.toLowerCase()
    const effective = sp ?? rec.match(/\bp\s*=\s*(none|quarantine|reject)\b/i)?.[1]?.toLowerCase()
    if (!effective) {
      return { key: 'dmarc', label: 'DMARC', verdict: 'warn', detail: 'Inherited a DMARC record from the parent domain, but its policy is missing or unrecognized.', fix: 'Fix the parent record, or publish one for this subdomain.' }
    }
    return {
      key: 'dmarc',
      label: 'DMARC',
      verdict: effective === 'none' ? 'warn' : 'pass',
      detail: `No record on this subdomain, but it inherits p=${effective} from the parent domain${sp ? ' (via sp=)' : ''} — which is what receivers apply.`,
      fix: effective === 'none' ? 'The inherited policy only monitors. Tighten the parent to "p=quarantine", or publish a stricter record for this subdomain.' : undefined,
    }
  }
  const policy = rec.match(/\bp\s*=\s*(none|quarantine|reject)\b/i)?.[1]?.toLowerCase()
  const hasRua = /\brua\s*=/i.test(rec)
  if (policy === 'none') {
    return {
      key: 'dmarc',
      label: 'DMARC',
      verdict: 'warn',
      detail: 'DMARC is set to p=none — monitoring only, nothing is enforced.',
      fix: hasRua
        ? 'Fine as a starting point. Once your aggregate reports look clean, move to "p=quarantine".'
        : 'Add "rua=mailto:you@yourdomain.com" so you receive reports, then move to "p=quarantine" once they look clean.',
    }
  }
  if (policy === 'quarantine' || policy === 'reject') {
    return {
      key: 'dmarc',
      label: 'DMARC',
      verdict: hasRua ? 'pass' : 'warn',
      detail: `DMARC enforced with p=${policy}${hasRua ? '' : ', but no rua= reporting address'}.`,
      fix: hasRua ? undefined : 'Add "rua=mailto:you@yourdomain.com" so you can see who is sending as your domain.',
    }
  }
  return {
    key: 'dmarc',
    label: 'DMARC',
    verdict: 'warn',
    detail: 'DMARC record found but its policy (p=) is missing or unrecognized.',
    fix: 'Include a policy, e.g. "v=DMARC1; p=quarantine; rua=mailto:you@yourdomain.com".',
  }
}

/** `found` = selectors that returned a DKIM-looking TXT record. */
export function evaluateDkim(found: string[]): CheckResult {
  if (found.length === 0) {
    return {
      key: 'dkim',
      label: 'DKIM',
      verdict: 'warn',
      detail: 'No DKIM key found at the selectors we check. It may still be set up under a custom selector.',
      fix: 'In Google Workspace: Apps → Google Workspace → Gmail → Authenticate email → generate the key and publish the TXT record it gives you (selector "google").',
    }
  }
  return {
    key: 'dkim',
    label: 'DKIM',
    verdict: 'pass',
    detail: `DKIM key published (selector${found.length > 1 ? 's' : ''}: ${found.join(', ')}).`,
  }
}

export function evaluateMx(hosts: string[]): CheckResult {
  if (hosts.length === 0) {
    return {
      key: 'mx',
      label: 'Inbound mail (MX)',
      verdict: 'fail',
      detail: 'No MX record — this domain cannot receive mail, so replies would bounce.',
      fix: 'Point MX at your mail provider before sending from this domain.',
    }
  }
  return { key: 'mx', label: 'Inbound mail (MX)', verdict: 'pass', detail: `${hosts.length} MX record${hosts.length === 1 ? '' : 's'} — replies can reach you.` }
}

/** Registrable-ish suffix: last two labels ("mail.acme.co.uk" → "co.uk" is
 * wrong, but two labels is right for the domains this app actually sees and
 * keeps the check dependency-free). Used only to compare sending vs tracking
 * domain, where a false "different" is a warn, never a block. */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.')
  return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.')
}

/**
 * Tracking pixels and unsubscribe links live on NEXT_PUBLIC_APP_URL. A link
 * whose domain doesn't match the sending domain is itself a spam signal — and
 * *.vercel.app is heavily filtered on top of that.
 */
export function evaluateTrackingDomain(sendingDomain: string, appUrl: string | undefined): CheckResult {
  const label = 'Tracking domain'
  if (!appUrl?.trim()) {
    return {
      key: 'tracking_domain',
      label,
      verdict: 'warn',
      detail: 'No app URL configured, so open tracking and one-click unsubscribe links are disabled.',
      fix: 'Set NEXT_PUBLIC_APP_URL to a domain that matches your sending domain.',
    }
  }
  let host: string
  try {
    host = new URL(appUrl.trim()).hostname
  } catch {
    return { key: 'tracking_domain', label, verdict: 'warn', detail: `App URL "${appUrl}" isn’t a valid URL.`, fix: 'Set NEXT_PUBLIC_APP_URL to a full URL, e.g. https://go.yourdomain.com.' }
  }
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(host)) {
    return {
      key: 'tracking_domain',
      label,
      verdict: 'fail',
      detail: `Links point at "${host}" — a local address that recipients can’t open.`,
      fix: 'Set NEXT_PUBLIC_APP_URL to your production domain before sending.',
    }
  }
  // Aligning links to a consumer mailbox domain is impossible (and meaningless),
  // so those senders get the shared-domain warning without the alignment advice.
  const consumer = isConsumerDomain(sendingDomain)
  if (/\.vercel\.app$/i.test(host)) {
    return {
      key: 'tracking_domain',
      label,
      verdict: 'warn',
      detail: `Links point at "${host}". Shared *.vercel.app domains are widely filtered${consumer ? '.' : ', and the mismatch with your sending domain is itself a spam signal.'}`,
      fix: consumer
        ? 'Point NEXT_PUBLIC_APP_URL at a domain you own, ideally matching the domain you send from.'
        : `Point NEXT_PUBLIC_APP_URL at a subdomain of ${baseDomain(sendingDomain)} (e.g. go.${baseDomain(sendingDomain)}) and add the CNAME your host gives you.`,
    }
  }
  if (consumer) {
    return { key: 'tracking_domain', label, verdict: 'pass', detail: `Links use "${host}".` }
  }
  if (baseDomain(host) !== baseDomain(sendingDomain)) {
    return {
      key: 'tracking_domain',
      label,
      verdict: 'warn',
      detail: `Links use "${host}" but you send from "${sendingDomain}" — a domain mismatch receivers read as a spam signal.`,
      fix: `Move link tracking to a subdomain of ${baseDomain(sendingDomain)}.`,
    }
  }
  return { key: 'tracking_domain', label, verdict: 'pass', detail: `Links use "${host}", aligned with your sending domain.` }
}

// ── DNS I/O ──────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS))])
}

/** TXT records, chunk-joined per RFC (long records arrive split). `null`
 * distinguishes a lookup failure from a domain with no TXT records. */
async function resolveTxtJoined(name: string): Promise<string[] | null> {
  try {
    const records = await dns.resolveTxt(name)
    return records.map((chunks) => chunks.join(''))
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    // ENODATA/ENOTFOUND = definitively nothing there; anything else = unknown.
    return code === 'ENODATA' || code === 'ENOTFOUND' || code === 'NXDOMAIN' ? [] : null
  }
}

const UNKNOWN = (key: CheckResult['key'], label: string): CheckResult => ({
  key,
  label,
  verdict: 'unknown',
  detail: 'DNS lookup didn’t complete — try again in a moment.',
})

const RANK: Record<Verdict, number> = { pass: 0, unknown: 1, warn: 2, fail: 3 }

/** Run every check for a sending domain. Never throws. */
export async function checkSendingDomain(
  domain: string,
  appUrl: string | undefined,
  opts: { provider?: string; now?: Date } = {},
): Promise<DomainCheck> {
  const clean = domain.trim().toLowerCase().replace(/^@/, '')

  // Consumer mailbox domain: SPF/DKIM/DMARC are Google's or Yahoo's to publish,
  // not the user's, so reporting them as failures would hand out advice nobody
  // can act on. Report the sending address itself, plus the checks that still
  // mean something.
  if (isConsumerDomain(clean)) {
    const results = [evaluateConsumerSender(clean), evaluateTrackingDomain(clean, appUrl)]
    return { domain: clean, results, overall: 'fail', checked_at: (opts.now ?? new Date()).toISOString() }
  }

  const org = baseDomain(clean)
  const dkimNames = org === clean ? [clean] : [clean, org] // subdomain senders often key on the parent

  const [txt, dmarcTxt, orgDmarcTxt, dkimHits, mx] = await Promise.all([
    withTimeout(resolveTxtJoined(clean), null),
    withTimeout(resolveTxtJoined(`_dmarc.${clean}`), null),
    // Organizational-domain policy, which receivers fall back to for subdomains.
    org === clean ? Promise.resolve([]) : withTimeout(resolveTxtJoined(`_dmarc.${org}`), null),
    withTimeout(
      Promise.all(
        dkimNames.flatMap((name) =>
          DKIM_SELECTORS.map(async (sel) => {
            const recs = await resolveTxtJoined(`${sel}._domainkey.${name}`)
            return recs?.some((r) => /(^|;)\s*(v=DKIM1|k=rsa|p=)/i.test(r)) ? sel : null
          }),
        ),
      ).then((hits) => [...new Set(hits.filter((s): s is string => !!s))]),
      null,
    ),
    withTimeout(
      dns.resolveMx(clean).then(
        (r) => r.map((m) => m.exchange),
        () => null,
      ),
      null,
    ),
  ])

  const results: CheckResult[] = [
    txt === null ? UNKNOWN('spf', 'SPF') : evaluateSpf(txt, opts.provider),
    dkimHits === null ? UNKNOWN('dkim', 'DKIM') : evaluateDkim(dkimHits),
    dmarcTxt === null ? UNKNOWN('dmarc', 'DMARC') : evaluateDmarc(dmarcTxt, orgDmarcTxt ?? []),
    mx === null ? UNKNOWN('mx', 'Inbound mail (MX)') : evaluateMx(mx),
    evaluateTrackingDomain(clean, appUrl),
  ]

  const overall = results.reduce<Verdict>((worst, r) => (RANK[r.verdict] > RANK[worst] ? r.verdict : worst), 'pass')
  return { domain: clean, results, overall, checked_at: (opts.now ?? new Date()).toISOString() }
}
