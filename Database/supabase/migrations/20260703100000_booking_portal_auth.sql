-- ============================================================================
-- Booking portal: auth profiles, contacts CRM, and full RLS matrix.
-- Run this whole script once in the Supabase SQL editor (or `supabase db push`).
--
-- Replaces the never-populated exhibitor_portal_users design from
-- 20260626052608_exhibitor_portal_rls.sql with a profiles table that also
-- distinguishes CJ team users from exhibitor users.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Lineup formats
-- The validate_booking trigger requires lineup.format to equal
-- screen_db.screen_format exactly. Live screen_format values are
-- 4DX / ScreenX / Ultra4DX / UltraScreenX, so the check must list those
-- spellings (the original check only allowed 4DX and ScreenX).
-- lineup is empty as of 2026-07-03, so this is safe to swap.
-- ----------------------------------------------------------------------------
alter table lineup drop constraint if exists lineup_format_check;
alter table lineup add constraint lineup_format_check
  check (format in ('4DX', 'ScreenX', 'Ultra4DX', 'UltraScreenX'));

-- ----------------------------------------------------------------------------
-- 2. Tear down the old auth layer (never populated)
-- ----------------------------------------------------------------------------
drop policy if exists "exhibitors can read confirmed lineup" on lineup;
drop policy if exists "exhibitors can view own bookings" on bookings;
drop policy if exists "exhibitors can request bookings" on bookings;
drop policy if exists "exhibitors can view own screens" on screen_db;
drop policy if exists "exhibitors can view own record" on exhibitor_db;
drop policy if exists "users can view own mapping" on exhibitor_portal_users;
drop function if exists current_exhibitor_unique();
drop table if exists exhibitor_portal_users;

-- ----------------------------------------------------------------------------
-- 3. profiles: one row per auth user, created by trigger on signup.
-- role 'team' = CJ staff (full access), 'exhibitor' = scoped to one exhibitor.
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'exhibitor' check (role in ('team', 'exhibitor')),
  exhibitor_unique varchar references exhibitor_db (exhibitor_unique),
  full_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- ----------------------------------------------------------------------------
-- 4. Helper functions. security definer so policies on other tables (and on
-- profiles itself) can read profiles without RLS recursion. stable, so during
-- an UPDATE they see the pre-update row - which is what pins role /
-- exhibitor_unique against self-escalation in the profiles update policy.
-- ----------------------------------------------------------------------------
create function current_exhibitor_unique()
returns varchar
language sql
security definer
set search_path = public
stable
as $$
  select exhibitor_unique from profiles where id = auth.uid();
$$;

create function current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid();
$$;

create function is_team()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'team' from profiles where id = auth.uid()), false);
$$;

-- profiles policies: own row select/update (update cannot change role or
-- exhibitor link), team sees and manages all rows.
create policy "users read own profile" on profiles
  for select using (id = auth.uid());

create policy "users update own profile" on profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = current_profile_role()
    and exhibitor_unique is not distinct from current_exhibitor_unique()
  );

create policy "team full access profiles" on profiles
  for all using (is_team()) with check (is_team());

grant select, update on profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Signup trigger: every new auth user gets a profiles row, defaulting to
-- role 'exhibitor'. The team then sets exhibitor_unique (or role 'team').
-- ----------------------------------------------------------------------------
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- 6. Contacts CRM (team only)
-- ----------------------------------------------------------------------------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  email text,
  phone text,
  country text,
  exhibitor_unique varchar references exhibitor_db (exhibitor_unique),
  relevant_formats text[],
  created_at timestamptz not null default now()
);

create table contact_screens (
  contact_id uuid not null references contacts (id) on delete cascade,
  screen_unique varchar not null references screen_db (screen_unique),
  primary key (contact_id, screen_unique)
);

create table contact_titles (
  contact_id uuid not null references contacts (id) on delete cascade,
  title_no varchar not null references "Title_master" (title_no),
  primary key (contact_id, title_no)
);

