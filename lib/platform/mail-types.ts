import type { CommunicationsMessage } from '@/lib/integrations/comms/model'
import type { ThreadMessageContext } from '@/lib/integrations/gmail/threadContext'
export interface MailList { messages: CommunicationsMessage[]; nextPageToken?: string }
export interface MailThread { threadId: string; messages: ThreadMessageContext[] }
export interface MailInput { operationId: string; to: string; cc: string; subject: string; body: string; threadId?: string }
