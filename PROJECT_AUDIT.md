# CJ 4DPLEX Booking Portal — Project Audit (2026-07-23)

## What this is

An internal web tool for CJ 4DPLEX (the company behind 4DX, ScreenX, Ultra4DX, UltraScreenX cinema formats) to manage programming — which movie titles are confirmed for which format, and which exhibitor cinemas have booked which title on which screen for which play date. It replaces a manual Google Sheet workflow. Two user roles:

- **Team** (CJ 4DPLEX staff): sees everything across all exhibitors, confirms/rejects booking requests, maintains the reference data (exhibitors, screens, lineup, contacts).
- **Exhibitor** (a cinema chain, e.g. "KNCC", "Pathé", "CGV"): sees only their own screens and bookings, requests play dates for confirmed titles, can recommend titles for production and vote on speculative ("TBD") titles.

Not a consumer product — no public sign-up, no ticketing, no seat maps. A working internal tool used daily by a small team plus exhibitor contacts.

## Stack & architecture

- Next.js 16 (App Router), React, TypeScript, Tailwind v4
- Supabase (Postgres + Auth + Storage), `@supabase/ssr` for session handling
- Server Components for reads, Server Actions for writes, Row-Level Security enforced at the DB level (not just UI)
- Code lives at `0703 Booking System/booking-portal`
- Supabase project `cvershkiffvpbnuxfaxk` (EU-central-1)

## Data model (core tables)

```
Title_master        -- hub every title hangs off (title_no PK)
film_imdb_db         -- IMDb metadata per title (poster_path, genre, etc.)
lineup                -- one row per (title, format) with confirmed flag + release date
exhibitor_db          -- cinema chains, format flags (4dx/screenx/ultra4dx), manager_email
screen_db              -- one row per format install at a site (screen_format: 4DX/ScreenX/Ultra4DX/UltraScreenX)
bookings                -- the core workflow: screen + lineup + exhibitor + play date + status
  status: requested | confirmed | rejected | cancelled
  programming_weeks: how many weeks the booking runs (1-52)
production_requests   -- exhibitor free-text-recommends a title for production; team confirms/declines
tbd_titles / tbd_votes -- team posts speculative titles; exhibitors vote yes/no/tbd
contacts / contact_screens / contact_titles -- CRM contact records, linked to screens & titles
profiles               -- links auth user -> role (team/exhibitor) -> exhibitor_unique
```

A DB trigger `validate_booking` enforces on every insert/update: the screen belongs to the requesting exhibitor, the screen's format matches the lineup title's format (Ultra4DX/UltraScreenX normalize to their base format for this check), the lineup title is confirmed, and the play date isn't before the title's release date.

## Current live data scale (as of 2026-07-23)

168 exhibitors, ~1,523 screens, ~1,919 titles, ~2,100 lineup rows, 196 contacts, ~21,733 bookings (20,786 confirmed / 943 requested). Data is bulk-imported from the team's master Google Sheet export (16→9 tab Excel workbook) via `Database/scripts/import_programming_sheet.js`, safe to re-run whenever a fresh export arrives.

---

## Page-by-page audit

### `/calendar` — Lineup calendar
**Purpose:** the landing view. Team sees every booking across all exhibitors on a month-by-month calendar; exhibitors see the same thing scoped to their own bookings. Meant to answer "what's playing when, where."

**Current state:** Renders month columns of day cells; each booking becomes a pill on every day of its run (expanded from `requested_play_date` for `programming_weeks * 7` days). Filters: format, country, exhibitor, screen, status (team gets country/exhibitor, exhibitor view is pre-scoped). Filters persist to localStorage. Same-exhibitor/same-title/same-day bookings across multiple screens are grouped into one pill with a "×N" count.

**Does it fulfil the purpose? Partially, with real problems:**
- 🔴 **Broken as designed**: a multi-week booking renders as a *separate pill repeated on every single day* of its run instead of one continuous bar spanning start→end. For anything running more than a few days this makes the calendar unreadable — looks like dozens of different titles releasing daily when it's actually one title playing for a week+. This was flagged by the user and has **not yet been fixed** (a sidebar was added instead, by miscommunication).
- 🟡 Poster thumbnails next to each pill were tried and removed as too small to be useful at this density.
- 🟡 A "sidebar of upcoming titles in the exhibitor's format(s)" was just added to give exhibitors a catalogue-style browse/request entry point, but:
  - 🔴 **Bug**: the query sorts by `first_available_release_date` ascending with no floor — it shows the *oldest* confirmed titles (some already released back in February), not genuinely upcoming ones. Needs a `>= today` filter.
  - 🟡 Layout doesn't yet feel "intuitive" per user feedback — needs a design pass, not just the date-filter fix.
- 🟢 Filter persistence, cascading filters (country→exhibitor→screen), status colour-coding (confirmed green solid / requested amber dashed / rejected+cancelled greyed+hidden-by-default) all work as designed.
- 🟢 Month range auto-extends to cover the latest booking's run; "show earlier months" reveals history.

### `/requests` — Request & confirm workflow
**Purpose:** exhibitors request a play date for a confirmed title on their own screen; team reviews and confirms/rejects pending requests.

**Current state (exhibitor side, `RequestForm`):** Multi-select format checkboxes → title dropdown limited to the intersection of titles confirmed in *all* selected formats → screens auto-populate (matching exhibitor + format + title-confirmed), individually uncheckable → play date floor is the latest release date among the active formats → already-requested screen/title/date combos are disabled with a hint. Just extended to accept a `?title=` query param (from the new calendar sidebar) to pre-select a title and its formats.

