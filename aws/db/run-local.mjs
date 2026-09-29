// Builds production's database structure on a throwaway local Postgres 17, applies the
// migrations not yet run in production, and runs the security tests. No real data.
//
//   cd aws/db && npm install && npm test
//
// Order: schema.mjs (Supabase stand-in -> production structure -> placeholder practice ->
// pending migrations -> patches/) -> tests/security-policies.sql (rolled back) ->
// tests/api-session.mjs (the per-request pattern the AWS API layer will use).
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applySchema, runFile, repo } from './schema.mjs';
import { runApiSessionTests } from './tests/api-session.mjs';

const dataDir = path.join(tmpdir(), 'cadenceiq-local-pg');
const port = 54329;
const database = 'cadenceiq';

const db = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'local-only', port, persistent: false,
  onLog: () => {}, onError: () => {},
});
const connect = async (user = 'postgres', password = 'local-only') => {
  const client = new pg.Client({ host: 'localhost', port, user, password, database });
  await client.connect();
  return client;
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
    await applySchema(admin);

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
    console.log('\nProduction structure + pending migrations applied; all security tests passed on plain Postgres 17.');
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
