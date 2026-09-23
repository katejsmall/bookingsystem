-- ============================================================================
-- Trailer requests: exhibitors ask for a specific trailer_assets row to be
-- delivered to them. Same shape as production_requests - team reviews each
-- request and records a decision + optional note.
-- ============================================================================

create table trailer_requests (
  id bigint generated always as identity primary key,
  exhibitor_unique varchar not null references exhibitor_db (exhibitor_unique),
  trailer_asset_id bigint not null references trailer_assets (id),
  notes text,
  status text not null default 'under_review'
    check (status in ('under_review', 'confirmed', 'declined')),
  requested_by text,
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text
);

create index trailer_requests_exhibitor_unique_idx on trailer_requests (exhibitor_unique);
create index trailer_requests_trailer_asset_id_idx on trailer_requests (trailer_asset_id);
create index trailer_requests_status_idx on trailer_requests (status);

alter table trailer_requests enable row level security;

drop policy if exists "exhibitors view own trailer requests" on trailer_requests;
drop policy if exists "exhibitors submit trailer requests" on trailer_requests;
drop policy if exists "team full access trailer requests" on trailer_requests;

-- Exhibitors: submit and view their own requests only. No update/delete -
-- once submitted, only the team moves status forward.
create policy "exhibitors view own trailer requests" on trailer_requests
  for select using (exhibitor_unique = current_exhibitor_unique());

create policy "exhibitors submit trailer requests" on trailer_requests
  for insert with check (
    exhibitor_unique = current_exhibitor_unique()
    and status = 'under_review'
  );

create policy "team full access trailer requests" on trailer_requests
  for all using (is_team()) with check (is_team());

grant select, insert, update, delete on trailer_requests to authenticated;
