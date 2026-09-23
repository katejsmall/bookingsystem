-- ============================================================================
-- Optional link from a trailer asset to the film it's for. Nullable and not
-- backfilled here (see Database/scripts/link_trailer_assets_titles.js) -
-- most rows match Title_master by normalized name, but ~12% of real
-- trailers (naming drift, e.g. "F1: The Movie" vs lineup's "F1") and all of
-- the Brand TLR/QC/demo-reel rows have no matching title at all and are
-- expected to stay unlinked.
-- ============================================================================

alter table trailer_assets
  add column title_no varchar references "Title_master" (title_no);

create index trailer_assets_title_no_idx on trailer_assets (title_no);
