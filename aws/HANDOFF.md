# Supabase → AWS migration: handoff (2026-10-01)

Read this first in a new session. Full transcript of the session that produced it:
`~/Downloads/session-export-1790852921248.zip`.

## Why and how we're working
- Moving CadenceIQ's backend off Supabase because Supabase's HIPAA BAA quote was too expensive
  (Dr. Miller decided 2026-09-30). AWS BAA is accepted on account 488482832567.
- Dr. Miller is not technical and wants the **lowest-risk path**: everything tested before it
  touches production, staged gates, plain-language explanations, a preview + his explicit "yes"
  before creating anything billable or publishing. See memory `lowest-risk-migrations`.
- Stages: 1 local tests (done) → 2 AWS with fake data (done) → **3 copy of real data (done 2026-10-01)**
  (real Greyfinch key still empty; he enters it) → 4 staff trial → 5 cutover with
  rehearsed switch-back → 6 keep Supabase ~30 days.
- Repo rules in `AGENTS.md`: `main` == live site; publish only by fast-forwarding `main` and
  `git push origin main` (Vercel builds); one task per branch; don't edit `src/App.jsx` from two
  sessions at once. He added allow rules for `git merge --ff-only *` and `git push origin main`.

## Where things are
- Branch `aws-infra` (worktree `.claude/worktrees/aws-infra`): CloudFormation templates in
  `aws/infra/` (README lists each), function code in `aws/functions/`, check results in
  `aws/infra/checks/README.md`, owner-role bootstrap in `aws/infra/sql/00_aws_bootstrap.sql`.
- Branch `aws-local-testing` (worktree `.claude/worktrees/aws-local-testing`): local harness in
  `aws/db/` (`npm test` = DB checks on production's real structure + Playwright app checks;
  browser is network-locked because live `main` falls back to the production Supabase URL).
- Branch `aws-cognito-login` (worktree `.claude/worktrees/aws-cognito-login`, from live `main`):
  Phase 6 app code. `VITE_AUTH_PROVIDER=cognito` switches sign-in to Cognito (`src/cognitoAuth.js`,
  `src/CognitoLogin.jsx`, lazy-loaded; the live build without it contains none of it). Run against
  AWS test with `npx vite --mode awstest` (`.env.awstest`, public IDs only; launch.json entry
  `app-on-aws-test`, port 5175). NOT merged to main yet: needs his yes.
