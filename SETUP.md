# Optical CRM — Setup Guide

Everything needed to take this project from code on this PC to a live website for the shop.
Work through it top to bottom. Steps you have already done are marked.

**Golden rule for every account created below: sign up with the SHOP's Gmail
(`capitalng1001@gmail.com`), not a personal address.** The shop must own its data and
hosting forever, no matter who develops or maintains the app later. (The old website
broke this rule — the developer owns the Firebase project — and that is exactly why
migrating was painful.)

---

## 0. Already done on this PC

- [x] Node.js LTS installed
- [x] App scaffolded and building (`npm run build` passes)
- [x] Legacy data recovered: 22,098 clean records ready in `migration/cleaned-customers.json`
      (from the 2019 snapshot; re-run against `live-users.json` when the password is recovered
      to capture 2019–2026 additions)

## 1. Create the Supabase project (the database)

1. Go to <https://supabase.com> → **Start your project** → sign up **with the shop's Gmail**
   (choose "Continue with Google" and pick the shop account).
2. Create a **New project**:
   - Organization: default is fine.
   - Name: `optical-crm`
   - Database password: generate a strong one and save it in a safe place
     (only needed for rare admin tasks, not daily use).
   - **Region: Southeast Asia (Singapore)** — closest to the shop.
   - Plan: Free.
3. Wait ~2 minutes for the project to provision.

### 1a. Create the database tables

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Open `supabase/schema.sql` from this project, copy ALL of it, paste, press **Run**.
3. It should say "Success. No rows returned".

### 1b. Create the staff login and lock signups

