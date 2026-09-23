-- ============================================================================
-- Splits everything in trailer_assets that isn't category='TLR' (QC,
-- ADV-QC, ADV-Feature, 기타 - 7 rows) out into its own table, same reasoning
-- as the Brand TLR split in 20260923180000: exhibitors shouldn't be able to
-- request these through the trailer catalogue for now, only real film
-- trailers. After this, trailer_assets holds only category='TLR' rows.
-- ============================================================================

create table other_trailer_assets (
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
  title_no varchar references "Title_master" (title_no),
  created_at timestamptz not null default now()
);

create index other_trailer_assets_category_idx on other_trailer_assets (category);
create index other_trailer_assets_format_idx on other_trailer_assets (format);

insert into other_trailer_assets
  (title, year, category, format, version, studio, duration, remark, label, included, is_new, trailer_link, note, title_no, created_at)
select
  title, year, category, format, version, studio, duration, remark, label, included, is_new, trailer_link, note, title_no, created_at
from trailer_assets
where category != 'TLR';

-- Safe: nothing in trailer_requests references a non-TLR row (checked
-- before writing this migration).
delete from trailer_assets where category != 'TLR';

alter table other_trailer_assets enable row level security;

drop policy if exists "authenticated read other_trailer_assets" on other_trailer_assets;
drop policy if exists "team write other_trailer_assets" on other_trailer_assets;

create policy "authenticated read other_trailer_assets" on other_trailer_assets
  for select to authenticated using (true);
create policy "team write other_trailer_assets" on other_trailer_assets
  for all using (is_team()) with check (is_team());

grant select, insert, update, delete on other_trailer_assets to authenticated;
