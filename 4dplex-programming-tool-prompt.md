# Build Prompt: CJ 4DPLEX Exhibitor Booking Tool

Paste this whole document into Claude Code (Fable). Before building anything, connect to the Supabase project and read the live schema to confirm exact column names and types. The schema below is accurate as of the latest check, but treat the database as the source of truth, and ask before guessing.

---

## What this is

An internal web tool for CJ 4DPLEX to manage 4DX, ScreenX, and ULTRA4DX programming across exhibitor cinemas. It has two sides:

- **Exhibitors** log in and request play dates for confirmed lineup titles on their own screens.
- **The CJ team** logs in to a fuller view: every request across all exhibitors, with the power to confirm or reject, plus the full calendar and the admin CRM.

This is a business tool, not consumer ticketing. There are no seat maps, ticket prices, or public sign-ups.

A booking is one lineup title, on one screen, on one requested play date, moving through a status of `requested`, `confirmed`, `rejected`, or `cancelled`.

---

## Tech stack

- Next.js 14+ (App Router), React, TypeScript
- Supabase for database, auth, and row-level security
- `@supabase/ssr` for session management across server components, client components, and middleware
- Server Actions for all data changes

Match the existing Supabase client setup already in the project: helpers live in `utils/supabase/server.ts`, `utils/supabase/client.ts`, and `utils/supabase/middleware.ts`, and the env variables are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (both already set in `.env.local`, do not commit them). Reuse those helpers rather than writing new ones.

### Core principles

1. Reads happen in Server Components. Writes happen in Server Actions.
2. The session is refreshed in middleware, following the `@supabase/ssr` pattern.
3. Row-level security is enforced at the database level, not just in the UI.
4. The service role key is server-only and never reaches the client.

---

## The existing database

These tables already exist. Do not drop or recreate them. Read the live schema to confirm, but this is the current shape.

```
Title_master                    -- the hub every title hangs off
  title_no varchar pk
  erp_title varchar

film_imdb_db                    -- IMDb metadata per title
  title_key varchar not null
  Title text
  imdb_title, imdb_link, release_date, runtime, mpa_rating,
  genre, director, countries_of_origin, language,
  production_company, budget, gross_worldwide  (all varchar)
  title_no varchar -> Title_master(title_no)

lineup                          -- the 4DX/SX/ULTRA4DX programming list
  lineup_id int8 pk (identity)
  title_no varchar -> Title_master(title_no)
  format text                   -- '4DX' | 'ScreenX' | 'ULTRA4DX'
  confirmed bool
  first_available_release_date date
  notes text
  sync_status text
  created_at, updated_at timestamptz

exhibitor_db                    -- exhibitors, format availability, current login fields
  exhibitor_unique varchar pk
  exhibitor_key varchar
  exhibitor_erp varchar
  entity_country varchar
  screenx bool
  4dx bool
  ultra4dx bool
  exhibitor_login varchar       -- legacy custom login, see Auth section
  login_password varchar        -- legacy plain-text password, see Auth section
  manager_email varchar

screen_db                       -- one row per format install at a site
  screen_unique varchar pk
  exhibitor_key varchar
  exhibitor_id varchar -> exhibitor_db(exhibitor_unique)
  site_id, site_name, screen_name, screen_number varchar
  location_country, location_city varchar
  format varchar
  screen_format varchar         -- this is what the trigger matches against lineup.format
  seat_count varchar
  opening_date varchar

bookings                        -- the core workflow table
  booking_id bigint pk (identity)
  screen_unique varchar -> screen_db(screen_unique)
  lineup_id bigint -> lineup(lineup_id)
  exhibitor_unique varchar -> exhibitor_db(exhibitor_unique)
  requested_play_date date not null
  status text default 'requested'   -- 'requested' | 'confirmed' | 'rejected' | 'cancelled'
  requested_by text
  requested_at timestamptz default now()
  confirmed_by text
  confirmed_at timestamptz
  notes text
  -- trigger validate_booking runs BEFORE INSERT OR UPDATE
```

### How titles join together

`Title_master.title_no` is the hub. `lineup.title_no` and `film_imdb_db.title_no` both point to it. So for one title you can have a lineup row per format and one metadata row. For a display name, prefer `film_imdb_db.Title`, and fall back to `Title_master.erp_title`. Pull `genre` from `film_imdb_db` where useful.

### The `validate_booking` trigger (build the form to respect this)

Every insert and update on `bookings` is checked. A booking is rejected with an exception if any of these fail:

