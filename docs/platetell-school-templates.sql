-- PlateTell school (PTA/PTO) campaign templates — run manually against prod.
--
-- Three openers plus a nudge each, scoped to the school campaign so the church
-- rotation never sees them (see supabase/migrations/20261031000000). Each
-- opener asks a DIFFERENT question, the lesson from the SourceGent refresh:
--   1. process  — how the teacher-appreciation lunch signup is tracked today
--   2. owner    — who runs the food table at the fun fair / family night
--   3. allergy  — how allergies are handled at a class potluck
-- Same ask shape as the church set: under 90 words, one concrete picture,
-- a closing question with nothing after it.
--
-- Copy makes only the claims the church templates already make (RSVPs, dish
-- signups, missing dishes, diet and allergen labels). Read it against the live
-- church templates before running and tighten any phrase PlateTell does not
-- actually do.
--
-- Bodies carry no sign-off: composeEmail() appends the signature from the
-- company's send settings. `{company}` renders as the organization name the
-- CSV import stored (recipient_name); with no name the phrase collapses to
-- "at your school" style fallbacks handled by renderTemplate().
--
-- NOT a migration: it writes user data for ONE company. Not safe to run twice
-- blindly (a second run inserts three duplicates). Check step 1 first.
--
-- BEFORE RUNNING:
--   1. Create the campaign in the app (Outreach → campaign picker → Manage
--      campaigns…), e.g. "PTA/PTO schools".
--   2. Replace REPLACE_WITH_COMPANY_ID and REPLACE_WITH_CAMPAIGN_ID below.
--      Step 0 finds both.
-- Plain SQL, so it runs in the Supabase SQL editor as well as psql.

begin;

-- 0. Find the ids and confirm the target.
select id, name from public.companies where lower(trim(name)) = 'platetell';
select id, name, status from public.outreach_campaigns
where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid order by created_at;

-- 1. What the company already has. Expect the three church templates, all with
--    campaign_id null (shared) or the church campaign's id.
select id, name, active, campaign_id, left(subject, 50) as subject
from public.outreach_templates
where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid
order by created_at;

-- 2. Optional: pin the church templates to the church campaign. Shared
--    (campaign_id null) templates reach every campaign that has none of its
--    own, plus prospects in no campaign. School prospects get their own set in
--    step 3, so the church copy stays off them either way; this only makes the
--    intent explicit. SKIP it if the Anglican list (no campaign) should keep
--    receiving the church templates.
--
-- update public.outreach_templates
-- set campaign_id = 'REPLACE_WITH_CHURCH_CAMPAIGN_ID'::uuid
-- where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid and campaign_id is null;

-- 3. The school rotation, equal weight so the A/B starts fair.
insert into public.outreach_templates (company_id, campaign_id, name, subject, body, followup_subject, followup_body, weight, active)
values
  ('REPLACE_WITH_COMPANY_ID'::uuid, 'REPLACE_WITH_CAMPAIGN_ID'::uuid,
   'Teacher appreciation lunch (process)',
   'teacher appreciation lunch signups',
   'Hi,

When {company} puts on a teacher appreciation lunch, how do you keep track of who is bringing what?

I work on PlateTell. Families RSVP from one link, claim a dish, and everyone can see what is still missing, so one parent is not chasing the whole list by text the night before. Each dish carries its diet and allergen label.

Is the signup sheet the painful part, or is it something else?',
   null,
   'Hi,

Circling back on the teacher appreciation lunch. If one signup page with the dish list and the gaps in one place would save you the group text, I can send a sample page for {company} to look at.

Worth a look, or is it already handled?',
   1, true),

  ('REPLACE_WITH_COMPANY_ID'::uuid, 'REPLACE_WITH_CAMPAIGN_ID'::uuid,
   'Fun fair food table (owner)',
   'food table at your next family night',
   'Hi,

Who ends up running the food table at the {company} fun fair or family night?

PlateTell gives that person one page. Families RSVP, claim a dish or a shift, and the list fills in as they do, from a phone in the pickup line. Missing dishes show up before the event instead of at it.

Would a two minute example before your next event be useful?',
   null,
   'Hi,

Following up before your next family night. Happy to set up a sample event page for {company} so you can see how the food table fills in on its own.

Want me to send it over?',
   1, true),

  ('REPLACE_WITH_COMPANY_ID'::uuid, 'REPLACE_WITH_CAMPAIGN_ID'::uuid,
   'Allergy labels (safety)',
   'allergy labels for school potlucks',
   'Hi,

How does {company} handle allergies at a class potluck or international night? Labels on the table, a line in the flyer, or mostly hoping?

PlateTell asks each family to tag their dish when they sign up, so every plate arrives with its diet and allergen label and the organizer never collects that by hand.

Is that something your families ask about, or not an issue at your school?',
   null,
   'Hi,

One more on this. If allergy labels are a headache at {company} events, PlateTell handles the tagging at signup so nobody is writing them out by hand on the day.

Would an example be useful?',
   1, true);

-- 4. Confirm: expect three active rows on the school campaign.
select name, weight, active, campaign_id, left(subject, 50) as subject
from public.outreach_templates
where company_id = 'REPLACE_WITH_COMPANY_ID'::uuid
  and campaign_id = 'REPLACE_WITH_CAMPAIGN_ID'::uuid
order by name;

commit;

-- Rollback before commit:  rollback;
-- After commit: delete the three rows by id (no drafts point at them yet), or
-- set active = false to retire them while keeping their stats.
