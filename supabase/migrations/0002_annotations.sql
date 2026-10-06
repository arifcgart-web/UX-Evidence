-- Annotations: rectangles and arrows drawn over a screenshot, stored as
-- normalised vector shapes beside the (untouched) image.
--
-- Run in Supabase → SQL Editor → New query → Run.

alter table public.evidence
  add column if not exists annotations jsonb not null default '[]'::jsonb;

-- Keep the search haystack trigger as is; annotations are not searchable text.
