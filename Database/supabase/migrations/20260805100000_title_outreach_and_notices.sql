-- Two team-workflow tables for the manager portal.
--
-- 1) title_outreach: has this exhibitor been ASKED about this title yet?
--    The portal can already show which exhibitors haven't booked an
--    upcoming title, but "hasn't booked" and "hasn't been asked" are very
--    different jobs. One row = one (title, format, exhibitor) approach,
--    created the moment a manager marks it. No row at all means "not yet
--    asked", so the common case costs nothing to store.
--    Deliberately readable/writable by the whole team, not just the owning
--    manager, so cover can be picked up across territories.
create table if not exists title_outreach (
  id bigint generated always as identity primary key,
  title_no varchar not null references "Title_master" (title_no) on delete cascade,
  format text not null check (format in ('4DX', 'ScreenX')),
  exhibitor_unique varchar not null references exhibitor_db (exhibitor_unique) on delete cascade,
  status text not null default 'asked' check (status in ('asked', 'declined', 'no_response')),
  note text,
  actioned_by text,
  actioned_at timestamptz not null default now(),
  unique (title_no, format, exhibitor_unique)
);

create index if not exists title_outreach_title_idx on title_outreach (title_no, format);
create index if not exists title_outreach_exhibitor_idx on title_outreach (exhibitor_unique);

alter table title_outreach enable row level security;

drop policy if exists "team reads outreach" on title_outreach;
create policy "team reads outreach" on title_outreach
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team'));

drop policy if exists "team writes outreach" on title_outreach;
create policy "team writes outreach" on title_outreach
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team'));

-- 2) team_notices: shared to-dos and standing notices for the programming
--    team, surfaced in a corner panel on every team page. `kind` separates
--    a dated task from a standing announcement; `pinned` floats the ones
--    everyone needs to see regardless of age.
create table if not exists team_notices (
  id bigint generated always as identity primary key,
  kind text not null default 'task' check (kind in ('task', 'notice')),
  body text not null,
  -- null = applies to every territory
  territory text,
  due_date date,
  pinned boolean not null default false,
  done boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  done_by text,
  done_at timestamptz
);

create index if not exists team_notices_open_idx on team_notices (done, pinned, created_at desc);

alter table team_notices enable row level security;

drop policy if exists "team reads notices" on team_notices;
create policy "team reads notices" on team_notices
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team'));

drop policy if exists "team writes notices" on team_notices;
create policy "team writes notices" on team_notices
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team'));