**Current state (team side, `RequestQueue`):** One row per (exhibitor, title, play date) group — the natural shape of a bulk multi-screen submission — expandable to see the individual per-screen bookings. Confirm/Reject act on the whole group or a single screen; Reject requires an optional note that's surfaced back to the exhibitor. Filterable by format/country/exhibitor, sortable by any column, CSV export.

**Does it fulfil the purpose?** 🟢 Yes, this is the most complete and well-built part of the app. The trigger-aware form design (only ever offering valid combinations) genuinely prevents the DB exception path from firing in normal use.

**`MyRequests`** (exhibitor's own request history): status filter chips, expandable per-screen detail, cancel pending requests, and a "recent decisions" strip (last 14 days) as the deliberate stand-in for email notifications (Resend integration was scoped out and deferred by the user).

### `/production-requests` — Production requests
**Purpose:** exhibitors free-text-recommend a title they'd like to see produced in 4DX/ScreenX (for titles not yet in the catalogue at all — distinct from requesting a play date for an already-confirmed title). Team reviews and confirms/declines with a note.

**Current state:** Full CRUD-ish flow exists — form (title text, format radio, optional IMDb link/release date/notes) → team queue with status filters (under review/confirmed/declined, defaults to under review), country/exhibitor filters, decline-with-note flow mirroring the booking reject flow.

**Does it fulfil the purpose?** 🟢 Yes, appears complete and mirrors the booking request/confirm UX pattern well. Not yet observed in real usage/feedback from the user, so unverified against actual workflow friction.

### `/tbd-titles` (exhibitor) / `/crm/tbd-titles` (team) — Speculative title voting
**Purpose:** team posts titles that aren't confirmed yet ("would you book this if we produced it?"); exhibitors cast yes/no/tbd votes to gauge demand before committing to production.

**Current state:** Team CRUD page to add/search/filter TBD titles by format, toggle active/inactive (closing a poll), presumably see vote tallies (component was only skimmed). Exhibitor-facing vote form shows open titles with three vote buttons, persists the exhibitor's own prior vote, RLS blocks voting once a poll is closed (verified via direct RLS test in an earlier session).

**Does it fulfil the purpose?** 🟢 Appears functionally complete for a v1. Not yet load-bearing in daily use based on available context — worth checking with the user whether the team is actually using it.

### `/crm/exhibitors`, `/crm/screens`, `/crm/lineup`, `/crm/contacts` — Team-only admin (CRM)
**Purpose:** maintain the reference data that everything else hangs off — exhibitor records (formats, country, manager email, logo), screens (site/screen/format/seat count), lineup (which titles are confirmed for which format + release date, the gate for what's bookable), and contacts (linked to exhibitors, and optionally to specific screens/titles).

**Current state:** All four are search/filter + table + modal-based add/edit, following the same pattern (`Field`, `Modal`, `PrimaryButton` from `components/ui.tsx`). Lineup admin includes a one-click confirmed/unconfirmed toggle (the single most important flag in the app, since it's the gate the booking trigger checks) plus a title search-select (`TitleSearchSelect`) for linking to `Title_master`. Contacts support search across name/email/country/exhibitor and multi-link to screens/titles.

**Does it fulfil the purpose?** 🟢 Structurally complete CRUD for all four reference tables — this matches the original build prompt's Feature 3 spec closely.

**Known operational risk (not a bug, a scale concern):** these tables render everything client-side with no pagination/virtualization. Screens (~1,523 rows) and lineup (~2,100 rows) pages are already large (~1.2MB payload) and load in 2-3s — fine today, but will degrade further as more historical data accumulates. Flagged previously as a follow-up, not yet actioned.

### `/login`
**Purpose:** single login page, email/password via Supabase Auth, routes team→calendar and exhibitor→requests. No public sign-up; team provisions accounts.

**Current state:** 🟢 Matches spec, nothing notable to flag.

---

## Cross-cutting issues found in this session (2026-07-23)

1. **🔴 Calendar pill rendering doesn't represent a booking run correctly.** One booking = one title on one screen for N weeks, but the UI draws it as N separate same-looking pills, one per day, which reads as "20 different movies releasing every day." **Not yet fixed** — this was the original ask and got sidetracked by the sidebar work. Needs: a single bar per booking spanning from `requested_play_date` to `requested_play_date + programming_weeks*7 - 1`, rendered once with the title visible, not repeated per cell.
2. **🔴 New "Upcoming Titles" sidebar shows past titles, not upcoming ones.** `getUpcomingTitles` in `lib/data.ts` sorts by release date ascending with no lower bound — surfaces the oldest confirmed lineup rows (some already released) instead of what's actually coming up relative to today. One-line fix (add a `.gte("first_available_release_date", todayIso)` or equivalent), but flagged here since it hasn't been applied yet per the user's explicit "don't edit yet, audit first" request.
3. **🟡 Sidebar doesn't yet feel intuitive** (user's words) — beyond the date bug, the interaction model (static list + "Request →" link) may not be the right shape; worth a proper design pass once the calendar-bar fix lands, since a cleaner calendar will change how much room/attention the sidebar should get.

## Suggested priority order for next work

1. Fix the calendar's continuous-bar rendering (the core "is this calendar usable" issue — everything else is secondary until this reads correctly).
2. Fix the upcoming-titles date filter, then revisit its UX now that the calendar itself will look different.
3. Decide whether TBD-titles and production-requests are getting real usage — if not, worth a short check-in with the team rather than continued blind investment.
4. Pagination/virtualization for the CRM screens/lineup tables, once it actually starts to feel slow rather than pre-emptively.

---

*This document reflects the codebase and live DB as of 2026-07-23. It is a point-in-time snapshot, not a live source of truth — verify against current code before acting on any specific claim if much time has passed.*
