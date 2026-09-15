-- Poster artwork per title, with optional format-specific overrides.
--
-- film_imdb_db.poster_path is now explicitly the BASE (theatrical) poster.
-- The distributor also supplies 4DX- and ScreenX-branded artwork for some
-- titles; those go in the two new columns and are preferred wherever the
-- UI knows which format it's showing, falling back to the base otherwise.
alter table film_imdb_db add column if not exists poster_path_4dx text;
alter table film_imdb_db add column if not exists poster_path_screenx text;

comment on column film_imdb_db.poster_path is
  'Base/theatrical poster in the IMAGES bucket, e.g. Posters/Foo.jpg. Used when no format-specific art exists.';
comment on column film_imdb_db.poster_path_4dx is
  'Optional 4DX-branded artwork; preferred over poster_path in 4DX/Ultra4DX contexts.';
comment on column film_imdb_db.poster_path_screenx is
  'Optional ScreenX-branded artwork; preferred over poster_path in ScreenX/UltraScreenX contexts.';

-- The IMAGES bucket only had a read policy, so uploads from the app were
-- blocked by RLS. Let team users manage poster files (and only poster
-- files - the brand logo folder stays read-only).
drop policy if exists "team writes poster images" on storage.objects;
create policy "team writes poster images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'IMAGES'
    and (storage.foldername(name))[1] = 'Posters'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team')
  );

drop policy if exists "team updates poster images" on storage.objects;
create policy "team updates poster images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'IMAGES'
    and (storage.foldername(name))[1] = 'Posters'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team')
  );

drop policy if exists "team deletes poster images" on storage.objects;
create policy "team deletes poster images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'IMAGES'
    and (storage.foldername(name))[1] = 'Posters'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'team')
  );
