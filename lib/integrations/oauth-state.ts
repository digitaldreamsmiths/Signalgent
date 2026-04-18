/**
 * OAuth state tokens.
 *
 * The `state` parameter in OAuth is our opportunity to bind the callback back
 * to the initiating user and prevent CSRF. We do two things:
 *
 *   1. Embed a payload (companyId, service, userId, issued-at, expires-at,
 *      nonce).
 *   2. Sign the whole thing with HMAC-SHA256 using OAUTH_STATE_SECRET.
 *
 * Transport format is a compact base64url string: `payloadB64.signatureB64`.
 * No DB writes required — the callback validates the signature and expiry
 * statelessly, then re-checks that the authenticated user matches.
 *
 * If you rotate OAUTH_STATE_SECRET, any in-flight OAuth flows fail
 * verification. That is the correct behavior.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const DEFAULT_TTL_SEC = 10 * 60 // 10 minutes is generous for a redirect flow

interface StatePayload {
  companyId: string
  service: string
  userId: string
  iat: number // issued at, unix seconds
  exp: number // expires at, unix seconds
  nonce: string // prevents identical payloads from colliding
}

function getSecret(): Buffer {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) {
    throw new Error(
      'OAUTH_STATE_SECRET is not set. Generate one with ' +
      "`node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` " +
      'and set it in your environment.'
    )
  }
  if (secret.length < 32) {
    throw new Error('OAUTH_STATE_SECRET must be at least 32 chars.')
  }
  return Buffer.from(secret, 'utf8')
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function sign(payload: Buffer, secret: Buffer): Buffer {
  return createHmac('sha256', secret).update(payload).digest()
}

/**
 * Create a signed, time-limited state token.
 */
export function issueState(args: {
  companyId: string
  service: string
  userId: string
  ttlSec?: number
}): string {
  const now = Math.floor(Date.now() / 1000)
  const ttl = args.ttlSec ?? DEFAULT_TTL_SEC
  const payload: StatePayload = {
    companyId: args.companyId,
    service: args.service,
    userId: args.userId,
    iat: now,
    exp: now + ttl,
    nonce: randomBytes(8).toString('hex'),
  }
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8')
  const sig = sign(payloadBuf, getSecret())
  return `${b64urlEncode(payloadBuf)}.${b64urlEncode(sig)}`
}

export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidStateError'
  }
}

/**
 * Verify a state token. Throws InvalidStateError on any failure.
 */
export function verifyState(token: string): StatePayload {
  if (!token || typeof token !== 'string') {
    throw new InvalidStateError('Missing state')
  }
  const parts = token.split('.')
  if (parts.length !== 2) {
    throw new InvalidStateError('Malformed state')
  }
  const [payloadB64, sigB64] = parts

  let payloadBuf: Buffer
  let sigBuf: Buffer
  try {
    payloadBuf = b64urlDecode(payloadB64)
    sigBuf = b64urlDecode(sigB64)
  } catch {
    throw new InvalidStateError('State is not valid base64url')
  }

  const expected = sign(payloadBuf, getSecret())
  if (expected.length !== sigBuf.length || !timingSafeEqual(expected, sigBuf)) {
    throw new InvalidStateError('State signature does not verify')
  }

  let payload: StatePayload
  try {
    payload = JSON.parse(payloadBuf.toString('utf8')) as StatePayload
  } catch {
    throw new InvalidStateError('State payload is not valid JSON')
  }

  const now = Math.floor(Date.now() / 1000)
  if (!payload.exp || payload.exp < now) {
    throw new InvalidStateError('State has expired')
  }
  if (!payload.companyId || !payload.service || !payload.userId) {
    throw new InvalidStateError('State is missing required fields')
  }

  return payload
}
