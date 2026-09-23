-- ============================================================================
-- Adds a 'completed' stage to trailer_requests: once the team has actually
-- delivered the asset (separate from the confirm/decline review decision),
-- they mark it completed, which the app uses to email the requesting
-- exhibitor that delivery is done.
-- ============================================================================

alter table trailer_requests drop constraint trailer_requests_status_check;
alter table trailer_requests add constraint trailer_requests_status_check
  check (status in ('under_review', 'confirmed', 'declined', 'completed'));

alter table trailer_requests add column completed_by text;
alter table trailer_requests add column completed_at timestamptz;
