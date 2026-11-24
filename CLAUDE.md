# GBU-CMS — Node.js/Express build — project notes for Claude Code

This file is read automatically by Claude Code when run inside this folder.
If the user asks you to "set up" or "run" this project, follow the steps below
in order. Everything here is non-interactive except where a real decision is
needed (noted below).

## What this project is

A campus maintenance complaint-tracking system (GBU-CMS) for a college minor
project: complaint registration → verification → work order → technician
execution → material issue/consumption → inspection/closure → feedback, across
Civil / Electrical / Horticulture departments, with 5 roles (User, Officer,
Technician, Store Officer, Admin).

Stack: Node.js + Express 4 + EJS templates (Bootstrap via CDN) + PostgreSQL
(via the `pg` package). No build step, no React, no TypeScript.

## One-time setup

1. **Database — Postgres via Docker** (the user has Docker Desktop installed;
   there is no standalone PostgreSQL server on this machine). Run:
   ```
   docker run --name gbu-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gbu_cms -p 5432:5432 -d postgres:16
   ```
   Wait a few seconds for it to start, then load the schema + seed data:
   ```
   Get-Content database\schema_postgres.sql | docker exec -i gbu-postgres psql -U postgres -d gbu_cms
   ```
   (If the container already exists from a previous run, `docker start gbu-postgres`
   instead of `docker run` — don't re-create it, and don't re-run the schema
   load against a container that already has data unless the user asks for a
   reset, since schema_postgres.sql will error on tables that already exist.)

2. **Install npm dependencies:**
   ```
   npm install
   ```

3. **Environment file** — if `.env` doesn't exist yet:
   ```
   Copy-Item .env.example .env
   ```
   Then set these values to match the Docker container above (no need to ask
   the user — these are the known values from step 1):
   ```
   DB_HOST=127.0.0.1
   DB_PORT=5432
   DB_NAME=gbu_cms
   DB_USER=postgres
   DB_PASS=postgres
   SESSION_SECRET=<generate any random string>
   ```

4. **Run it:**
   ```
   npm start
   ```
   The app listens on http://localhost:8000 (or whatever `PORT` is set to).

## Demo logins (password `Password@123` for all)

| Email | Role |
|---|---|
| admin@gbu.ac.in | Admin |
| officer.civil@gbu.ac.in | Officer (Civil) |
| officer.elec@gbu.ac.in | Officer (Electrical) |
| tech.ramesh@gbu.ac.in | Technician (Civil) |
| tech.suresh@gbu.ac.in | Technician (Electrical) |
| store@gbu.ac.in | Store Officer |
| student.aditi@gbu.ac.in | Student |

## Project layout

- `server.js` — Express app entry point, mounts all routes
- `routes/*.js` — REST API, one file per resource (complaints, workorders,
  inventory, feedback, notifications, reports, adminUsers, adminLocations,
  lookups, auth)
- `views/**/*.ejs` — server-rendered pages, one folder per role
- `src/db.js` — Postgres connection pool with a small shim that lets the rest
  of the app use `?` placeholders (mysql2-style) instead of Postgres's native
  `$1, $2, ...`, and auto-appends `RETURNING id` to INSERTs
- `src/auth.js` — session-based auth middleware (`requireLogin`, `requireRole`,
  `requireRolePage`, etc.)
- `database/schema_postgres.sql` — the schema to use. `database/schema.sql` is
  a leftover MySQL version from an earlier iteration of this project and is
  **not used** — safe to ignore or delete.

## Known simplifications (intentional — this is a scoped-down minor project)

- No vendor/contractor module, no cost/billing, no preventive-maintenance
  scheduler, no configurable multi-level approvals (one fixed officer-inspection
  step), no material return/reconciliation (issue + consume only), no
  SMS/WhatsApp/email (in-app notifications only), no native mobile app.
- Officers are not hard-restricted to only their own department's complaints at
  the route level.
- Session store is in-memory — restarting the server logs everyone out.

## Conventions to follow if asked to add features

- Keep using plain SQL with `?` placeholders via `pool.query(...)` / the
  `getConnection()` transaction helper in `src/db.js` — don't introduce an ORM.
- Boolean columns (`is_active`, `is_read`) are real Postgres booleans — compare
  with `= true` / `= false`, never `= 1`.
- New routes should follow the existing pattern: `requireLogin`/`requireRole`
  from `src/auth.js`, JSON responses via `res.json(...)` / `res.status(n).json({error: ...})`.
- New pages go in `views/<role>/`, extending `views/partials/header.ejs` and
  `views/partials/footer.ejs`, and fetch data client-side via the `Api` object
  in `public/assets/app.js` (same pattern as every existing page).
