-- ============================================================================
-- ScreenX trailer wing-file distribution list: who actually receives the
-- delivered asset at each exhibitor, per the marketing team's
-- FTR_SXWingDistribution_Recipient sheet. Distinct from trailer_requests
-- (who asked for it via the portal) because the portal login that requests
-- a trailer is often not the person/team that receives and screens it.
--
-- Only covers SCREENX for now (the source sheet is SX-only) - 4DX
-- completions keep emailing the requester until an equivalent list exists.
-- Team-only: this holds other exhibitors' internal contact emails globally,
-- most of which aren't even portal users, so exhibitors must not read it.
-- ============================================================================

create table screenx_trailer_recipients (
  id bigint generated always as identity primary key,
  territory text not null,
  country text,
  exhibitor_name text not null,
  -- Best-effort match to the portal's exhibitor_db (see
  -- Database/scripts/import_screenx_trailer_recipients.js) - null where the
  -- sheet's exhibitor isn't a portal user, or the name/country didn't match.
  exhibitor_unique varchar references exhibitor_db (exhibitor_unique),
  recipients text[] not null default '{}',
  cc_baepo text[] not null default '{}',
  cc_lineup_manager text[] not null default '{}',
  sender_email text,
  sender text,
  created_at timestamptz not null default now()
);

create index screenx_trailer_recipients_exhibitor_unique_idx on screenx_trailer_recipients (exhibitor_unique);

alter table screenx_trailer_recipients enable row level security;

drop policy if exists "team full access screenx_trailer_recipients" on screenx_trailer_recipients;

create policy "team full access screenx_trailer_recipients" on screenx_trailer_recipients
  for all using (is_team()) with check (is_team());

grant select, insert, update, delete on screenx_trailer_recipients to authenticated;
