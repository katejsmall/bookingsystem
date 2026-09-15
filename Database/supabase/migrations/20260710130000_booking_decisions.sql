-- ============================================================================
-- Booking decisions: a team-authored note on confirm/reject (shown to the
-- exhibitor), and a uniqueness backstop so the same screen + lineup title +
-- play date can't be requested twice while a request is still live.
-- ============================================================================

-- Team's reason/comment when deciding. Kept separate from bookings.notes,
-- which belongs to the requesting exhibitor.
alter table bookings add column if not exists decision_note text;

-- Cancelled/rejected rows don't count - the exhibitor may legitimately
-- re-request after a cancellation or rejection.
create unique index if not exists bookings_active_unique
  on bookings (screen_unique, lineup_id, requested_play_date)
  where status in ('requested', 'confirmed');
