-- Follow-up threading: remember the Gmail thread + RFC822 Message-ID of each
-- sent email so later touches can reply into the same conversation (In-Reply-To
-- / References + threadId).

alter table public.outreach_sends
  add column thread_id text,
  add column message_id_header text;
