-- ============================================================================
-- Splits Brand TLR rows out of trailer_assets into their own table.
-- Brand/demo reels ("ULTRA 4DX", "Thumbelina", "Sky Dive", ...) aren't tied
-- to a film - they never got a title_no match (see
-- 20260923100000_trailer_assets_title_link.sql) and exhibitors shouldn't
-- be able to request them the same way they request a film's trailer, at
-- least for now. Same shape as trailer_assets so nothing about the column
-- set has to be relearned; the ('4DX','SX','ULTRA') format vocabulary
-- carries over unchanged.
-- ============================================================================

create table brand_trailer_assets (
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

create index brand_trailer_assets_category_idx on brand_trailer_assets (category);
create index brand_trailer_assets_format_idx on brand_trailer_assets (format);

insert into brand_trailer_assets
  (title, year, category, format, version, studio, duration, remark, label, included, is_new, trailer_link, note, title_no, created_at)
select
  title, year, category, format, version, studio, duration, remark, label, included, is_new, trailer_link, note, title_no, created_at
from trailer_assets
where category = 'Brand TLR';

-- Safe: nothing in trailer_requests references a Brand TLR row (checked
-- before writing this migration - the one request submitted so far is for
-- a category='TLR' asset).
delete from trailer_assets where category = 'Brand TLR';

alter table brand_trailer_assets enable row level security;

drop policy if exists "authenticated read brand_trailer_assets" on brand_trailer_assets;
drop policy if exists "team write brand_trailer_assets" on brand_trailer_assets;

create policy "authenticated read brand_trailer_assets" on brand_trailer_assets
  for select to authenticated using (true);
create policy "team write brand_trailer_assets" on brand_trailer_assets
  for all using (is_team()) with check (is_team());

grant select, insert, update, delete on brand_trailer_assets to authenticated;
