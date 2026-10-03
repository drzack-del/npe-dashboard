# CadenceIQ switch-over to AWS: plan (draft for Dr. Miller's review, 2026-10-03)

Status: **decisions 1-6 approved by Dr. Miller 2026-10-03 (all as recommended); nothing scheduled.** Every step that changes something still gets a preview and his
yes at the time. Supabase stays untouched and available as the way back for at least 30 days.

## Where we are
- AWS test setup has everything the app needs: database (exact copy of real data as of 2026-10-01
  17:10 UTC), sign-in with authenticator codes, invites, Greyfinch function (key empty), hosted test
  address https://app-test.trycadenceiq.com/app. Dr. Miller and a fake TC both completed real sign-ins.
- The app's AWS sign-in code is on branch `aws-cognito-login`, switched off by default; with it off,
  19/19 app checks pass (live behaviour unchanged).

## Decisions (approved 2026-10-03, all as recommended)
1. **Use the current AWS setup as the production one** (it is already hardened; stack names keep the
   word "test", which is cosmetic). Staff can then set up their logins on the test address *before*
   switch-over day and keep them afterwards. Alternative: build a second, separate production setup
   (about double the AWS cost, staff enroll on the day itself).
2. **Switch by a change on `main`**: a committed `.env.production` with the AWS settings. Publishing it
   (fast-forward `main`, push) flips the live site in ~1 minute; reverting that one commit flips it
   back. Fits the repo rules (main == live, every change visible in git history).
3. **Keep the database always awake** during the trial and after switch-over (minimum 0.5 capacity
   instead of pausing after 30 idle minutes). A paused database takes ~15-30 s to wake, long enough for
   the first sign-in of the morning to fail. Cost: roughly +$45/month; raise the budget alert to $150.
4. **Lock Supabase against writes at switch-over** (read-only for the app's roles), so an old browser
   tab still running the previous app cannot save anything to Supabase after the final copy. The lock
   is lifted as part of switching back. This is a Supabase database change: tested locally with an
   undo script, run only with his yes.
5. **When:** an evening or weekend, ~45 minutes during which staff do not use CadenceIQ.
6. **Email:** AWS's basic sender (up to 50 emails/day, may land in spam) is enough for ~12 staff to start;
   Amazon's full email service can come after switch-over.

## Before switch-over day (each previewed for his yes)
| # | Task | Who |
|---|---|---|
| P1 | Office network check: open the test address once from the office Wi-Fi | Dr. Miller |
| P2 | Publish the switched-off AWS sign-in code to `main` (no visible change; re-run the 19 checks first) | Claude, his yes |
| P3 | ✅ built, not deployed: "Reset two-step" button on the Team tab (branch `aws-cognito-login`) + `reset-mfa` action in invite-user (30/30 local checks). Deploy with P4 (new Cognito permissions + code upload), then a real test on a fake account | Claude |
| P4 | Production settings: allow `https://trycadenceiq.com`, invite emails point to `https://trycadenceiq.com/app`, database always awake, 35-day backups, 2 copies of the data server, basic alerts (server errors, database health) emailed to him | Claude, his yes |
| P5 | Greyfinch key entered into AWS (Secrets Manager) | Dr. Miller (Claude guides) |
| P6 | ✅ Way back for data: `aws/infra/data-copy/copy-back-to-supabase.mjs`, 18/18 on fake data (plan + YES before writing, refuses tampered files and large deletions, keeps Supabase login links). Still needs the AWS export permission (in P4) and a real run in the P8 rehearsal | Claude |
| P7 | ✅ Supabase write-lock and unlock scripts (`aws/infra/sql/supabase-write-lock.sql`, `-unlock.sql`): 15/15 local checks on production's structure; unlock restores today's exact permissions | Claude |
| P8 | Full dress rehearsal on the test address: fresh copy, fingerprints, switch the test site, switch back, time every step | Claude + Dr. Miller |
| P9 | Staff enroll: invite each team member to the test address a few days ahead; each sets a password and authenticator (orange banner says it is a test copy) | Dr. Miller sends invites |

## Switch-over day (target ~45 minutes)
1. Staff stop using CadenceIQ and close it.
2. Lock Supabase writes (decision 4).
3. Final copy: export over HTTPS (same script as Stage 3), empty the AWS tables, load, and require every
   table's fingerprint to match Supabase. If anything differs: stop, unlock Supabase, nothing else changed.
4. Publish the switch (decision 2); Vercel builds in ~1 minute.
5. Check on https://trycadenceiq.com/app as Dr. Miller: sign-in works, patient count and dashboard match,
   one harmless edit saves and shows in the database.
6. Staff reload and sign in with the password and authenticator they set up in P9 (first sign-in on
   AWS re-links each person automatically).
   Anyone who saved something in an old tab after step 2 sees "Cloud save failed ... Saved locally
   only" (the lock refuses it; it is not queued); they reload and re-enter that change on AWS.

## Switching back (rehearsed in P8)
1. Revert the switch commit and publish (~1 minute); the live site talks to Supabase again.
2. Copy anything entered on AWS since switch-over back to Supabase (P6), then unlock Supabase writes.
3. Staff reload; they sign in with their Supabase passwords as before.

## After switch-over
- Watch errors and the budget daily for the first week.
- Supabase kept read-only for 30 days, then deleted with his yes (Stage 6).
- Later fixes list in `aws/HANDOFF.md` (team-member onboarding flow).
