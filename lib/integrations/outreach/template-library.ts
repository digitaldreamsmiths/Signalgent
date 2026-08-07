/**
 * The five built-in fallback variants, plus the starter set offered in the
 * template editor — now rendered against a tenant's offer profile (Phase 0 of
 * docs/specs/signalgent-govcon-v1.md).
 *
 * These replaced a single hardcoded email after a 344-send run returned zero
 * replies. Every variant obeys the same shape, which is what the reply rate
 * actually turns on:
 *   - opens with a question the recipient can answer in one line,
 *   - names one concrete artifact (via profile.pitch),
 *   - carries real social proof (profile.user_count / profile.pipeline),
 *   - ENDS on a question mark, with no "either way" release valve after it.
 * `replyRiskWarnings` in ./hygiene is the machine-checkable form of those rules,
 * and the editor runs it against user-authored copy as it is typed.
 *
 * Each variant asks a DIFFERENT question — process, capacity, past performance,
 * timing, routing — so the rotation is a real test of which ask lands rather
 * than five rewordings of one pitch. The QUESTIONS remain proposal-domain: the
 * built-ins are the fallback of last resort, and a tenant with a different
 * offer authors their own templates in the editor (user templates always win
 * the rotation when any are active).
 *
 * Bodies carry no sign-off: `composeEmail` appends the company's configured
 * signature, so the sender's own name and site win over anything hardcoded here.
 *
 * Client-safe: imports nothing but ./offer-profile.
 */

import { DEFAULT_OFFER_PROFILE, userCountMid, type OfferProfile } from './offer-profile'

/** One rotation variant: an opener and the follow-up that belongs with it. The
 * follow-up is paired rather than generic so touch 2 continues touch 1's
 * question instead of restating the pitch. */
export interface TemplateVariant {
  key: string
  name: string
  subject: string
  body: string
  followupSubject: string
  followupBody: string
}

/** The built-in variants, with the tenant's product, pitch, and social proof
 * interpolated. `p.pitch` should be one or two concrete sentences; it lands
 * mid-paragraph, so it must read as prose. */
export function templateLibraryFor(p: OfferProfile): readonly TemplateVariant[] {
  return [
    {
      key: 'process',
      name: 'Who writes them (process)',
      subject: 'who writes your proposals?',
      body: [
        'Hi,',
        '',
        'Is proposal writing handled in house at {company}, or do you bring someone in for the bigger pursuits?',
        '',
        `I ask because I work on ${p.product}. ${p.pitch} ${p.user_count} run on it now, across ${p.pipeline}.`,
        '',
        'If drafting is the slow part for you, want me to send a two minute example of it on a real RFP?',
      ].join('\n'),
      followupSubject: 'who writes your proposals?',
      followupBody: [
        'Hi,',
        '',
        `One more note and then I will leave it alone. The firms getting the most out of ${p.product} are the ones bidding more than they can comfortably write.`,
        '',
        'Is that the situation at {company} right now, or are you staffed fine for the pipeline you have?',
      ].join('\n'),
    },
    {
      key: 'capacity',
      name: 'Bid / no-bid (capacity)',
      subject: 'bid / no bid',
      body: [
        'Hi,',
        '',
        'How many solicitations does {company} pass on in a month purely because there is not enough runway to write the response properly?',
        '',
        `That gap is the reason ${p.product} exists. ${p.pitch} ${p.user_count} use it, across ${p.pipeline}.`,
        '',
        'Is capacity what caps your bid count right now, or is it something else?',
      ].join('\n'),
      followupSubject: 'bid / no bid',
      followupBody: [
        'Hi,',
        '',
        `Short version of my last note: ${p.product} exists so a thin week stops deciding what you bid.`,
        '',
        'Is bid capacity actually a constraint for you, or am I aiming at the wrong problem?',
      ].join('\n'),
    },
    {
      key: 'past_performance',
      name: 'Past performance library',
      subject: 'past performance question',
      body: [
        'Hi,',
        '',
        'Where does {company} keep past performance today, a shared drive, a laptop somewhere, or an actual library?',
        '',
        `Asking because it is the piece contractors tell me eats the most time on a deadline. ${p.pitch} ${p.user_count} use it, across ${p.pipeline}.`,
        '',
        'Is past performance the part that slows you down, or is drafting worse?',
      ].join('\n'),
      followupSubject: 'past performance question',
      followupBody: [
        'Hi,',
        '',
        'My last note was about past performance. The fix most firms want turns out to be boring: one place to keep the write ups, and something that reshapes them for the Section L in front of them.',
        '',
        'Is that worth solving at {company}, or is it already handled?',
      ].join('\n'),
    },
    {
      key: 'recompete',
      name: 'Recompete timing',
      subject: 'recompete question',
      body: [
        'Hi,',
        '',
        'Do you have a recompete coming up in the next couple of quarters at {company}?',
        '',
        `If so, that is usually where the crunch shows. ${p.pitch} ${p.user_count} use it now, across ${p.pipeline}.`,
        '',
        'Worth a look before the next one drops, or is your process already tight?',
      ].join('\n'),
      followupSubject: 'recompete question',
      followupBody: [
        'Hi,',
        '',
        `Adding one thing to my last note: on a recompete the crunch is rarely the strategy, it is the production. That is the part ${p.product} takes.`,
        '',
        'Do you have one coming that is already on your mind?',
      ].join('\n'),
    },
    {
      key: 'routing',
      name: 'Routing / referral ask',
      subject: 'quick one',
      body: [
        'Hi,',
        '',
        'Who owns proposal production at {company} these days?',
        '',
        `Happy to be pointed elsewhere if it is not you. The reason I ask: I work on ${p.product}, which ${userCountMid(p)} use, across ${p.pipeline}. ${p.pitch}`,
        '',
        'If that is worth two minutes, I will send a short example on a real RFP. Who should I be talking to?',
      ].join('\n'),
      followupSubject: 'quick one',
      followupBody: [
        'Hi,',
        '',
        'If proposal production is not yours, no problem at all.',
        '',
        'Would you point me to whoever owns it at {company}?',
      ].join('\n'),
    },
  ]
}

/** The default-profile library, for client surfaces that have no tenant profile
 * in hand yet (the template editor's starters). */
export const TEMPLATE_LIBRARY: readonly TemplateVariant[] = templateLibraryFor(DEFAULT_OFFER_PROFILE)
