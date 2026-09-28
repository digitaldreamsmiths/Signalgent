import type { OfferProfile } from '@/lib/integrations/outreach/offer-profile'

export interface CompanyProfileInput {
  description: string
  contact_email: string
  contact_phone: string
  linkedin_name: string
  instagram_name: string
  facebook_name: string
  pinterest_name: string
}

export const EMPTY_COMPANY_PROFILE: CompanyProfileInput = {
  description: '', contact_email: '', contact_phone: '', linkedin_name: '',
  instagram_name: '', facebook_name: '', pinterest_name: '',
}

export const EMPTY_OFFER_PROFILE: OfferProfile = {
  product: '', site: '', sign_off: 'Best', signature_name: '', user_count: '',
  pipeline: '', audience: '', pitch: '', artifacts: [],
}

export function companyProfileValues(input: CompanyProfileInput): CompanyProfileInput {
  return {
    description: input.description.trim(), contact_email: input.contact_email.trim().toLowerCase(),
    contact_phone: input.contact_phone.trim(), linkedin_name: input.linkedin_name.trim(),
    instagram_name: input.instagram_name.trim(), facebook_name: input.facebook_name.trim(),
    pinterest_name: input.pinterest_name.trim(),
  }
}
