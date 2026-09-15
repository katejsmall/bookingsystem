-- Turns the two shared demo logins into a real per-person account system.
--
-- territory: which patch a TEAM member owns. Values match
--   exhibitor_db.account_manager ('Frankie', 'CHINA', 'Kate', '이경민', ...)
--   so the portal can open on that manager's own exhibitors instead of
--   making everyone pick from a dropdown each session. Null = sees all
--   territories by default (for leads/admins). Meaningless for exhibitors.
alter table profiles add column if not exists territory text;

-- must_change_password: set when an admin provisions an account with a
--   generated temporary password. The app forces a change on next sign-in
--   and clears the flag, so an admin-chosen password is never a lasting
--   credential.
alter table profiles add column if not exists must_change_password boolean not null default false;

-- active: soft-disable without deleting the auth user (which would orphan
--   requested_by / confirmed_by audit trails on bookings).
alter table profiles add column if not exists active boolean not null default true;

-- is_admin: can manage other users. Kept separate from role='team' so an
--   ordinary manager can't provision accounts or change someone's role.
alter table profiles add column if not exists is_admin boolean not null default false;

comment on column profiles.territory is
  'Team member''s own territory; matches exhibitor_db.account_manager. Null = all.';
comment on column profiles.must_change_password is
  'True while an admin-issued temporary password is still in use.';

-- A user must be able to clear their own must_change_password flag when
-- they set a real password. The existing "users update own profile" policy
-- pins role and exhibitor_unique but predates these columns, so replace it
-- to also pin territory/active/is_admin - otherwise a user could grant
-- themselves admin or switch territory by patching their own row.
drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = current_profile_role()
    and exhibitor_unique is not distinct from current_exhibitor_unique()
    and territory is not distinct from (select p.territory from profiles p where p.id = auth.uid())
    and active = (select p.active from profiles p where p.id = auth.uid())
    and is_admin = (select p.is_admin from profiles p where p.id = auth.uid())
  );

-- Promote the existing team account so there's a way in to manage the rest.
update profiles
set is_admin = true
where id in (select id from auth.users where email = '4dplex@cj.net');
