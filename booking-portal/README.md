# CJ 4DPLEX Programming & Bookings

Internal tool for managing 4DX / ScreenX / ULTRA 4DX programming across
exhibitor cinemas. Exhibitors sign in to request play dates for confirmed
lineup titles on their own screens; the CJ team reviews requests, manages the
calendar, and maintains the reference data (exhibitors, screens, lineup,
contacts).

Built with Next.js 16 (App Router), Supabase (auth + Postgres + Storage,
project `cvershkiffvpbnuxfaxk`), and `@supabase/ssr`.

## One-time database setup

Run the integrated SQL script once in the Supabase SQL editor:

```
Database/supabase/migrations/20260703100000_booking_portal_auth.sql
```

It widens the lineup format check to the live screen formats
(`4DX`, `ScreenX`, `Ultra4DX`, `UltraScreenX`), replaces the old
`exhibitor_portal_users` layer with a `profiles` table (roles `team` /
`exhibitor`), creates the contacts CRM tables, installs the signup trigger,
sets the full RLS policy matrix, and adds `poster_path` / `logo_path` columns
for the private `IMAGES` Storage bucket.

## Provisioning accounts

There is no public sign-up. In the Supabase dashboard (Authentication → Users):

1. **Team user** — add a user with email + password, then in the `profiles`
   table set their `role` to `team`.
2. **Exhibitor user** — add a user (the exhibitor's `manager_email` is the
   natural choice), then set the profile's `exhibitor_unique` to their
   `exhibitor_db` row. Leave `role` as `exhibitor`.

The signup trigger creates the `profiles` row automatically; you only set the
role or exhibitor link afterwards.

## Running the app

`.env.local` (not committed) needs:

```
NEXT_PUBLIC_SUPABASE_URL=https://cvershkiffvpbnuxfaxk.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from the dashboard>
```

Then:

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

## How it fits together

- **Reads** happen in Server Components, **writes** in Server Actions
  (`app/actions/*.ts`). Sessions are refreshed in `proxy.ts` (Next 16's name
  for middleware) via `utils/supabase/middleware.ts`.
- **Row-level security** does the real enforcement: exhibitor accounts only
  ever see their own bookings, screens, and exhibitor row, and can only
  insert `requested` bookings or cancel their own pending ones. Team accounts
  (`profiles.role = 'team'`) have full access. The UI role checks are
  conveniences on top.
- The `validate_booking` trigger re-checks every rule on insert *and* update
  (screen ownership, format match, confirmed lineup, release date). The
  request form only offers valid combinations, and any trigger exception is
  translated to plain English in `lib/display.ts`.
- **Images**: the private `IMAGES` bucket holds `Posters/` and
  `Logo and Branding/`. Rows point to files via `film_imdb_db.poster_path` /
  `exhibitor_db.logo_path`; the app renders them with 1-hour signed URLs and
  falls back to a clean placeholder. Format brand logos are copied into
  `public/` for the app chrome. To give a title a poster, upload the file to
  `Posters/` and put its path (e.g. `Posters/MyFilm.jpg`) in `poster_path`.

## Routes

| Route | Who | What |
| --- | --- | --- |
| `/login` | everyone | email + password sign-in |
| `/calendar` | both | month-column calendar of bookings (team sees all + full filter bar; exhibitors see their own) |
| `/requests` | both | exhibitors: request form + their requests; team: pending request queue with confirm/reject |
| `/crm/exhibitors,screens,lineup,contacts` | team | reference-data admin; lineup `confirmed` toggle controls what is bookable |
