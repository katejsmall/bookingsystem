-- ============================================================================
-- Links the team's 4dx_db / sx_db programming sheets (added directly via the
-- Supabase table editor, no keys) into the title system, and syncs them into
-- lineup as bookable titles. Safe to re-run: every step is idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Both sheets already have "Title" as their primary key (set when they
-- were imported/duplicated) - nothing to add. sx_db's constraint was left
-- named after the table it was copied from; rename it for clarity only.
-- ----------------------------------------------------------------------------
alter table sx_db rename constraint "4dx_db_pkey" to sx_db_pkey;

-- ----------------------------------------------------------------------------
-- 2. Link to the title hub.
-- ----------------------------------------------------------------------------
alter table "4dx_db" add column if not exists title_no varchar references "Title_master" (title_no);
alter table sx_db add column if not exists title_no varchar references "Title_master" (title_no);

-- Exact-text match against the existing catalog first (case/whitespace
-- insensitive, same approach as the original film_imdb_db <-> Title_master
-- link in 20260626052553_harden_existing_tables.sql).
update "4dx_db" t set title_no = tm.title_no
from "Title_master" tm
where t.title_no is null
  and trim(lower(tm.erp_title)) = trim(lower(t."Title"));

update sx_db t set title_no = tm.title_no
from "Title_master" tm
where t.title_no is null
  and trim(lower(tm.erp_title)) = trim(lower(t."Title"));

-- Everything still unmatched is a 2026 title not yet in the ERP catalog.
-- Create a bare Title_master row per distinct title (one row even if it
-- appears in both sheets) using the existing XX-NNNNNN-XXX key pattern.
-- IMDb metadata (poster, genre) can be filled in later via the CRM; the
-- display-name fallback already handles a title with no film_imdb_db row.
do $$
declare
  r record;
  new_key varchar;
begin
  for r in (
    select distinct "Title" as title from "4dx_db" where title_no is null
    union
    select distinct "Title" as title from sx_db where title_no is null
  ) loop
    loop
      new_key :=
        chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int) || '-' ||
        lpad(floor(random() * 1000000)::text, 6, '0') || '-' ||
        chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int);
      exit when not exists (select 1 from "Title_master" where title_no = new_key);
    end loop;
    insert into "Title_master" (title_no, erp_title) values (new_key, r.title);
    update "4dx_db" set title_no = new_key where "Title" = r.title and title_no is null;
    update sx_db set title_no = new_key where "Title" = r.title and title_no is null;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Fix the one resolvable bad date. "Kingdom 5" had both formats' dates
-- pasted into a single cell ("2026-07-17 (4DX)\n2026-07-24 (SX)") - split
-- per sheet rather than guessing. The remaining TBD-style values are
-- genuinely unknown and are left as-is; step 4 carries them into lineup as
-- an unresolved release date rather than fabricating one.
-- ----------------------------------------------------------------------------
update "4dx_db" set "First Release Date" = '2026-07-17' where "Title" = 'Kingdom 5';
update sx_db set "First Release Date" = '2026-07-24' where "Title" = 'Kingdom 5';

-- ----------------------------------------------------------------------------
-- 4. Sync into lineup as confirmed/bookable. Re-running updates existing
-- rows in place (matched on the lineup.unique(title_no, format) constraint)
-- rather than duplicating them.
-- ----------------------------------------------------------------------------
insert into lineup (title_no, format, confirmed, first_available_release_date, notes, sync_status)
select
  title_no,
  '4DX',
  true,
  case when "First Release Date" ~ '^\d{4}-\d{2}-\d{2}$' then "First Release Date"::date else null end,
  nullif(concat_ws(' · ', nullif("Distributor", ''), nullif("Country", ''), nullif("Type", ''), nullif("Release", '')), ''),
  case when "First Release Date" ~ '^\d{4}-\d{2}-\d{2}$'
    then 'synced from 4dx_db'
    else 'synced from 4dx_db — release date unresolved: ' || "First Release Date"
  end
from "4dx_db"
where title_no is not null
on conflict (title_no, format) do update
  set confirmed = excluded.confirmed,
      first_available_release_date = excluded.first_available_release_date,
      notes = excluded.notes,
      sync_status = excluded.sync_status,
      updated_at = now();

insert into lineup (title_no, format, confirmed, first_available_release_date, notes, sync_status)
select
  title_no,
  'ScreenX',
  true,
  case when "First Release Date" ~ '^\d{4}-\d{2}-\d{2}$' then "First Release Date"::date else null end,
  nullif(concat_ws(' · ', nullif("Distributor", ''), nullif("Country", ''), nullif("Type", ''), nullif("Release", '')), ''),
  case when "First Release Date" ~ '^\d{4}-\d{2}-\d{2}$'
    then 'synced from sx_db'
    else 'synced from sx_db — release date unresolved: ' || "First Release Date"
  end
from sx_db
where title_no is not null
on conflict (title_no, format) do update
  set confirmed = excluded.confirmed,
      first_available_release_date = excluded.first_available_release_date,
      notes = excluded.notes,
      sync_status = excluded.sync_status,
      updated_at = now();

-- ----------------------------------------------------------------------------
-- 5. These were left world-readable with no RLS (default for tables added
-- via the table editor on this project). Lock them down like every other
-- reference table - team only; exhibitors/the app read the synced result
-- through lineup instead.
-- ----------------------------------------------------------------------------
alter table "4dx_db" enable row level security;
create policy "team full access 4dx_db" on "4dx_db"
  for all using (is_team()) with check (is_team());

alter table sx_db enable row level security;
create policy "team full access sx_db" on sx_db
  for all using (is_team()) with check (is_team());
