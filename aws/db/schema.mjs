// Loads the full CadenceIQ schema into an empty plain-Postgres database, in the same order
// run-local.mjs uses: Supabase stand-in -> reconstructed baseline -> placeholder practice ->
// supabase/migrations (by date) -> patches/.
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

export async function applySchema(client, log = console.log) {
  for (const f of ['00_supabase_compat.sql', '01_baseline_reconstructed.sql', '02_seed_placeholder_practice.sql']) {
    await runFile(client, path.join(here, f), log);
  }
  for (const f of await sqlFiles(path.join(repo, 'supabase/migrations'))) await runFile(client, f, log);
  for (const f of await sqlFiles(path.join(here, 'patches'))) await runFile(client, f, log);
}