1. The screen belongs to a different exhibitor than the one making the request.
2. The screen's `screen_format` does not match the lineup title's `format`.
3. The lineup title is not `confirmed`.
4. The `requested_play_date` is before the title's `first_available_release_date`.

The request form must only ever offer valid combinations, so these exceptions almost never fire. When one does (a race, or stale data), catch it and show the plain-English reason rather than a raw database error. The same rules re-run when the team confirms, since confirming is an update, so keep them satisfied through the whole flow.

---

## New tables to create

Provide one integrated SQL script for the Supabase SQL editor: the new tables, their RLS, and the signup handling.

**`profiles`** links each auth user to a role and, for exhibitor users, to their exhibitor.

```
profiles
  id uuid pk -> auth.users(id) on delete cascade
  role text not null default 'exhibitor'   -- 'team' | 'exhibitor'
  exhibitor_unique varchar -> exhibitor_db(exhibitor_unique)  -- null for team users
  full_name text
  created_at timestamptz default now()
```

**`contacts`** and its link tables, mirroring the earlier CRM design.

```
contacts
  id uuid pk default gen_random_uuid()
  first_name text
  last_name text
  email text
  phone text
  country text
  exhibitor_unique varchar -> exhibitor_db(exhibitor_unique)
  relevant_formats text[]        -- subset of {'4DX','ScreenX','ULTRA4DX'}
  created_at timestamptz default now()

contact_screens  (contact_id uuid, screen_unique varchar)   -- many-to-many
contact_titles   (contact_id uuid, title_no varchar)        -- many-to-many
```

---

## Images from Supabase Storage

Posters and exhibitor logos already live in Supabase Storage. Inspect the buckets and wire them up, rather than assuming a setup.

1. **Find the link between a row and its file.** List the buckets and their contents. The link is either a path or URL stored on the row, or a filename that matches a key already on the row, such as `title_no` for posters or `exhibitor_unique` for logos. Work out which pattern is in use and follow it.
2. **If neither exists yet,** add a `poster_path` column to `film_imdb_db` and a `logo_path` column to `exhibitor_db`, populate them where you can, and read from those.
3. **Match access to the bucket.** For public buckets, use the plain public URL in the image tag. For private buckets, generate a short-lived signed URL server-side and pass that to the client. Check each bucket rather than assuming.
4. **Show them and fall back cleanly.** Posters show on the calendar pills and title cards, logos show on the exhibitor screens and login branding. When a file is missing, show a clean placeholder rather than a broken image.

---

## Auth

Put everyone on Supabase Auth. No public sign-up. The team provisions accounts.

- **Exhibitor accounts:** one login per exhibitor, its `profiles` row set to `role = 'exhibitor'` with the matching `exhibitor_unique`. The natural login email is that exhibitor's `manager_email`.
- **Team accounts:** `role = 'team'`, `exhibitor_unique` null.
- A single `/login` page with email and password using `signInWithPassword`. After login, route team users to the calendar and exhibitor users to their own request view.
- `middleware.ts` refreshes the session and blocks unauthenticated access to every app route except `/login`.
- A logout Server Action.
- The legacy `exhibitor_login` and `login_password` columns on `exhibitor_db` go unused. Leave them in place, do not read from them.

If a `handle_new_user` trigger is wanted, have it create a `profiles` row on account creation, defaulting `role` to `'exhibitor'`, with the team setting `exhibitor_unique` afterwards.

### Row-level security

- `bookings`: exhibitor users can select and insert only rows where `exhibitor_unique` matches their profile, and can update only their own rows to set status `cancelled`. Team users can select, insert, update, and delete all rows (confirming and rejecting included).
- `screen_db`: exhibitor users select only their own screens (`exhibitor_id` matches their profile). Team users select all, and are the only ones who can insert, update, or delete.
- `lineup`, `Title_master`, `film_imdb_db`: any authenticated user can select. Only team users can change them.
- `exhibitor_db`: exhibitor users select only their own row. Team users have full access.
- `contacts`, `contact_screens`, `contact_titles`: team users only.
- `profiles`: a user selects and updates only their own row. Team users can select all.

---

## Feature 1: Lineup calendar

The landing view for the team, and a scoped version for exhibitors.

