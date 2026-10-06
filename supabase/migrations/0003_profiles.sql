-- Display names. One row per user; anyone signed in can read names (it's a
-- team tool, names are meant to be seen), only you can write yours.
--
-- Run in Supabase → SQL Editor → New query → Run.

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "signed-in users read names" on public.profiles;
create policy "signed-in users read names"
  on public.profiles for select
  using (auth.uid() is not null);

drop policy if exists "users write their own profile" on public.profiles;
create policy "users write their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
