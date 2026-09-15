-- ============================================================================
-- TBD-title interest poll: team lists speculative titles + the format being
-- asked about (4DX or ScreenX), exhibitors cast an org-level yes/no/tbd vote
-- on whether they'd book it if produced. One vote per exhibitor per title,
-- changeable while the poll is active.
-- ============================================================================

create table tbd_titles (
  id bigint generated always as identity primary key,
  title_text text not null,
  imdb_link text,
  format text not null check (format in ('4DX', 'ScreenX')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tbd_titles_active_idx on tbd_titles (active);

create table tbd_votes (
  tbd_title_id bigint not null references tbd_titles (id) on delete cascade,
  exhibitor_unique varchar not null references exhibitor_db (exhibitor_unique),
  vote text not null check (vote in ('yes', 'no', 'tbd')),
  voted_by text,
  voted_at timestamptz not null default now(),
  primary key (tbd_title_id, exhibitor_unique)
);

create index tbd_votes_exhibitor_unique_idx on tbd_votes (exhibitor_unique);

alter table tbd_titles enable row level security;
alter table tbd_votes enable row level security;

drop policy if exists "authenticated read tbd_titles" on tbd_titles;
drop policy if exists "team write tbd_titles" on tbd_titles;
drop policy if exists "exhibitors view own tbd votes" on tbd_votes;
drop policy if exists "exhibitors cast tbd votes" on tbd_votes;
drop policy if exists "exhibitors change tbd votes" on tbd_votes;
drop policy if exists "team full access tbd_votes" on tbd_votes;

-- tbd_titles: any signed-in user can read (same pattern as lineup/Title_master),
-- only team manages the list.
create policy "authenticated read tbd_titles" on tbd_titles
  for select to authenticated using (true);
create policy "team write tbd_titles" on tbd_titles
  for all using (is_team()) with check (is_team());

-- tbd_votes: exhibitors see/cast only their own exhibitor's vote, and only
-- while the title is still active - re-checked server-side via RLS so a
-- stale client can't vote/change a vote after the poll closes.
create policy "exhibitors view own tbd votes" on tbd_votes
  for select using (exhibitor_unique = current_exhibitor_unique());

create policy "exhibitors cast tbd votes" on tbd_votes
  for insert with check (
    exhibitor_unique = current_exhibitor_unique()
    and exists (select 1 from tbd_titles t where t.id = tbd_title_id and t.active)
  );

create policy "exhibitors change tbd votes" on tbd_votes
  for update using (exhibitor_unique = current_exhibitor_unique())
  with check (
    exhibitor_unique = current_exhibitor_unique()
    and exists (select 1 from tbd_titles t where t.id = tbd_title_id and t.active)
  );

create policy "team full access tbd_votes" on tbd_votes
  for all using (is_team()) with check (is_team());

grant select, insert, update, delete on tbd_titles, tbd_votes to authenticated;
