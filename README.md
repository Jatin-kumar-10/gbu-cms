# GBU-CMS — Campus Maintenance Management System (Node.js / Express build)

This is the Node.js/Express port of the scoped-down Simplified SRS v0.1 build:
complaint registration → verification → work order → technician execution →
material issue/consumption → inspection/closure → feedback, across Civil /
Electrical / Horticulture departments, with 5 roles (User, Officer, Technician,
Store Officer, Admin).

It was built and fully tested end-to-end (every API route + all 18 pages) in a
real **PostgreSQL** instance before being handed to you.

## Stack

- **Node.js** (Express 4) — REST API + server-rendered pages
- **EJS** — templates (Bootstrap 5 via CDN, no build step)
- **PostgreSQL** via the `pg` package — same 10-table schema as the PHP build
- **express-session** — session-based auth (role stored server-side)
- **multer** — photo uploads (complaint photos, before/after work photos)
- **bcryptjs** — password hashing

No React, no webpack/vite, no TypeScript compile step — just `node server.js`.

## What's included

```
GBU-CMS-node/
├── database/
│   ├── schema_postgres.sql   ← PostgreSQL schema + seed data (USE THIS)
│   └── schema.sql            ← MySQL/MariaDB equivalent, if you ever switch DBs
│                                (would need src/db.js swapped back to mysql2)
├── src/                      ← db pool (Postgres, with a mysql2-style query shim),
│                                auth middleware, helpers, upload config
├── routes/                   ← REST API routes (JSON), one file per resource
├── views/                    ← EJS templates: role-based pages + shared partials
├── public/
│   ├── assets/                ← app.js (fetch client) + style.css
│   └── uploads/                ← complaint/work-order photos get saved here
├── server.js                  ← app entry point
├── package.json
├── .env.example
└── README.md (this file)
```

## 1. Requirements

- **Node.js 18+** (you have v24.21.0 — plenty new enough)
- **PostgreSQL** (any recent version — 13+ is fine)

Nothing else. No global CLI installs needed beyond `npm`.

## 2. Install dependencies

```
npm install
```

## 3. Set up the database

Using `psql` (adjust user/host as needed for your local Postgres install):
```
psql -U postgres -c "CREATE DATABASE gbu_cms;"
psql -U postgres -d gbu_cms -f database/schema_postgres.sql
```
Or, if you use a GUI tool (pgAdmin, DBeaver, the VS Code PostgreSQL extension,
etc.): create a database named `gbu_cms`, then run the contents of
`database/schema_postgres.sql` against it.

This creates all 10 tables and seeds:
- 3 departments (Civil, Electrical, Horticulture)
- 3 buildings / 6 rooms (demo locations — add your real ones via the Admin UI)
- 5 inventory items
- 7 demo user accounts (see table below)

## 4. Configure the app

```
copy .env.example .env        (Windows PowerShell: Copy-Item .env.example .env)
```
Edit `.env`:
```
PORT=8000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=gbu_cms
DB_USER=postgres
DB_PASS=yourpassword
SESSION_SECRET=any-random-string-here
```

## 5. Run it

```
npm start
```
Open **http://localhost:8000**.

For auto-restart on file changes while developing: `npm run dev` (uses Node's
built-in `--watch`, no nodemon dependency needed).

## 6. Demo logins

Password for every seeded account: **`Password@123`**

| Email | Role |
|---|---|
| admin@gbu.ac.in | System Administrator |
| officer.civil@gbu.ac.in | Maintenance Officer (Civil) |
| officer.elec@gbu.ac.in | Maintenance Officer (Electrical) |
| tech.ramesh@gbu.ac.in | Technician (Civil) |
| tech.suresh@gbu.ac.in | Technician (Electrical) |
| store@gbu.ac.in | Store Officer |
| student.aditi@gbu.ac.in | Student (can also self-register more via /register) |

## 7. What to click through for a demo

1. Log in as **student.aditi** → Register New Complaint → submit.
2. Log in as **officer.civil** (or officer.elec) → open the pending complaint →
   Verify → Create Work Order → assign a technician.
3. Log in as **tech.ramesh** (or suresh) → open the work order → Start Work →
   Request Material → Mark Complete.
4. Log in as **store** → Inventory → Issue the pending material request (stock
   auto-deducts; low-stock alert fires if it crosses the threshold).
5. Back as the technician → Record Consumption on the issued material.
6. Back as the officer → Accept & Close the work order (or Reject to send it
   back for rework).
7. Log in as the student again → Feedback or Reopen (7-day window).
8. Log in as **admin** → Manage Users / Manage Locations.
9. Any officer/admin/store login → Reports → KPIs, breakdowns, CSV export.

## 8. Nothing external required

No third-party API keys, SMS/email gateways, or paid services. Notifications
are in-app only (per your Scope Review doc, Section 12). Photo uploads are
stored locally under `public/uploads/`.

## 9. Same known simplifications as the PHP build

- No vendor/contractor module, no cost/billing, no preventive-maintenance
  scheduler, no configurable multi-level approvals, no material return/
  reconciliation, no SMS/WhatsApp/email, no native mobile app.
- Officers are not hard-restricted to only their own department's complaints
  at the route level (UI naturally routes work correctly; tighten in
  `routes/complaints.js` / `routes/workorders.js` if your evaluator probes this).
- Session store is in-memory (`express-session` default) — fine for a demo;
  restarting the server logs everyone out.

## 10. Postgres-specific notes (in case you ever touch the DB layer)

- `src/db.js` wraps the `pg` package with a small shim that translates `?`
  placeholders to Postgres's `$1, $2, ...` and auto-appends `RETURNING id` to
  INSERT statements, so every route file reads and writes exactly like it
  would against MySQL. If you add new raw SQL yourself, keep using `?` for
  parameters — the shim handles the rest.
- Boolean columns (`is_active`, `is_read`) are real Postgres `BOOLEAN`, not
  `0`/`1` — compare with `= true` / `= false` in any new SQL you write, not
  `= 1`.
- `COUNT(*)` comes back from Postgres as a string (bigint precision safety);
  `routes/reports.js` already converts it with `Number(...)` where it matters.

## 11. Connection / Setup Checklist

| Needs connecting | Required? | Where |
|---|---|---|
| PostgreSQL | **Yes** | `.env` → `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS` |
| npm packages | **Yes** (one-time `npm install`) | already in `package.json` |
| SMS/Email/WhatsApp API | No | out of scope per your Scope Review doc |
| Any cloud/API key | No | fully self-contained, uploads saved locally |
