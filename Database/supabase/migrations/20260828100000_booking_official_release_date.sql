-- Exhibitors distinguish two dates when booking a title:
--   * the official national release date, and
--   * the first date it actually screens, which can be EARLIER for
--     previews / pre-release testing.
--
-- requested_play_date keeps its meaning as the operative date - when the
-- run starts on that screen - because that's what the calendar draws and
-- what the active-booking unique index keys on. The national release date
-- is new information, so it gets its own column.
alter table bookings add column if not exists official_release_date date;

comment on column bookings.requested_play_date is
  'First date the title screens on this screen (may precede the national release for previews).';
comment on column bookings.official_release_date is
  'Official national release date for this booking, when it differs from the first screening.';

-- validate_booking previously required requested_play_date >= the lineup's
-- first_available_release_date, which made a preview screening impossible:
-- a preview is by definition before release. Apply the lineup floor to the
-- official release date when one is given, and fall back to the play date
-- otherwise, so the title's availability still governs the release while
-- previews ahead of it are allowed.
create or replace function validate_booking() returns trigger as $$
declare
  v_screen_format text;
  v_screen_exhibitor varchar;
  v_lineup_format text;
  v_confirmed boolean;
  v_release_date date;
  v_check_date date;
begin
  select screen_format, exhibitor_id into v_screen_format, v_screen_exhibitor
  from screen_db where screen_unique = new.screen_unique;

  select format, confirmed, first_available_release_date
    into v_lineup_format, v_confirmed, v_release_date
  from lineup where lineup_id = new.lineup_id;

  if v_screen_exhibitor is distinct from new.exhibitor_unique then
    raise exception 'Screen % does not belong to exhibitor %',
      new.screen_unique, new.exhibitor_unique;
  end if;

  -- Ultra4DX/UltraScreenX are combo installs and play the base format's
  -- lineup entry (see 20260723130000).
  if regexp_replace(v_screen_format, '^Ultra', '') is distinct from v_lineup_format then
    raise exception 'Screen % does not have format % (lineup_id %)',
      new.screen_unique, v_lineup_format, new.lineup_id;
  end if;

  if not v_confirmed then
    raise exception 'Lineup % is not confirmed yet', new.lineup_id;
  end if;

  v_check_date := coalesce(new.official_release_date, new.requested_play_date);
  if v_release_date is not null and v_check_date < v_release_date then
    raise exception 'Release date % is before the title''s first available release date % (lineup_id %)',
      v_check_date, v_release_date, new.lineup_id;
  end if;

  return new;
end;
$$ language plpgsql;
