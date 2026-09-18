-- ============================================================================
-- Trailer asset catalogue: the CJ marketing team's master list of trailer /
-- QC / brand-TLR video assets per title, imported from the team's "Asset
-- List" tracking sheet. Not linked to Title_master - the sheet's title text
-- is entered by hand (spacing, casing) and covers non-programmed assets
-- (brand trailers, QC reels) that have no Title_master row, same reasoning
-- as production_requests.title_text. This is the read-only catalogue the
-- upcoming trailer-request feature will let exhibitors browse/request
-- against; the request table itself is a separate migration.
-- ============================================================================

create table trailer_assets (
  id bigint generated always as identity primary key,
  title text not null,
  year integer,
  category text not null,
  format text not null check (format in ('4DX', 'SX', 'ULTRA')),
  version text,
  studio text,
  duration text,
  remark text,
  label text,
  included boolean not null default false,
  is_new boolean not null default false,
  trailer_link text,
  note text,
  created_at timestamptz not null default now()
);

create index trailer_assets_category_idx on trailer_assets (category);
create index trailer_assets_format_idx on trailer_assets (format);

alter table trailer_assets enable row level security;

drop policy if exists "authenticated read trailer_assets" on trailer_assets;
drop policy if exists "team write trailer_assets" on trailer_assets;

-- Same shape as tbd_titles: any signed-in user can read, only team manages it.
create policy "authenticated read trailer_assets" on trailer_assets
  for select to authenticated using (true);
create policy "team write trailer_assets" on trailer_assets
  for all using (is_team()) with check (is_team());

grant select, insert, update, delete on trailer_assets to authenticated;
