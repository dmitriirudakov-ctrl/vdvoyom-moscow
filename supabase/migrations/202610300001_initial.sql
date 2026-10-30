-- Run on a fresh Supabase project. Only the project owner provisions couples and profiles.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Мы вдвоём',
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id),
  display_name text not null check (length(display_name) between 1 and 80)
);

create function private.current_couple_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select p.couple_id from public.profiles p where p.id = (select auth.uid()) $$;
revoke all on function private.current_couple_id() from public;
grant execute on function private.current_couple_id() to authenticated;

create table public.saves (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id),
  owner_id uuid not null references public.profiles(id),
  visibility text not null default 'private' check (visibility in ('private','shared')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  created_at timestamptz not null default now()
);
create index saves_couple on public.saves(couple_id);
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id),
  author_id uuid not null references public.profiles(id),
  plan_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  created_at timestamptz not null default now(),
  unique(couple_id,plan_id),
  check (payload->>'id' is not null and payload->>'id' = plan_id::text)
);
create table public.place_feedback (
  couple_id uuid not null references public.couples(id),
  place_id text not null check (length(place_id) between 1 and 200),
  value text not null check (value in ('liked','blocked')),
  primary key (couple_id,place_id)
);
create table public.catalog (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 20000),
  updated_at timestamptz not null default now()
);
create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  finished_at timestamptz not null default now(),
  status text not null check (status in ('success','error')),
  imported integer not null default 0,
  message text
);

alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.saves enable row level security;
alter table public.visits enable row level security;
alter table public.place_feedback enable row level security;
alter table public.catalog enable row level security;
alter table public.import_runs enable row level security;

revoke all on public.couples, public.profiles, public.saves, public.visits, public.place_feedback, public.catalog, public.import_runs from anon, authenticated;
grant select on public.couples, public.profiles, public.catalog, public.import_runs to authenticated;
grant select, insert, update, delete on public.saves, public.place_feedback to authenticated;
grant select, insert on public.visits to authenticated;
-- These grants are explicit for the importer, whose service key stays server-side.
grant all on public.couples, public.profiles, public.saves, public.visits, public.place_feedback, public.catalog, public.import_runs to service_role;

create policy couples_read on public.couples for select to authenticated
using (id = (select private.current_couple_id()));
create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy saves_read on public.saves for select to authenticated
using (couple_id = (select private.current_couple_id()) and (owner_id = (select auth.uid()) or visibility = 'shared'));
create policy saves_insert on public.saves for insert to authenticated
with check (couple_id = (select private.current_couple_id()) and owner_id = (select auth.uid()));
create policy saves_update on public.saves for update to authenticated
using (couple_id = (select private.current_couple_id()) and owner_id = (select auth.uid()))
with check (couple_id = (select private.current_couple_id()) and owner_id = (select auth.uid()));
create policy saves_delete on public.saves for delete to authenticated
using (couple_id = (select private.current_couple_id()) and owner_id = (select auth.uid()));
create policy visits_read on public.visits for select to authenticated
using (couple_id = (select private.current_couple_id()));
create policy visits_insert on public.visits for insert to authenticated
with check (couple_id = (select private.current_couple_id()) and author_id = (select auth.uid()));
create policy feedback_read on public.place_feedback for select to authenticated
using (couple_id = (select private.current_couple_id()));
create policy feedback_insert on public.place_feedback for insert to authenticated
with check (couple_id = (select private.current_couple_id()));
create policy feedback_update on public.place_feedback for update to authenticated
using (couple_id = (select private.current_couple_id()))
with check (couple_id = (select private.current_couple_id()));
create policy feedback_delete on public.place_feedback for delete to authenticated
using (couple_id = (select private.current_couple_id()));
create policy catalog_read on public.catalog for select to authenticated
using ((select private.current_couple_id()) is not null);
create policy import_runs_read on public.import_runs for select to authenticated
using ((select private.current_couple_id()) is not null);

-- Publish a complete snapshot atomically; an error leaves the previous catalogue intact.
create function public.replace_event_catalog(records jsonb) returns integer
language plpgsql set search_path = '' as $$
declare imported_count integer;
begin
  if records is null or jsonb_typeof(records) <> 'array' or jsonb_array_length(records) > 800 then
    raise exception 'Invalid catalogue batch';
  end if;
  delete from public.catalog where id like 'kudago-%';
  insert into public.catalog (id,payload,updated_at)
    select x.id,x.payload,now()
    from jsonb_to_recordset(records) as x(id text,payload jsonb);
  get diagnostics imported_count = row_count;
  insert into public.import_runs(status,imported) values('success',imported_count);
  return imported_count;
end;
$$;
revoke all on function public.replace_event_catalog(jsonb) from public, anon, authenticated;
grant execute on function public.replace_event_catalog(jsonb) to service_role;
commit;
