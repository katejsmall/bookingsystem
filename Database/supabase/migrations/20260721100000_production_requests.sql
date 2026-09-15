-- ============================================================================
-- Production requests: exhibitors recommend a title they'd like produced in
-- 4DX or ScreenX. The title usually doesn't exist in Title_master/
-- film_imdb_db yet, so it's captured as free text rather than linked. Team
-- reviews each request and records a decision + optional note, mirroring
-- bookings' decision shape.
-- ============================================================================

create table production_requests (
  id bigint generated always as identity primary key,
  exhibitor_unique varchar not null references exhibitor_db (exhibitor_unique),
  title_text text not null,
  imdb_link text,
  first_release_date date,
  format text not null check (format in ('4DX', 'ScreenX')),
  notes text,
  status text not null default 'under_review'
    check (status in ('under_review', 'confirmed', 'declined')),
  requested_by text,
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text
);

create index production_requests_exhibitor_unique_idx on production_requests (exhibitor_unique);
create index production_requests_status_idx on production_requests (status);

alter table production_requests enable row level security;

drop policy if exists "exhibitors view own production requests" on production_requests;
drop policy if exists "exhibitors submit production requests" on production_requests;
drop policy if exists "team full access production requests" on production_requests;

-- Exhibitors: submit and view their own requests only. No update/delete -
-- once submitted, only the team moves status forward.
create policy "exhibitors view own production requests" on production_requests
  for select using (exhibitor_unique = current_exhibitor_unique());

create policy "exhibitors submit production requests" on production_requests
  for insert with check (
    exhibitor_unique = current_exhibitor_unique()
    and status = 'under_review'
  );

create policy "team full access production requests" on production_requests
  for all using (is_team()) with check (is_team());

grant select, insert, update, delete on production_requests to authenticated;
