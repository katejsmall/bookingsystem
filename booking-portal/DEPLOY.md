# Putting the portal on a shareable URL

For a test deployment that people outside this machine can reach. The
database (Supabase) is already cloud-hosted, so only the Next.js app needs
somewhere to run.

## Recommended: Vercel

Built by the Next.js team, so Next 16 runs with no adapter or config. Free
tier is fine for testing.

### One-time setup

```bash
cd "0703 Booking System/booking-portal"
npx vercel login
npx vercel            # first run: creates the project, deploys a preview
npx vercel --prod     # promote to the main URL
```

Vercel picks up `vercel.json` (pins the region to Frankfurt — see below)
and auto-detects Next.js. It will *not* upload `node_modules`, `.next` or
`.env.local` (all in `.gitignore`).

### Environment variables — required

`.env.local` is deliberately not uploaded, so set both keys on Vercel
(Project → Settings → Environment Variables), for **Production, Preview and
Development**:

| Name | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | in local `.env.local` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | in local `.env.local` |

Or from the CLI:

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Both are safe to expose — they're the public client keys. The security
boundary is Supabase **row-level security**, not key secrecy. The secret /
service-role key is *not* used by this app and must never be added here.

### Why the region is pinned

`vercel.json` sets `"regions": ["fra1"]` (Frankfurt). Supabase for this
project lives in **eu-central-1**, and Vercel otherwise defaults to US East
— every query would then cross the Atlantic twice. These pages fire a lot
of queries (booking reads page in parallel), so the wrong region is the
difference between ~1s and several seconds per page.

### Supabase settings to update after the first deploy

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: the Vercel production URL
- **Redirect URLs**: add the Vercel URL (and `https://*.vercel.app` if you
  want preview deployments to work too)

Login here is email + password, so this mostly matters for any future email
flows (password reset, invites) — worth setting straight away regardless.

## Before sharing the link — read this

The database holds **real business data**: 168 exhibitors, real contact
names and email addresses, and ~21,700 real bookings. A public URL plus a
working password is all anyone needs to see it.

1. **Rotate the two beta passwords.** `4dplex@cj.net` and
   `exhibitor.beta@cj.net` currently use the simple beta passwords that
   have been shared in chat. Change them in Supabase Dashboard →
   Authentication → Users before the app is publicly reachable.
2. **Consider Vercel Deployment Protection** (Project → Settings →
   Deployment Protection) if you want a gate in front of the login page
   itself. Password protection on *production* needs a Pro plan; preview
   deployments can be protected on the free plan.
3. **Vercel's free tier is for non-commercial use.** For an internal
   company tool, a Pro seat (~$20/month) is the correct plan — worth
   knowing before this becomes permanent rather than a test.

## Alternative, if you'd rather deploy from GitHub

Better once several people are working on it — every push auto-deploys and
you get history plus one-click rollback.

```bash
cd "0703 Booking System/booking-portal"
git init && git add . && git commit -m "Initial commit"
gh repo create cj4dplex-booking-portal --private --source=. --push
```

Then in Vercel: *Add New → Project → import the repo*. Set the same two env
vars. Note the repo must be **private** — not because of the keys (those are
public by design) but because the code encodes internal business rules.

## Known limitations of a test deployment

- `/calendar` sends ~2.9 MB to the browser and loads 45 days of history.
  Fine over good wifi, slow on mobile data.
- There is no signup flow by design; accounts are provisioned by the team
  in the Supabase dashboard.
- Deleting a booking or editing CRM data on this deployment edits the
  **real** database — there is no separate staging database. If you want
  people to click freely without consequences, that's a second Supabase
  project, not just a second web deployment.