1. **Authentication → Users → Add user → Create new user.**
   - Email: the shop's Gmail is fine (or `staff@` anything — it is just a username).
   - Password: a NEW strong password (not the old site's, not the Gmail one).
     Write it down for the shop.
   - Tick **Auto Confirm User**.
2. **Authentication → Sign In / Up → disable "Allow new users to sign up"**.
   ⚠️ Do not skip this: with signups open, any stranger could create an account and
   pass the "signed-in staff" security check.
3. Sessions: nothing to configure — staff stay signed in on the shop desktop
   indefinitely (tokens refresh automatically while the app is used).

### 1c. Copy the API keys

**Project Settings → API Keys** (tab "Publishable and secret API keys"). You need:

| Value | Where it is | Goes into |
|---|---|---|
| Project URL (`https://xxxx.supabase.co`) | Project Settings → General | `.env` → `VITE_SUPABASE_URL` |
| **Publishable key** (`sb_publishable_...`) | API Keys page | `.env` → `VITE_SUPABASE_ANON_KEY` |
| **Secret key** (`sb_secret_...`, click Reveal) | API Keys page | Migration import only (step 3). **Secret** — never in `.env`, never in git, never in the browser. |

(Supabase also shows a "Legacy anon, service_role" tab — those older keys work the
same way if you prefer them: anon ↔ publishable, service_role ↔ secret.)

## 2. Run the app locally against the real database

The `.env` file already exists at `optical-crm\.env` (next to `package.json`).

```powershell
cd "d:\projects\New folder\optical-crm"
notepad .env        # paste the Project URL and publishable key, save
npm run dev
```

Open <http://localhost:5173>, sign in with the staff user from step 1b.
An empty search screen with "+ Add Customer" means everything works.
Try adding a test customer with a visit (Rx + a purchase item), then delete it (check it
lands in Trash).

## 3. Import the legacy customers

The cleaned data (`migration/cleaned-customers.json`, 23,885 records from the live
export) is already prepared. Just run the import:

```powershell
cd "d:\projects\New folder\optical-crm"



# Replace the placeholders. The second value is the SECRET key
# (sb_secret_..., click Reveal on the API Keys page) — keep it secret.
$env:SUPABASE_URL = "https://nogzeilgpnoiriaprhav.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "PASTE-SECRET-KEY-HERE"   # never save the real key in a file
node migration/import.mjs
```

(If a fresh Firebase export is ever taken, re-run
`node migration/prepare.mjs migration/live-users.json` first to rebuild the cleaned file.)

Takes a few minutes for ~22k records. The script refuses to double-import.
Afterwards, search for a few customers in the app and compare against the old
system / physical cards.

## 4. Put the code on GitHub (needed for hosting + it's your code backup)

1. <https://github.com> → sign up **with the shop's Gmail**.
2. Create a new repository: name `optical-crm`, visibility **Private**.
3. On this PC:

```powershell
cd "d:\projects\New folder\optical-crm"
git init
git add .
git commit -m "Optical CRM initial version"
git branch -M main
git remote add origin https://github.com/SHOP-USERNAME/optical-crm.git
git push -u origin main
```

`.gitignore` already blocks `.env` and the customer-data JSON files from being uploaded.

## 5. Deploy to Cloudflare (the live website)

1. <https://dash.cloudflare.com/sign-up> → sign up **with the shop's Gmail**.
2. **Workers & Pages → Create → Import a repository** → authorize GitHub →
   pick the `optical-crm` repo.
3. On the "Set up your application" form:
   - Project name: `optical-crm`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy` (the default — it reads `wrangler.jsonc`
     from the repo, which serves the built `dist/` folder as a single-page app)
   - Path, non-production branch settings: leave the defaults
   - API token: leave on "Create new token" (automatic)
   - **Variables** — add both, NOT encrypted (they must be readable at build time,
     and neither is a secret):
     - `VITE_SUPABASE_URL` = the project URL
     - `VITE_SUPABASE_ANON_KEY` = the publishable key
4. **Create and deploy.** After a minute or two you get
   `https://optical-crm.<something>.workers.dev` — open it, sign in once,
   bookmark it on the shop's devices, done.
   (A custom domain can be added later in the Worker's Settings → Domains & Routes.)
5. From now on, every `git push` to `main` redeploys the site automatically.

## 6. Go-live day checklist (do these in one morning)

1. Re-run the Firebase export one final time (`migration/export-from-browser.js` on the
   shop desktop's signed-in browser, same as before) and re-import into a **fresh**
   Supabase project OR verify no new customers were added since the last import.
2. Swap the bookmark on the shop desktop to the new site; remove the old one.
3. Change the old site's password (any staff member can: old site → whatever
   password-change exists, or simply tell staff the old site is retired).
4. Staff instruction: physical cards stay behind the counter for 2 weeks as backup;
   copy a card into the app whenever its customer visits.
5. Test the **Export** page once — download both CSVs and put them in the shop's
   Google Drive. Repeat weekly (or monthly at minimum). This is the backup.

## 6b. Attached scans and documents — housekeeping

Scans (PDFs and photos) attached to customers live in a **private** Supabase Storage
bucket called `customer-docs`, separate from the database.

**Storage plan — read this before uploading in bulk.** Photos are shrunk in the browser
before upload (long edge 2000px, JPEG), which turns a typical 3–4 MB camera photo into
roughly 300–500 KB. Even so:

| What the shop stores | Roughly | Fits the free 1 GB? |
|---|---|---|
| New visits only, ~30-40% get a scan | ~0.2 GB/year | Yes, for several years |
| Backfilling ~35% of all 23,885 customers | **5–10 GB** | **No — needs Supabase Pro** |

Since the shop plans to build up scans for existing customers too, budget for
**Supabase Pro (~USD 25/month)**: 100 GB of storage, plus the automatic daily backups
the free plan does not have. Watch the meter on the Export page — it warns at 80% — and
upgrade in Dashboard → Settings → Billing. After upgrading, change `PLAN_STORAGE_BYTES`
in `src/lib/documents.ts` to `100 * 1024 ** 3` so the meter shows the right ceiling.

Three other things to know:

1. **Never make the bucket public.** Dashboard → Storage → `customer-docs` must always
   read *Private*. These are medical records; a public bucket means anyone with the URL
   can read them. Re-running `supabase/patch-customer-documents.sql` resets it if it is
   ever changed by accident.
2. **The CSV export does not contain the files.** "Document list (CSV)" on the Export page
   records which file belongs to which customer; the files themselves need their own copy:
   ```powershell
   supabase storage cp -r ss://customer-docs ./optical-scans-backup --experimental
   ```
   (Or download them from Dashboard → Storage.) Do this alongside the CSV backups.
3. **Files stay forever unless someone removes them**, and a removed file still occupies
   space until it is purged. See the commented-out housekeeping query at the bottom of
   `supabase/patch-customer-documents.sql`.

Accepted formats: PDF, JPEG, PNG, WebP, HEIC, TIFF — 25 MB per file.

## 7. Later / optional

- **Supabase Pro (USD 25/mo)** — automatic daily backups + no free-tier idle pause.
  Recommended once the shop relies on the system daily. Until then, the CSV export
  routine is the safety net.
- **More logins/roles** — create extra users in Supabase Auth; the `profiles.role`
  column (`superuser` / `staff` / `optometrist`) is already in the schema when
  role-based restrictions are wanted.
- **Nightly automated backup** — a GitHub Action that exports CSVs to Google Drive
  on a schedule. Ask Claude when ready.
- **Automatic warranty messages** — today the Warranty page is a working list and staff
  contact each customer themselves. Sending automatically would need Meta's WhatsApp
  Cloud API: business verification, a payment card, pre-approved templates,
  ~RM0.06/message, customer opt-in consent, and the shop's number could then no longer
  be used in the WhatsApp Business *app*. Worth revisiting only if the list gets too
  long to work through by hand.
- **Retire the old site** — after 2–4 weeks of smooth running, ask the old
  developer/host to take `capital.ergroup.info` down.
