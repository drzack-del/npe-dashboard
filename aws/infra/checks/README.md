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
