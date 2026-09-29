// Replays the CadenceIQ Supabase migrations on a throwaway local Postgres 17 and runs the
// security tests against it. No AWS account, no real data.
//
//   cd aws/db && npm install && npm test
//
// Order: Supabase stand-in -> reconstructed baseline -> placeholder practice ->
// supabase/migrations (by date) -> patches/ -> tests/security-policies.sql (rolled back) ->
// tests/api-session.mjs (the per-request pattern the AWS API layer will use).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runApiSessionTests } from './tests/api-session.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const dataDir = path.join(tmpdir(), 'cadenceiq-local-pg');
const port = 54329;
const database = 'cadenceiq';

// add_obs_appt_date.sql has no timestamp prefix; it was written 2026-05-21.
const sortKey = f => (f === 'add_obs_appt_date.sql' ? '20260521' : f);
// patches/ is usually empty, and git drops empty directories.
const sqlFiles = async dir => (await readdir(dir).catch(e => (e.code === 'ENOENT' ? [] : Promise.reject(e)))).filter(f => f.endsWith('.sql'))
  .sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(f => path.join(dir, f));

const db = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'local-only', port, persistent: false,
  onLog: () => {}, onError: () => {},
});
const connect = async (user = 'postgres', password = 'local-only') => {
  const client = new pg.Client({ host: 'localhost', port, user, password, database });
  await client.connect();
  return client;
};

const runFile = async (client, file) => {
  const label = path.relative(repo, file);
  const sql = await readFile(file, 'utf8');
  try {
    await client.query(sql);
    console.log(`  ok   ${label}`);
  } catch (err) {
    const pos = Number(err.position);
    const line = pos ? sql.slice(0, pos).split('\n').length : '?';
    console.error(`  FAIL ${label} (line ${line}): ${err.message}`);
    throw err;
  }
};

let exitCode = 0;
await rm(dataDir, { recursive: true, force: true });
await db.initialise();
await db.start();
try {
  await db.createDatabase(database);
  const admin = await connect();
  try {
    console.log('Schema:');
    for (const f of ['00_supabase_compat.sql', '01_baseline_reconstructed.sql', '02_seed_placeholder_practice.sql']) {
      await runFile(admin, path.join(here, f));
    }
    for (const f of await sqlFiles(path.join(repo, 'supabase/migrations'))) await runFile(admin, f);
    for (const f of await sqlFiles(path.join(here, 'patches'))) await runFile(admin, f);

    console.log('Tests:');
    await admin.query('BEGIN');
    try {
      await runFile(admin, path.join(repo, 'tests/security-policies.sql'));
    } finally {
      await admin.query('ROLLBACK');
    }
    try {
      for (const name of await runApiSessionTests({ admin, connect })) console.log(`  ok   api: ${name}`);
    } catch (err) {
      console.error(`  FAIL api-session: ${err.message}`);
      throw err;
    }
    console.log('\nAll migrations applied and all security tests passed on plain Postgres 17.');
  } finally {
    await admin.end();
  }
} catch {
  exitCode = 1;
} finally {
  await db.stop();
  await rm(dataDir, { recursive: true, force: true });
}
process.exit(exitCode);
