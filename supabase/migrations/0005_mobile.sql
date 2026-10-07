-- Mobile version of a capture: the same section captured at phone width.
-- Files live next to the desktop ones (<library>/<id>/mobile.png and
-- mobile-thumb.jpg), so the existing storage policies already cover them.
--
-- Run in Supabase → SQL Editor → New query → Run.

alter table public.evidence
  add column if not exists mobile jsonb;

comment on column public.evidence.mobile is
  'null, or { width, height, viewport: {width,height}, annotations: [] } for the mobile screenshot';
