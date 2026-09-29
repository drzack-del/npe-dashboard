// Loads the CadenceIQ schema into an empty plain-Postgres database: Supabase stand-in ->
// production's real structure -> placeholder practice -> migrations not yet run in
// production -> patches/.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, '../..');

// add_obs_appt_date.sql has no timestamp prefix; it was written 2026-05-21.
const sortKey = f => (f === 'add_obs_appt_date.sql' ? '20260521' : f);
// patches/ is usually empty, and git drops empty directories.
export const sqlFiles = async dir => (await readdir(dir).catch(e => (e.code === 'ENOENT' ? [] : Promise.reject(e))))
  .filter(f => f.endsWith('.sql'))
  .sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(f => path.join(dir, f));

export const runFile = async (client, file, log = console.log) => {
  const label = path.relative(repo, file);
  const sql = await readFile(file, 'utf8');
  try {
    await client.query(sql);
    log(`  ok   ${label}`);
  } catch (err) {
    const pos = Number(err.position);
    const line = pos ? sql.slice(0, pos).split('\n').length : '?';
    console.error(`  FAIL ${label} (line ${line}): ${err.message}`);
    throw err;
  }
};

// The last migration already run in production (see prod-schema/production-schema.sql).
export const appliedThrough = async () =>
  (await readFile(path.join(here, 'prod-schema/APPLIED_THROUGH'), 'utf8')).trim();

// Migrations not yet run in production, in the order they would be pasted.
export async function pendingMigrations() {
  const cutoff = sortKey(await appliedThrough());
  return (await sqlFiles(path.join(repo, 'supabase/migrations')))
    .filter(f => sortKey(path.basename(f)) > cutoff);
}

// Production's structure as it is today, then the pending migrations on top: the same steps
// that happen when the pending migrations are pasted into the Supabase SQL Editor.
export async function applySchema(client, log = console.log) {
  await runFile(client, path.join(here, '00_supabase_compat.sql'), log);
  await runFile(client, path.join(here, 'prod-schema/production-schema.sql'), log);
  await runFile(client, path.join(here, '02_seed_placeholder_practice.sql'), log);
  for (const f of await pendingMigrations()) await runFile(client, f, log);
  for (const f of await sqlFiles(path.join(here, 'patches'))) await runFile(client, f, log);
}
