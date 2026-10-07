-- Custom categories per library. Built-in categories live in the apps;
-- this list holds the extra names a library's members have added.
--
-- Run in Supabase → SQL Editor → New query → Run.

alter table public.libraries
  add column if not exists categories text[] not null default '{}';

-- Owners and editors may add a category; nothing is ever removed here, so
-- existing evidence always keeps a valid category name.
create or replace function public.add_library_category(p_library uuid, p_name text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40);
  v_list text[];
begin
  if not public.can_edit(p_library) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'category name is empty' using errcode = '22023';
  end if;

  select categories into v_list from public.libraries where id = p_library for update;

  if not exists (select 1 from unnest(v_list) c where lower(c) = lower(v_name)) then
    v_list := array_append(v_list, v_name);
    update public.libraries set categories = v_list where id = p_library;
  end if;

  return v_list;
end;
$$;

revoke all on function public.add_library_category(uuid, text) from public;
grant execute on function public.add_library_category(uuid, text) to authenticated;
