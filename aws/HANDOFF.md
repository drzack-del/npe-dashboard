# Supabase → AWS migration: handoff (2026-10-01)

Read this first in a new session. Full transcript of the session that produced it:
`~/Downloads/session-export-1790852921248.zip`.

## Why and how we're working
- Moving CadenceIQ's backend off Supabase because Supabase's HIPAA BAA quote was too expensive
  (Dr. Miller decided 2026-09-30). AWS BAA is accepted on account 488482832567.
- Dr. Miller is not technical and wants the **lowest-risk path**: everything tested before it
  touches production, staged gates, plain-language explanations, a preview + his explicit "yes"
  before creating anything billable or publishing. See memory `lowest-risk-migrations`.
- Stages: 1 local tests (done) → **2 AWS with fake data (in progress)** → 3 copy of real data
  (needs his separate yes; real Greyfinch key entered by him) → 4 staff trial → 5 cutover with
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
| budget | — | "CadenceIQ monthly spend" $100/mo, alerts to drzack@northtampabraces.com |

Production structure (no data) loaded on Aurora: 7 tables, 26 policies, 5 functions, 1 trigger.
All fake test users/rows were removed after each check.

## Next steps
1. **Reconnect the AWS MCP connector** (8-hour sessions). Must show
   `assumed-role/AWSReservedSSO_AdministratorAccess…/drzack33612`, never `:root`; if root,
   have him sign out of root in the browser and reconnect via his access portal
   (https://d-90666144e0.awsapps.com/start).
2. **Phase 5 (greyfinch-sync)**, template `aws/infra/05-greyfinch.yaml` (4221 bytes, checksum
   717280725 with the repo's byte-sum method) and code `aws/functions/greyfinch-sync/index.mjs`
   (17/17 local checks). Preview with a change set; parameters: `JwksJson` (from
   https://cognito-idp.us-east-1.amazonaws.com/us-east-1_HncsSFH9J/.well-known/jwks.json),
   `ListenerArn` (look up the data-layer ALB's HTTPS listener). After his yes: create, then
   upload the real code (7 KB, over CloudFormation's 4 KB inline limit). Untested: whether the
   connector sandbox allows `zipfile` and passing bytes to `lambda:UpdateFunctionCode`; if not,
   find another upload path. Then test over HTTPS: non-staff 401/403, staff → 503 "not connected yet".
   `set-user-password` is NOT ported (already retired on Supabase, returns 410).
3. **Phase 6**: switch the app's login from Supabase Auth to Cognito on its own branch (supabase-js
   `accessToken` option for data calls; replace sign-in, MFA screens, sign-out, password reset;
   sign-up becomes invite-only). Add the test app's origin to `AllowedOrigins` on the data layer and
   greyfinch stacks. Then run the 19 Playwright app checks against AWS.
4. Before Stage 3/prod: remove `ALLOW_ADMIN_USER_PASSWORD_AUTH` from the Cognito client, consider
   ALB access logs + WAF, Business Support+, refresh `prod-schema/production-schema.sql` and
   `APPLIED_THROUGH` if any migration is run in production meanwhile.

## Open items outside the migration
- **Greyfinch exposure on live Supabase**: `greyfinch-sync` v11 returns Miller Ortho NPE PHI to
  any signed-in user of any practice (unverified `role` check). A separate session
  ("Lock greyfinch-sync to Miller Ortho staff only") was started 2026-10-01 to fix it; confirm outcome.
- Live app has no two-step verification; the pending security update (branch
  `wip/unsaved-work-2026-09-28`: tenant_security_hardening + office_onboarding) adds it. Both
  migrations apply cleanly to production's structure in the local harness.
- He was advised to delete the unused `send-email` Supabase function (open relay). Unconfirmed.

## Gotchas learned
- Connector sandbox: ~4-minute script limit (poll long waits with background `sleep` + re-check),
  no `hashlib` (byte-sum checksum to prove the template sent matches the repo file), Data API
  Commit/Rollback take only resourceArn/secretArn/transactionId.
- Data API runs one statement per call: load SQL in one transaction, split outside quotes,
  dollar-quotes and comments.
- The auto-mode classifier blocks Claude from granting IAM admin access and from editing its own
  permission settings; he does those himself.
- This Mac's python.org Python needs `cafile=/etc/ssl/cert.pem` for HTTPS; he reads Terminal output
  via the terminal tool (the "couldn't send output" message is harmless).
