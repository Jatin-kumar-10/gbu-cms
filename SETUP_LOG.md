# GBU-CMS Setup Log

- 2026-11-24 16:15 — retrying connection to PostgreSQL 17 (postgres@127.0.0.1:5432)
- 2026-11-24 16:15 — connection failed — password authentication failed for user postgres; setup paused awaiting correct password
- 2026-11-24 16:17 — connecting to PostgreSQL 17 with updated password
- 2026-11-24 16:17 — connected: PostgreSQL 17.12 on x86_64-windows, compiled by msvc-19.44.35230, 64-bit
- 2026-11-24 16:17 — creating gbu_cms database
- 2026-11-24 16:17 — gbu_cms database created
- 2026-11-24 16:17 — loading database\schema_postgres.sql into gbu_cms
- 2026-11-24 16:17 — schema loaded, 11 tables created, 7 seed users
- 2026-11-24 16:17 — updating DB_PASS in .env
- 2026-11-24 16:17 — .env updated (DB_PASS set)
- 2026-11-24 16:17 — starting app with npm start
- 2026-11-24 16:17 — server running on http://localhost:8000 (admin login: HTTP 200)
- 2026-11-24 16:25 — git initialized, initial commit 97f55ee (.env excluded), pushed to origin/main (github.com/Jatin-kumar-10/gbu-cms)
- 2026-11-24 16:31 — checking Neon deployment database (neondb) before schema load
- 2026-11-24 16:31 — loading database\schema_postgres.sql into Neon (neondb)
- 2026-11-24 16:31 — Neon schema loaded: 11 tables, 7 seed users
- 2026-11-24 16:32 — committing and pushing to origin/main
