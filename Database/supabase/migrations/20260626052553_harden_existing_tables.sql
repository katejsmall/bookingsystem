-- Remove empty placeholder rows left over from the original IMDB import.
-- These 500 rows have title_key = 'imdb' and every other column null/blank.
delete from film_imdb_db
where "Title" = ''
  and imdb_link is null
  and release_date is null;

-- Vox Cinemas screens in Egypt/Lebanon/Qatar were tagged with exhibitor codes
-- (EX10061/62/64) that were never registered in exhibitor_db. Per business
-- decision, Vox operates as one company-wide account: re-point these screens
-- to the existing Vox Cinemas record (EX10065).
update screen_db
set exhibitor_id = 'EX10065'
where exhibitor_id in ('EX10061', 'EX10062', 'EX10064');

alter table screen_db
  add constraint screen_db_exhibitor_id_fkey
  foreign key (exhibitor_id) references exhibitor_db (exhibitor_unique);

-- Link film_imdb_db to Title_master via a real key instead of matching on
-- the free-text Title column. Every remaining film_imdb_db.Title matches
-- exactly one Title_master.erp_title (verified before writing this migration).
alter table film_imdb_db add column title_no varchar;

update film_imdb_db f
set title_no = t.title_no
from "Title_master" t
where t.erp_title = f."Title";

alter table film_imdb_db
  add constraint film_imdb_db_title_no_fkey
  foreign key (title_no) references "Title_master" (title_no);
