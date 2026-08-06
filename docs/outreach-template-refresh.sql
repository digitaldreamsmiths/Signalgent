-- Outreach template refresh — run manually against the prod database.
--
-- Replaces the fallback rotation after a 344-send run returned zero replies.
-- The five old templates all made the SAME ask ("reply with the solicitation
-- number and I'll run a free analysis"), so the rotation varied only the opening
-- paragraph and never tested the variable that produces a reply. Each variant
-- below asks a DIFFERENT question: process, capacity, past performance,
-- recompete timing, routing.
--
-- Same copy as TEMPLATE_LIBRARY in lib/integrations/outreach/template-library.ts;
-- keep the two in sync if you edit one.
--
-- NOT a migration: it rewrites user data for ONE company, so it is run
-- deliberately, never applied automatically.
--
-- Bodies carry no sign-off. composeEmail() appends the signature from the
-- company's send settings, so the configured sender name and site win.
--
-- The company uuid below is SourceGent's, read from the running app. If you ever
-- need a different company, replace all occurrences of the uuid.
-- Plain SQL only, so this runs in the Supabase SQL editor as well as psql.

begin;

-- 0. Sanity check: confirm this is the company you mean before the mutation.
select id, name from public.companies
where id = 'f8d5013c-b274-4b56-b6f7-7017e2cdecd6'::uuid;

-- 1. Record the current templates, in case you want the old rows back.
select id, name, active, weight, left(subject, 60) as subject
from public.outreach_templates
where company_id = 'f8d5013c-b274-4b56-b6f7-7017e2cdecd6'::uuid
order by created_at;

-- 2. Retire the old set. DEACTIVATE rather than delete: outreach_drafts.template_id
--    keeps pointing at these rows, so historical per-template stats survive.
update public.outreach_templates
set active = false
where company_id = 'f8d5013c-b274-4b56-b6f7-7017e2cdecd6'::uuid and active;

-- 3. The new rotation, equal weight so the A/B starts fair.
insert into public.outreach_templates (company_id, name, subject, body, weight, active)
values
  ('f8d5013c-b274-4b56-b6f7-7017e2cdecd6'::uuid, 'Who writes them (process)', 'who writes your proposals?', 'Hi,

Is proposal writing handled in house at {company}, or do you bring someone in for the bigger pursuits?

I ask because I work on SourceGent. Contractors use it to shred a solicitation into a compliance matrix and get a first draft back the same day, in their voice, on their strategy. About twenty contractors run on it now, across over $4M in active pursuits.

If drafting is the slow part for you, want me to send a two minute example of it on a real RFP?', 1, true),
  ('f8d5013c-b274-4b56-b6f7-7017e2cdecd6'::uuid, 'Bid / no-bid (capacity)', 'bid / no bid', 'Hi,

How many solicitations does {company} pass on in a month purely because there is not enough runway to write the response properly?

That gap is the reason SourceGent exists. It shreds the solicitation, builds the compliance matrix, and hands back a first draft, so a thin week stops deciding what you bid. About twenty contractors use it, across over $4M in active pursuits.

Is capacity what caps your bid count right now, or is it something else?', 1, true),
  ('f8d5013c-b274-4b56-b6f7-7017e2cdecd6'::uuid, 'Past performance library', 'past performance question', 'Hi,

Where does {company} keep past performance today, a shared drive, a laptop somewhere, or an actual library?

Asking because it is the piece contractors tell me eats the most time on a deadline: hunting the right write up, then reshaping it for this Section L. SourceGent keeps it organized and pulls the matching one into the draft. About twenty contractors use it, across over $4M in active pursuits.

Is past performance the part that slows you down, or is drafting worse?', 1, true),
  ('f8d5013c-b274-4b56-b6f7-7017e2cdecd6'::uuid, 'Recompete timing', 'recompete question', 'Hi,

Do you have a recompete coming up in the next couple of quarters at {company}?

If so, that is usually where the crunch shows. SourceGent shreds the solicitation into a compliance matrix and returns a first draft the same day, so the team spends its hours on win themes instead of formatting. About twenty contractors use it now, across over $4M in active pursuits.

Worth a look before the next one drops, or is your process already tight?', 1, true),
  ('f8d5013c-b274-4b56-b6f7-7017e2cdecd6'::uuid, 'Routing / referral ask', 'quick one', 'Hi,

Who owns proposal production at {company} these days?

Happy to be pointed elsewhere if it is not you. The reason I ask: I work on SourceGent, which about twenty contractors use to turn a solicitation into a compliance matrix and a first draft the same day, across over $4M in active pursuits.

If that is worth two minutes, I will send a short example on a real RFP. Who should I be talking to?', 1, true);

-- 4. Confirm: expect exactly 5 active rows.
select name, weight, active, left(subject, 60) as subject
from public.outreach_templates
where company_id = 'f8d5013c-b274-4b56-b6f7-7017e2cdecd6'::uuid and active
order by name;

commit;

-- Rollback before commit:  rollback;
-- After commit: set active = true on the ids from step 1, and active = false on
-- the five inserted here.