- Already live on `main`: App.jsx reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` if set
  (byte-identical build without them; Vercel has none).

## Built on AWS (us-east-1, all stacks prefixed `cadenceiq-test-`), every check passed
| Phase | Stack | Key IDs |
|---|---|---|
| 1 network + audit | `foundation` | vpc-0bcbb761e57b20df6; CloudTrail `cadenceiq-test-audit`; bucket `cadenceiq-test-audit-logs-488482832567` |
| 2 database | `database` | Aurora PG 17.6 serverless `cadenceiq-test` (Data API on); master secret `rds!cluster-8e770015-…`; objects owned by role `cadenceiq_owner` (BYPASSRLS) |
| 3 login | `login` | Cognito pool `us-east-1_HncsSFH9J`, client `3rhchvg8f8qnqgvfahg6l7tpaa`; MFA required, invite-only; pre-token Lambda adds role/aal/email |
| 4a cert | `certificate` | ACM cert for `api-test.trycadenceiq.com` (DNS at **Porkbun**, he adds records by hand) |
| 4b data layer | `data-layer` | ALB `cadenceiq-test-api-723723109.us-east-1.elb.amazonaws.com` → nginx `/rest/v1/` → PostgREST 14.1; secret `cadenceiq-test/db-authenticator`; `DesiredCount` param (0 pauses it) |
| 5 greyfinch-sync | `greyfinch` | Lambda `cadenceiq-test-greyfinch-sync` at `/functions/v1/greyfinch-sync` (ALB rule priority 10); secret `cadenceiq-test/greyfinch` (empty) |
| 5a code bucket | `function-code` | `cadenceiq-test-function-code-488482832567` (versioned, private) |
| 6 invite | `invite` | Lambda `cadenceiq-test-invite-user` at `/functions/v1/invite-user` (rule priority 20), code from the bucket (pinned S3 version) |
| 6 login update | `login` | users cannot write `email` (WriteAttributes [name], verify-before-update), token email only when verified, invite email template (`AppUrl` param, test default localhost:5173), AuthSessionValidity 15 min |
| 6 DB | — | `public.link_my_login()` (aws/infra/sql/06_link_my_login.sql) creates auth.users row + links tc_users on first sign-in; after DDL run `NOTIFY pgrst, 'reload schema'` |
| budget | — | "CadenceIQ monthly spend" $100/mo, alerts to drzack@northtampabraces.com |

Production structure (no data) loaded on Aurora: 7 tables, 26 policies, 5 functions, 1 trigger.
All fake test users/rows were removed after each check.

## Next steps
1. **Reconnect the AWS MCP connector** (8-hour sessions). Must show
   `assumed-role/AWSReservedSSO_AdministratorAccess…/drzack33612`, never `:root`; if root,
   have him sign out of root in the browser and reconnect via his access portal
   (https://d-90666144e0.awsapps.com/start).
2. ~~Phase 5 (greyfinch-sync)~~ **done 2026-10-01**: stacks `greyfinch` and `function-code` (see
   table), 15/15 HTTPS checks in `aws/infra/checks/README.md`. Code upload path: zip locally →
   presigned PUT to the code bucket → `UpdateFunctionCode` from the S3 version (sandbox blocks
   `zipfile`/`base64`). `set-user-password` is NOT ported (already retired on Supabase, returns 410).
3. **Phase 6 (in progress, 2026-10-01)**: app code on `aws-cognito-login`; AWS side applied (table
   above). Verified: session resume + link_my_login, team invite (real email to
   zack.miller96+cadenceiq-tc1@gmail.com), self email change refused, Greyfinch 503 through the app,
   sign-out; Dr. Miller completed a real first sign-in (one-time password → new password → QR → code).
   First attempt failed: Cognito's 3-minute AuthSessionValidity cut off authenticator setup → raised to 15.
   Claude may not type passwords into the Cognito sign-in page (external identity provider), so
   browser sign-in steps are done by him; Claude injects sandbox-minted tokens into Amplify's
   localStorage keys to test post-sign-in screens. invite-user 22/22 and link_my_login 7/7 local checks.
   Remaining: Playwright run with flag OFF (live behaviour unchanged), delete test accounts/rows,
   his yes to merge the off-by-default code to main, then automated Cognito-mode checks.
4. Before Stage 3/prod: remove `ALLOW_ADMIN_USER_PASSWORD_AUTH` from the Cognito client, consider
   ALB access logs + WAF, Business Support+, refresh `prod-schema/production-schema.sql` and
   `APPLIED_THROUGH` if any migration is run in production meanwhile.

## Stage 3 done (2026-10-01): real data copied to AWS test
- Snapshot of 2026-10-01 17:10 UTC (697 patients, 12 team members, 3 practices, ...); every table's
  fingerprint matched Supabase. See `aws/infra/checks/README.md`. Supabase stays the live system;
  the copy goes stale and must be re-copied right before cutover (same script, TRUNCATE first).
- Stack `cadenceiq-test-data-import` (drop box bucket, 1-day expiry, S3 gateway endpoint limited to
  it, role `cadenceiq-test-db-import`) is kept for the final copy; set `ImportRoleArn` on the
  database stack only for the duration of a copy (detached now). Aurora needs ~1 minute after
  attaching before aws_s3 imports work.
- His Mac runs GlobalProtect (company VPN): only web ports leave it, so direct Postgres (5432/6543)
  fails. Use `export-over-https.mjs` (secret key, Data API) instead of `export-from-supabase.mjs`.
- Cognito web client no longer allows ADMIN_USER_PASSWORD_AUTH; automated Cognito checks need their
  own test client (not built yet). Claude may not type passwords into Cognito sign-in pages.
- Stage 4 started 2026-10-01 with Dr. Miller alone on his Mac (`app-on-aws-test`, localhost:5175, orange
  "AWS TEST COPY" banner from VITE_ENV_LABEL). His Cognito login (drzack@northtampabraces.com, created
  with AdminCreateUser) is CONFIRMED and linked to his tc_users row; it is the only login. Networks with
  SSL inspection (e.g. airport Wi-Fi with a Fortinet FortiGate) intercept trycadenceiq.com and break the
  data calls (ERR_CERT_AUTHORITY_INVALID) while Cognito still works; never bypass, use a hotspot. Earlier
  "GlobalProtect" diagnosis was wrong: it is installed but not connected.
  His verdict after clicking through dashboard (September KPIs), patients and settings: "it looks good".
  Notes: the KPI table defaults to the current month (empty on the 1st); the one copied feedback row is
  an old auto bug report (2026-09-24 16:24 UTC, fixed by the transfer_patient_flag migration 6 min later)
  and shows as new in the test copy because localhost never marked it seen.
- Hosted test address (2026-10-01): https://app-test.trycadenceiq.com/app = Vercel preview of branch
  `aws-cognito-login` (Vercel domain assigned to that git branch; 6 VITE_* preview env vars scoped to
  that branch only; production has none). Porkbun CNAME app-test -> cname.vercel-dns.com (he added it;
  the domain has a Porkbun wildcard, so every new subdomain needs its own record). Custom domains skip
  Vercel's preview login wall. Stack parameters now: AllowedOrigins (data-layer, greyfinch, invite) =
  localhost:5173-5175 + https://app-test.trycadenceiq.com; login AppUrl = https://app-test.trycadenceiq.com/app
  (repo template defaults still say localhost; pass these values on future updates).
- Next: Stage 4 staff trial needs (a) hosted test URL + AllowedOrigins/AppUrl, (b) admin reset of a
  lost authenticator, (c) SES email (he will do later), (d) his yes before any invites.

## Open items outside the migration
- **Greyfinch exposure on live Supabase**: `greyfinch-sync` v11 returns Miller Ortho NPE PHI to
  any signed-in user of any practice (unverified `role` check). A separate session
  ("Lock greyfinch-sync to Miller Ortho staff only") was started 2026-10-01 to fix it; confirm outcome.
- Live app has no two-step verification; the pending security update (branch
  `wip/unsaved-work-2026-09-28`: tenant_security_hardening + office_onboarding) adds it. Both
  migrations apply cleanly to production's structure in the local harness.
- He was advised to delete the unused `send-email` Supabase function (open relay). Unconfirmed.

## Gotchas learned
- New DB functions are invisible to PostgREST (404) until `NOTIFY pgrst, 'reload schema'`.
- `aws_mcp` sandbox has no `elasticloadbalancingv2` name: use `elbv2`; `zipfile`/`base64` blocked.
- Demo button + homepage "live demo" links were removed from live 2026-10-01 (they could open his
  real dashboard); `SHOW_DEMO_BUTTON` in App.jsx; keep off until a fake-patient demo exists.
- Connector sandbox: ~4-minute script limit (poll long waits with background `sleep` + re-check),
  no `hashlib` (byte-sum checksum to prove the template sent matches the repo file), Data API
  Commit/Rollback take only resourceArn/secretArn/transactionId.
- Data API runs one statement per call: load SQL in one transaction, split outside quotes,
  dollar-quotes and comments.
- The auto-mode classifier blocks Claude from granting IAM admin access and from editing its own
  permission settings; he does those himself.
- This Mac's python.org Python needs `cafile=/etc/ssl/cert.pem` for HTTPS; he reads Terminal output
  via the terminal tool (the "couldn't send output" message is harmless).
