-- New field from the team's authoritative "all_exhibs_db" master sheet
-- (site-level street address, not previously captured anywhere).
alter table screen_db add column if not exists site_address text;
