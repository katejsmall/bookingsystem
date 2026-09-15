-- ============================================================================
-- Programming weeks: how many weeks an exhibitor plans to play a title on a
-- screen, chosen once per submission (applies to every screen in that
-- submission). Lets the calendar render the booking's full run instead of a
-- single day, so gaps in a screen's schedule become visible.
-- ============================================================================

alter table bookings add column if not exists programming_weeks integer not null default 2;

alter table bookings drop constraint if exists bookings_programming_weeks_check;
alter table bookings add constraint bookings_programming_weeks_check
  check (programming_weeks between 1 and 52);
