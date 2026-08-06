/**
 * Sender identity and the social proof every outreach surface reads from.
 *
 * Its own module (rather than living in draft.ts) so client components — the
 * template editor and its starter library — can import it without pulling the
 * Anthropic SDK into the browser bundle.
 *
 * Keeping the numbers in one place means a stale figure can't survive in one
 * template after the others are updated. Change them HERE when the user count
 * or pipeline value moves, and every template plus the Stage 3 draft prompt
 * follow.
 */
export const SENDER = {
  product: 'SourceGent',
  site: 'sourcegent.io',
  signOff: 'Best',
  signatureName: 'Eudon Delemar', // sender; change here if outreach is sent under another name
  /** Live user base, phrased for prose. Deliberately approximate, never inflated. */
  userCount: 'About twenty contractors',
  /** Aggregate federal work the user base is pursuing with it. */
  pipeline: 'over $4M in active pursuits',
}

/** Lowercased mid-sentence form of the user count ("...which about twenty..."). */
export const userCountMid = SENDER.userCount.charAt(0).toLowerCase() + SENDER.userCount.slice(1)
