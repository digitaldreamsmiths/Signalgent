-- Per-channel versions of a content item. Keys are channel ids, values are the
-- post text for that channel. A channel with no key falls back to `body`.
alter table public.platform_content
  add column if not exists variants jsonb not null default '{}'::jsonb,
  add constraint platform_content_variants_object check (jsonb_typeof(variants) = 'object');
