# CadenceIQ database on plain Postgres (AWS RDS prep)

Proves the Supabase schema and security policies run on plain Postgres 17, the engine AWS RDS
uses. Runs entirely on this machine with synthetic data.

```bash
cd aws/db && npm install && npx playwright install chromium   # once
npm test            # everything: database checks, then app checks (~1 minute)
npm run test:db     # database + security policies only
npm run test:app    # the real app, clicked through in a browser
npm run test:report # open the last app-test report (screenshots and traces of any failure)
```

`test:db` builds a throwaway database, loads the files below in order, runs the security
tests, and deletes the database. `test:app` (in `e2e/`) starts the local stack from
`local-app/`, runs the unmodified app against it, and signs in as each fake account to check
sign-in and two-step verification, every tab, adding/editing/deleting a patient (verified in
the database and the audit log), and that each account sees only its own practice or office.
Every app test also fails if the browser contacts anything outside this machine, logs an
unexpected error, or crashes to the error screen.

A test wrapped in `test.fail(...)` documents a known bug that has not been fixed yet; the suite
flags it as soon as the fix lands, and the wrapper should then be removed.

| File | What it is |
|---|---|
| `00_supabase_compat.sql` | Stand-ins for the Supabase pieces the migrations use: `anon`/`authenticated`/`service_role` roles, `auth.uid()`, `auth.jwt()`, `auth.users`, default grants. |
| `01_baseline_reconstructed.sql` | The original dashboard-created tables, **rebuilt from App.jsx**. Replace with a real `pg_dump --schema-only` of production before cutover. |
| `02_seed_placeholder_practice.sql` | Placeholder `miller-ortho` row the hardening migration expects. Not needed when loading a production dump. |
| `../../supabase/migrations/*.sql` | The real migrations, unchanged. |
| `patches/` | Local fixes for bugs found here that also exist on Supabase. Delete each once its migration is fixed. |
| `tests/api-session.mjs` | The per-request pattern the AWS API layer will use (login role → verified claims → `SET LOCAL ROLE authenticated`), including no leakage between pooled requests. |

Open items for RDS: confirm the master user can grant `BYPASSRLS` to `service_role`, and map
Cognito's MFA state to the `aal` claim (`aal2` only after MFA), which the policies require.

## Clicking through the real app on the test database

```bash
node aws/db/local-app/start.mjs          # terminal 1: test database + data layer + login stand-in
npm run dev -- --mode awslocal --port 5174   # terminal 2: the unmodified app, pointed at it
```

Or use the `local-test-backend` and `app-on-local-test-backend` entries in `.claude/launch.json`.
Fake logins are in `local-app/demo-users.mjs`; the current six-digit code for any of them is at
`http://localhost:54321/__dev/totp?email=<address>`. Email, billing and Greyfinch calls are
stubbed, so nothing leaves the machine. Stopping `start.mjs` deletes the test database.

`local-app/bin/postgrest` (PostgREST 14.1, the version Supabase runs for this project) is not
committed; download `postgrest-v14.1-macos-aarch64.tar.xz` from the PostgREST GitHub releases
into that folder.
