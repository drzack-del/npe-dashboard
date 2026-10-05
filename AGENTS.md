# Working rules for AI agents (Claude and Codex)

This app is live for real practices. More than one AI works on it, so these rules
keep one agent's work from undoing another's. Follow them exactly.

## `main` is the live site

- `main` is always exactly what is running on trycadenceiq.com.
- Publish **only** from `main`. Never deploy from a feature branch, a temporary
  copy (`/tmp/...`), a worktree, or a folder with uncommitted changes.
- Publishing = fast-forward `main` to the finished branch, `git push origin main`,
  and let Vercel build it. Do not run `vercel deploy --prod`, `vercel promote`, or
  reassign domains by hand.
- Never force-push `main`.

## One task, one agent, one branch

- Start every task on a fresh branch from the current `main`.
- Do not work on a task another agent (Claude or Codex) is already working on.
- Do not edit `src/App.jsx` from two sessions at the same time.
- Keep each branch to one change. Unrelated work (a dependency upgrade, a second
  feature) goes on its own branch.

## Save before you stop

- Commit your work before the session ends or before switching tasks. Uncommitted
  changes in the main folder are the easiest thing to lose.
- If you find uncommitted changes you did not make, do not commit, discard, or
  deploy them. Tell Dr. Miller and ask what they are.

## Before publishing

- `npm run build` passes.
- The change was checked in the browser (the "Try Demo" login uses fake patients
  and never touches the database).
- Only the intended change is going live: check `git log origin/main..main`.
- Dr. Miller has said yes to publishing this change.

## Database

- Since 2026-10-05 the live database is on **AWS** (Aurora, reached through the
  data layer at api-test.trycadenceiq.com; logins in Cognito). Supabase is kept
  read-only as the way back for about 30 days. Do not write to Supabase.
- Database changes run on AWS through the RDS Data API as `cadenceiq_owner`
  (`SET ROLE cadenceiq_owner` ... `RESET ROLE`, one transaction), then
  `NOTIFY pgrst, 'reload schema'`. Test locally first and have an undo script.
  Dr. Miller says yes to each change before it runs. Do not ship code that
  depends on a change that has not run yet.
- How it is set up: `aws/HANDOFF.md` and `aws/CUTOVER.md` on branch `aws-infra`.