alter table contacts enable row level security;
alter table contact_screens enable row level security;
alter table contact_titles enable row level security;

create policy "team full access contacts" on contacts
  for all using (is_team()) with check (is_team());
create policy "team full access contact_screens" on contact_screens
  for all using (is_team()) with check (is_team());
create policy "team full access contact_titles" on contact_titles
  for all using (is_team()) with check (is_team());

grant select, insert, update, delete on contacts, contact_screens, contact_titles to authenticated;

-- ----------------------------------------------------------------------------
-- 7. RLS matrix on the existing tables
-- ----------------------------------------------------------------------------

-- bookings: exhibitors see/request their own; the only update they can make
-- is cancelling a still-pending request. Team does everything.
create policy "exhibitors view own bookings" on bookings
  for select using (exhibitor_unique = current_exhibitor_unique());

create policy "exhibitors request bookings" on bookings
  for insert with check (
    exhibitor_unique = current_exhibitor_unique()
    and status = 'requested'
  );

create policy "exhibitors cancel own requests" on bookings
  for update using (
    exhibitor_unique = current_exhibitor_unique()
    and status = 'requested'
  )
  with check (
    exhibitor_unique = current_exhibitor_unique()
    and status = 'cancelled'
  );

create policy "team full access bookings" on bookings
  for all using (is_team()) with check (is_team());

-- screen_db: exhibitors read their own screens, team has full access.
create policy "exhibitors view own screens" on screen_db
  for select using (exhibitor_id = current_exhibitor_unique());

create policy "team full access screens" on screen_db
  for all using (is_team()) with check (is_team());

-- exhibitor_db: exhibitors read their own row, team has full access.
create policy "exhibitors view own record" on exhibitor_db
  for select using (exhibitor_unique = current_exhibitor_unique());

create policy "team full access exhibitor_db" on exhibitor_db
  for all using (is_team()) with check (is_team());

-- lineup / Title_master / film_imdb_db: any signed-in user can read,
-- only team can write. (The request form additionally filters lineup to
-- confirmed titles in its query; the calendar needs to read lineup rows
-- behind existing bookings regardless of confirmed.)
create policy "authenticated read lineup" on lineup
  for select to authenticated using (true);
create policy "team write lineup" on lineup
  for all using (is_team()) with check (is_team());

alter table "Title_master" enable row level security;
create policy "authenticated read Title_master" on "Title_master"
  for select to authenticated using (true);
create policy "team write Title_master" on "Title_master"
  for all using (is_team()) with check (is_team());

alter table film_imdb_db enable row level security;
create policy "authenticated read film_imdb_db" on film_imdb_db
  for select to authenticated using (true);
create policy "team write film_imdb_db" on film_imdb_db
  for all using (is_team()) with check (is_team());

-- ----------------------------------------------------------------------------
-- 8. Storage wiring
-- The private IMAGES bucket holds Posters/ (film artwork, free-form marketing
-- filenames) and Logo and Branding/ (format brand logos - there are no
-- per-exhibitor logos yet). Rows point at their file via *_path columns and
-- the app serves them with short-lived signed URLs, so authenticated users
-- need read access to the bucket's objects.
-- ----------------------------------------------------------------------------
alter table film_imdb_db add column if not exists poster_path text;
alter table exhibitor_db add column if not exists logo_path text;

update film_imdb_db
set poster_path = 'Posters/Supergirl_4DX_ExclusiveArtwork_INTL_Dated_JUNE_PORTRAIT_1080x1350.jpg'
where title_no = 'FJ-330991-GCQ';  -- Supergirl

update film_imdb_db
set poster_path = 'Posters/ToyStory5_4DX_ExclusiveArtwork_INTL_Dated_JUNE_PORTRAIT_1182x1477.jpg'
where title_no = 'SG-985386-DRK';  -- Toy Story 5

create policy "authenticated read IMAGES" on storage.objects
  for select to authenticated using (bucket_id = 'IMAGES');
