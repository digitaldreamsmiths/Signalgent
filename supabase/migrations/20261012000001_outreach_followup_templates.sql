-- Per-template follow-up copy + openers-only sequencing.
--
-- Why: the follow-up sweep continued a company's OWN opener templates with the
-- BUILT-IN library's nudge ("Following up on my note about <product>. Would a
-- short example be useful?"), because user templates carried no follow-up of
-- their own. A template now optionally owns its nudge; the sweep uses the
-- opener's template (drafts.template_id) so touch two continues touch one.
-- Subject defaults to "Re: <opener subject>" so the nudge threads under it.
--
-- followup_openers_only: send the nudge only to prospects whose last touch
-- registered an open. A reader who saw the email and did not answer is the
-- one a short bump converts; one whose client never loaded it gets the same
-- unanswered pitch twice.

alter table public.outreach_templates
  add column followup_subject text,
  add column followup_body text;

alter table public.outreach_settings
  add column followup_openers_only boolean not null default false;
