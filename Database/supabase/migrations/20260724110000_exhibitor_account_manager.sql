-- CJ team member responsible for an exhibitor, for the team-side "filter by
-- manager" UI (e.g. so one manager isn't shown exhibitors outside their
-- patch). No such field existed anywhere; exhibitor_db.manager_email is a
-- different thing (the exhibitor's OWN login contact, not a CJ team member).
-- Backfilled once from bookings.requested_by (the sheet's "Input by" column)
-- picking the most frequent name per exhibitor - a best-guess starting
-- point the team corrects via the Exhibitors CRM page, not a source of truth.
alter table exhibitor_db add column if not exists account_manager text;

with ranked as (
  select
    b.exhibitor_unique,
    b.requested_by,
    count(*) as n,
    row_number() over (
      partition by b.exhibitor_unique
      order by count(*) desc
    ) as rnk
  from bookings b
  where b.requested_by is not null
    and b.requested_by <> 'kncc@naver.com' -- an exhibitor's own contact, not a CJ manager
  group by b.exhibitor_unique, b.requested_by
)
update exhibitor_db e
set account_manager = ranked.requested_by
from ranked
where ranked.exhibitor_unique = e.exhibitor_unique
  and ranked.rnk = 1
  and e.account_manager is null;
