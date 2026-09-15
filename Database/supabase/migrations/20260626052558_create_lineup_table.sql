create table lineup (
  lineup_id bigint generated always as identity primary key,
  title_no varchar not null references "Title_master" (title_no),
  format text not null check (format in ('4DX', 'ScreenX')),
  confirmed boolean not null default false,
  first_available_release_date date,
  notes text,
  sync_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title_no, format)
);

comment on column lineup.sync_status is
  'Feedback written by the lineup-sheet sync job, e.g. validation errors for rows skipped during sync.';
