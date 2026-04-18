/**
 * Symmetric encryption for OAuth tokens and other provider secrets.
 *
 * Uses AES-256-GCM. The key is read from INTEGRATION_ENCRYPTION_KEY as a
 * 64-char hex string (32 bytes). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * This file is deliberately dumb: it knows nothing about databases,
 * providers, or domain concepts. encrypt() and decrypt() only.
 *
 * Ciphertext layout (all hex, joined by ':'):
 *   iv:authTag:payload
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12 // standard for GCM
const KEY_HEX_LENGTH = 64 // 32 bytes

function getKey(): Buffer {
  const hex = process.env.INTEGRATION_ENCRYPTION_KEY
  if (!hex) {
    throw new Error(
      'INTEGRATION_ENCRYPTION_KEY is not set. Generate one with ' +
      "`node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` " +
      'and set it in your environment.'
    )
  }
  if (hex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `INTEGRATION_ENCRYPTION_KEY must be ${KEY_HEX_LENGTH} hex chars (32 bytes); got ${hex.length}.`
    )
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('Malformed ciphertext: expected "iv:authTag:payload".')
  }
  const [ivHex, tagHex, payloadHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const payload = Buffer.from(payloadHex, 'hex')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Convenience: encrypt a value that may be null or undefined.
 * Returns null when input is null/undefined so callers can round-trip
 * DB columns that allow null.
 */
export function encryptNullable(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null
  return encrypt(plaintext)
}

export function decryptNullable(ciphertext: string | null | undefined): string | null {
  if (ciphertext === null || ciphertext === undefined) return null
  return decrypt(ciphertext)
}
