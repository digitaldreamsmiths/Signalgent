import { redirect } from 'next/navigation'

/** /outreach has no view of its own — send it to the default section so old
 * links, the topbar wordmark, and the command palette all keep working. */
export default function OutreachIndexPage() {
  redirect('/outreach/pipeline')
}
