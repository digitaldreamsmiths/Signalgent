/**
 * Create a post on LinkedIn as the connected member.
 *
 * Uses the versioned Posts API (`/rest/posts`), which replaced ugcPosts.
 * Every call carries `LinkedIn-Version` (a yyyymm release, each supported
 * for about a year). The default below is overridable with
 * LINKEDIN_API_VERSION so a retired version can be bumped without a deploy
 * of code. Requires the `w_member_social` scope, granted by the "Share on
 * LinkedIn" product on the LinkedIn app.
 *
 * The response carries the new post URN in the `x-restli-id` header and
 * no body. Errors are translated into short sentences for the editor.
 */

const POSTS_URL = 'https://api.linkedin.com/rest/posts'
const DEFAULT_VERSION = '202601'

export class LinkedInPublishError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

/**
 * LinkedIn's "little text" format treats these characters as markup. Escaping
 * them makes the text appear exactly as written. `#` is left alone so hashtags
 * stay hashtags.
 */
export function escapeCommentary(text: string): string {
  return text.replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`)
}

export function postUrl(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${postUrn}/`
}

export function translateLinkedInError(status: number, body: string): string {
  let detail = ''
  try { const parsed = JSON.parse(body) as { message?: string }; detail = parsed.message ?? '' } catch { detail = body }
  detail = detail.trim().slice(0, 200)
  if (status === 401) return 'LinkedIn no longer accepts the saved sign-in. Reconnect the account.'
  if (status === 403) return 'This LinkedIn account cannot post. Reconnect it and allow posting.'
  if (status === 422 && /duplicate/i.test(detail)) return 'LinkedIn rejected this as a duplicate of a recent post.'
  if (status === 426 || /version/i.test(detail)) return 'LinkedIn retired this API version. Set LINKEDIN_API_VERSION to a current release.'
  if (status === 429) return 'LinkedIn rate limit reached. Try again later.'
  return detail ? `LinkedIn rejected the post: ${detail}` : `LinkedIn rejected the post (${status}).`
}

export async function createTextPost(args: { accessToken: string; memberSub: string; text: string }): Promise<{ postUrn: string; url: string }> {
  const res = await fetch(POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': process.env.LINKEDIN_API_VERSION ?? DEFAULT_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${args.memberSub}`,
      commentary: escapeCommentary(args.text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  if (!res.ok) throw new LinkedInPublishError(translateLinkedInError(res.status, await res.text()), res.status)
  const postUrn = res.headers.get('x-restli-id')
  if (!postUrn) throw new LinkedInPublishError('LinkedIn accepted the post but returned no post id. Check your feed before trying again.', res.status)
  return { postUrn, url: postUrl(postUrn) }
}
