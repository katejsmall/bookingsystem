-- Ultra4DX and UltraScreenX screens are combo installs: an Ultra4DX booking
-- is still fundamentally a 4DX presentation of the title, and UltraScreenX
-- a ScreenX presentation, just on a screen that also has the other tech
-- installed. The lineup table only tracks confirmed/release-date per title
-- for the base '4DX'/'ScreenX' formats (no separate Ultra rows), so the
-- format-match check now strips a leading 'Ultra' from screen_format before
-- comparing to lineup.format. All other validate_booking rules are unchanged.
create or replace function validate_booking() returns trigger as $$
declare
  v_screen_format text;
  v_screen_exhibitor varchar;
  v_lineup_format text;
  v_confirmed boolean;
  v_release_date date;
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

  if regexp_replace(v_screen_format, '^Ultra', '') is distinct from v_lineup_format then
    raise exception 'Screen % does not have format % (lineup_id %)',
      new.screen_unique, v_lineup_format, new.lineup_id;
  end if;

  if not v_confirmed then
    raise exception 'Lineup % is not confirmed yet', new.lineup_id;
  end if;

  if v_release_date is not null and new.requested_play_date < v_release_date then
    raise exception 'Requested play date % is before the release date % (lineup_id %)',
      new.requested_play_date, v_release_date, new.lineup_id;
  end if;

  return new;
end;
$$ language plpgsql;
