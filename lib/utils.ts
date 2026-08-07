import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize a user-typed website — "www.acme.com", "acme.com/about" — to a
 * full URL by prepending https:// when the scheme is missing. Empty → null.
 * Forms accept bare domains (input type="text"), so storage normalizes. */
export function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}
