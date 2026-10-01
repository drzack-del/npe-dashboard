# Database security checks on AWS

Run through the AWS connector (RDS Data API, as `cadenceiq_admin`). Each check inserts fake
records inside a transaction, switches to a role (`authenticator`, `authenticated` with
verified-login claims, or `anon`), runs one statement, and rolls the whole transaction back,
so nothing is left in the database.

| Check | Expected | 2026-09-30 |
|---|---|---|
| Login role alone cannot read patients | permission denied | PASS |
| Signed-in user reads only their own practice's patients | 2 of 3 | PASS |
| Location owner reads only their own office's patients | 1 of 3 | PASS |
| Signed-in user can update a patient in their own practice | 1 row | PASS |
| Signed-in user cannot change another practice's patient | 0 rows | PASS |
| Signed-in user cannot add a patient to another practice | RLS violation | PASS |
| Anonymous request sees no patients | 0 rows | PASS |
| Staff member cannot promote themselves to admin | trigger rejects | PASS |
| Known gap in this version: password-only session (no two-step code) still reads patients | gap until the security update ships | GAP |

Fixtures: four fake users (two practice admins, a North location owner, a TC) and three fake
patients across two fake practices. After the run, `auth.users` holds 0 rows.

# Login (Cognito) checks

Run through the AWS connector with one fake account (`phase3-check@cadenceiq-test.invalid`,
created with emails suppressed and deleted afterwards). Authenticator codes are computed with
an RFC 6238 TOTP implementation that is self-tested against the RFC's published vector.

| Check | 2026-09-30 |
|---|---|
| Nobody can create their own account (sign-up refused) | PASS |
| Password shorter than 12 characters rejected | PASS |
| Correct password alone returns no token (authenticator setup required) | PASS |
| Authenticator setup completes and issues a token | PASS |
| Later sign-ins ask for the authenticator code | PASS |
| Wrong authenticator code rejected | PASS |
| Password + correct code returns an access token with `role=authenticated`, `aal=aal2`, `email`, `sub`, 60-minute lifetime | PASS |
| Test account removed afterwards (0 users) | PASS |

# Data layer checks over the internet (https://api-test.trycadenceiq.com)

Three fake Cognito accounts (two practice admins, one North location owner) with real
authenticator setup, plus fake practices and patients committed to the test database; all
removed afterwards (0 Cognito users, 0 rows in patients, tc_users, practices, auth.users).
Requests sent from outside AWS with Python urllib against `/rest/v1/patients`.

| Check | 2026-09-30 |
|---|---|
| `/health` returns 200 (PostgREST connected with the generated `authenticator` password) | PASS |
| Anonymous request sees no patients | PASS |
| Practice A admin sees only practice A (both offices) | PASS |
| Practice B admin sees only practice B | PASS |
| North office owner sees only North | PASS |
| Admin can update their own practice's patient | PASS |
| Admin cannot change another practice's patient (0 rows) | PASS |
| Admin cannot add a patient to another practice (403, RLS) | PASS |
| Tampered token rejected (401) | PASS |
| Token signed with a made-up key rejected (401) | PASS |
| Unsigned (`alg: none`) token rejected (401) | PASS |
| ID token instead of access token gets no patients | PASS |
| Garbage token rejected (401) | PASS |
| Plain HTTP (port 80) refused | PASS |
| TLS 1.1 refused | PASS |

# greyfinch-sync checks over the internet (https://api-test.trycadenceiq.com/functions/v1/greyfinch-sync)

Stack `cadenceiq-test-greyfinch` created 2026-10-01; code loaded from
`s3://cadenceiq-test-function-code-488482832567/greyfinch-sync/greyfinch-sync.zip` version
`5gEzO9W7VN.Vz4rnGCtc3bzO3yOvasQ5` (`CodeSha256` 2dVNWVZxJ9iDr7iXKRsqMCXzVyOfyThKPXL1DzgwYOk=, matches
the zip of `index.mjs` at commit 49f8183). Greyfinch secret empty. Four fake Cognito accounts with real
authenticator setup (Miller staff, another practice's admin, Miller North location owner, inactive
Miller staff), fake `practices`/`auth.users`/`tc_users` rows; all removed afterwards (0 Cognito
users; 0 rows in auth.users, tc_users, practices, patients). Requests sent from outside AWS with
Python urllib.

| Check | 2026-10-01 |
|---|---|
| No token → 401 | PASS |
| Garbage token → 401 | PASS |
| Tampered token (changed `sub`) → 401 | PASS |
| Unsigned (`alg: none`) token → 401 | PASS |
| ID token instead of access token → 401 | PASS |
| Staff of another practice → 403 | PASS |
| Miller single-office (location) owner → 403 | PASS |
| Inactive Miller staff → 403 | PASS |
| Unknown website origin with a valid staff token → 403 | PASS |
| GET instead of POST → 405 | PASS |
| Active Miller staff → 503 "Greyfinch is not connected yet." (empty key) | PASS |
| Pre-flight from `http://localhost:5173` → 204 with CORS permission | PASS |
| Pre-flight from an unknown site → no CORS permission | PASS |
| Data layer unaffected: anonymous `/rest/v1/patients` → `[]` | PASS |
| Data layer unaffected: signed-in `/rest/v1/tc_users` → own row | PASS |

# Stage 3: copy of the real practice data (2026-10-01)

Exported from live Supabase with `aws/infra/data-copy/export-over-https.mjs` (Data API over HTTPS,
read twice and kept only if both reads matched; Dr. Miller ran it and typed the secret key).
Claude saw only counts and fingerprints, never rows. Fingerprint = md5 of the sorted per-row
md5(row(...)::text) with TimeZone=UTC; tc_users.auth_user_id exported empty. Loaded into Aurora
from the import drop box with aws_s3.table_import_from_s3 in one transaction as cadenceiq_owner,
committed only after every fingerprint matched. Files then deleted from the drop box and the Mac;
the database's import role was detached again.

| Table | Rows | Supabase (computed by Supabase) | Export | AWS after load |
|---|---|---|---|---|
| practices | 3 | 4248b5cb… | match | match |
| tc_users | 12 | ca673fbe… | match | match |
| patients | 697 | c553e2be… | match | match |
| settings | 13 | 91c6d2d5… | match | match |
| practice_goals | 26 | 1a7181a2… | match | match |
| practice_metrics | 31 | dd45b60b… | match | match |
| feedback | 1 | 85bae45f… | match | match |

Login links copied: 0. Sequences set to max(id). No Cognito users exist yet; nobody can read the
copy until staff are invited (Stage 4).
