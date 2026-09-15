create table bookings (
  booking_id bigint generated always as identity primary key,
  screen_unique varchar not null references screen_db (screen_unique),
  lineup_id bigint not null references lineup (lineup_id),
  exhibitor_unique varchar not null references exhibitor_db (exhibitor_unique),
  requested_play_date date not null,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'rejected', 'cancelled')),
  requested_by text,
  requested_at timestamptz not null default now(),
  confirmed_by text,
  confirmed_at timestamptz,
  notes text
);

create index bookings_exhibitor_unique_idx on bookings (exhibitor_unique);
create index bookings_lineup_id_idx on bookings (lineup_id);

-- Enforces the core booking rule at the database level so it holds no
-- matter which client writes the row (booking portal, NocoDB, scripts):
-- the screen's format must match the lineup's format, the lineup must be
-- confirmed, and the requested date can't be before the release date.
create function validate_booking() returns trigger as $$
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

  if v_screen_format is distinct from v_lineup_format then
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

create trigger bookings_validate
  before insert or update on bookings
  for each row execute function validate_booking();