- Month columns, showing the current run of months by default, with a toggle to reveal earlier months. Persist the chosen filters and range in the browser so a refresh does not reset them.
- Each booking shows as a pill on its `requested_play_date`, labelled with the title and, where available, its poster thumbnail from Storage. Colour by status: `confirmed` solid green, `requested` amber with a dashed border, `rejected` and `cancelled` greyed and hidden behind a toggle.
- Long titles truncate with an ellipsis and show the full name on hover.
- **Team view:** all bookings across all exhibitors, with a filter bar: format (4DX, ScreenX, ULTRA4DX), country (`entity_country`), exhibitor, screen, and status. Filters cascade, so choosing a country narrows the exhibitor list, and choosing an exhibitor narrows the screen list. A clear button resets them.
- **Exhibitor view:** the same calendar, automatically limited to their own bookings and screens, with no exhibitor filter.
- Leave vertical room in each day cell for a future occupancy indicator, but do not build it yet.

---

## Feature 2: Request and confirm workflow

**Exhibitor side, request a booking:**
- A form that only offers valid choices, so the trigger never has to reject.
- Screen dropdown, limited to that exhibitor's own screens from `screen_db`.
- Title dropdown, limited to lineup titles that are `confirmed` and whose `format` matches the chosen screen's `screen_format`.
- Play date picker, blocking any date before the title's `first_available_release_date`.
- On submit, a Server Action inserts a booking with `status = 'requested'`, stamping `requested_by` and `requested_at`. Catch any trigger exception and show its reason plainly.
- Exhibitors can cancel their own pending requests, which sets status to `cancelled`.

**Team side, the request queue:**
- A list of all `requested` bookings, with title, exhibitor, screen, country, and date, filterable and sortable.
- Confirm sets `status = 'confirmed'` and stamps `confirmed_by` and `confirmed_at`. Reject sets `status = 'rejected'`. Both are Server Actions, both revalidate the calendar.
- Confirming is an update, so the trigger re-checks every rule. Surface any failure clearly rather than as a raw error.

---

## Feature 3: Admin CRM (team only)

Simple, searchable screens to maintain the reference data.

- **Exhibitors** (`exhibitor_db`): list, search, add, edit. Shows the logo from Storage, country, the three format flags, and manager email.
- **Screens** (`screen_db`): list and filter by exhibitor, country, and format. Add and edit, covering site name, screen name and number, format, screen format, seat count, and opening date.
- **Lineup** (`lineup`): list, add, edit. The key action is toggling `confirmed`, since only confirmed titles can be booked. Shows format, release date, and notes. Let the team pick the title from `Title_master`.
- **Contacts** (new table): list, search, add, edit. Each contact links to one exhibitor and to any number of screens and titles through the link tables. The edit form needs a way to add and remove those links.

---

## Project structure

```
/app
  /login/page.tsx
  /calendar/page.tsx            # Feature 1, team landing
  /requests/page.tsx            # Feature 2, exhibitor request form + team queue by role
  /crm/exhibitors/page.tsx
  /crm/screens/page.tsx
  /crm/lineup/page.tsx
  /crm/contacts/page.tsx
  /actions/bookings.ts          # request, confirm, reject, cancel
  /actions/crm.ts
  /actions/auth.ts              # logout
  layout.tsx
  globals.css
/utils/supabase
  server.ts                     # reuse existing
  client.ts                     # reuse existing
  middleware.ts                 # reuse existing
/middleware.ts                  # session refresh + route protection
/components                     # FilterBar, CalendarGrid, RequestForm, RequestQueue, DataTable, etc.
```

Route users by role: team sees calendar, requests queue, and CRM; exhibitors see their own calendar and request form only. Enforce this in middleware and re-check on each page.

---

## Deliverables

1. One integrated Supabase SQL script: `profiles`, `contacts`, the two link tables, all RLS policies, and any signup trigger.
2. Reuse of the existing `utils/supabase` helpers, plus `/middleware.ts` for session and route protection.
3. Login and logout.
4. The calendar, team and exhibitor versions (Feature 1).
5. The request and confirm workflow (Feature 2).
6. The CRM screens (Feature 3).
7. Reusable components.
8. A short setup and run guide, using the env variables already in `.env.local`.

---

## Design notes

Keep it clean, functional, and quick to scan. This is a working tool used daily, so clarity beats decoration.

- A filter bar that stays put while the calendar scrolls.
- Status reads at a glance: confirmed in solid green, requested in amber with a dashed border.
- Generous spacing, clear typography, no heavy chrome.
- Laptop screen first. It does not need to be mobile-optimised.

Before building any feature, if a requirement is unclear or a decision carries a real trade-off, ask first rather than guessing. Connect to Supabase and confirm the live schema before writing the SQL or the queries.
