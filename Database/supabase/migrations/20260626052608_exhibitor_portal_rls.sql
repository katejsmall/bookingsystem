-- Maps a shared per-company Supabase Auth login to its exhibitor record.
-- Populated later once each exhibitor has a real login provisioned -
-- see plan note on missing manager_email values.
create table exhibitor_portal_users (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  exhibitor_unique varchar not null references exhibitor_db (exhibitor_unique),
  created_at timestamptz not null default now()
);

alter table exhibitor_portal_users enable row level security;

create policy "users can view own mapping" on exhibitor_portal_users
  for select using (auth_user_id = auth.uid());

-- security definer so RLS on exhibitor_portal_users itself doesn't recurse
-- when this function is used inside other tables' policies.
create function current_exhibitor_unique()
returns varchar
language sql
security definer
set search_path = public
stable
as $$
  select exhibitor_unique from exhibitor_portal_users where auth_user_id = auth.uid();
$$;

-- Internal/admin access (NocoDB, scripts) should connect with the
-- service_role key, which bypasses RLS entirely - these policies only
-- govern what an authenticated exhibitor login can see/do.

alter table lineup enable row level security;

create policy "exhibitors can read confirmed lineup" on lineup
  for select using (confirmed = true and current_exhibitor_unique() is not null);

alter table bookings enable row level security;

create policy "exhibitors can view own bookings" on bookings
  for select using (exhibitor_unique = current_exhibitor_unique());

create policy "exhibitors can request bookings" on bookings
  for insert with check (
    exhibitor_unique = current_exhibitor_unique()
    and status = 'requested'
  );

alter table screen_db enable row level security;

create policy "exhibitors can view own screens" on screen_db
  for select using (exhibitor_id = current_exhibitor_unique());

alter table exhibitor_db enable row level security;

create policy "exhibitors can view own record" on exhibitor_db
  for select using (exhibitor_unique = current_exhibitor_unique());
