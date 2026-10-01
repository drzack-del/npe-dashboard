// Stage 3, step 2: exports the practice data from the live Supabase database into CSV files on
// this Mac, for loading into the AWS test database. Run by Dr. Miller in Terminal:
//
//   node aws/infra/data-copy/export-from-supabase.mjs
//
// Safe by construction:
//   * Reads only, inside one READ ONLY transaction (a consistent snapshot); it cannot change
//     anything on Supabase. The live app keeps working normally.
//   * The database password is typed here, hidden, used for this one connection, never saved.
//   * Files go to ~/CadenceIQ-data-copy (outside every git folder, readable only by this Mac
//     user) and are deleted once the AWS copy is verified.
//   * Prints only row counts and fingerprints, never patient details. A fingerprint is a
//     one-way hash over every row; the AWS copy is correct only if its fingerprints match.
//   * Logins are not copied: tc_users.auth_user_id is left empty. Cognito logins re-link to
//     each team member on their first AWS sign-in (link_my_login).
import pg from 'pg';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

// Supabase session pooler for this project (IPv4; see aws/db/export-prod-schema.sh).
// EXPORT_TEST_* settings point it at a throwaway local database instead, for the rehearsal in
// test-roundtrip.mjs; they are never set for the real export.
const TEST = process.env.EXPORT_TEST_PORT ? {
  host: 'localhost', port: Number(process.env.EXPORT_TEST_PORT), user: 'postgres',
  password: process.env.EXPORT_TEST_PASSWORD, database: process.env.EXPORT_TEST_DB, ssl: false,
  outDir: process.env.EXPORT_TEST_OUT,
} : null;
const HOST = 'aws-1-us-east-1.pooler.supabase.com';
const USER = 'postgres.flhvblepqsuvsmscmmxm';

// Column order of each table on AWS (read from the AWS database on 2026-10-01). The export
// stops if Supabase's columns differ, so nothing is copied into the wrong place.
const TABLES = {
  practices: 'id:text,name:text,location:text',
  tc_users: 'id:uuid,auth_user_id:uuid,name:text,email:text,role:text,practice_id:text,status:text,created_at:timestamptz,bonus_enabled:bool,bonus_rates:jsonb,location_scope:text,location_label:text',
  patients: 'id:text,name:text,npe_date:text,location:text,dp:text,tc:text,br:bool,inv:bool,ph1:bool,ph2:bool,ltd:bool,r_plus:bool,w_plus:bool,pif:bool,st:bool,sch:bool,pen:bool,obs:bool,mp:bool,notx:bool,obstacle:text,notes:text,contact_attempts:int4,next_touch_date:text,last_contact_date:text,contact_log:jsonb,created_at:timestamptz,phone:text,start_date:text,bond_date:text,practice_id:text,from_pending:bool,dbrets:bool,age:int4,insurance_type:text,contract_amount:text,insurance_workflow:jsonb,obs_appt_date:text,obs_anticipated_date:text,medicaid_pipeline:bool,is_medicaid:bool,financed_months:int4,treatment_months:int4,addon_skip_reason:text,third_party_financing:bool,is_transfer_patient:bool',
  settings: 'key:text,value:jsonb,practice_id:text',
  practice_goals: 'id:int8,year:int4,month:int4,production_goal:numeric,npe_goal:int4,start_goal:int4,conversion_goal:numeric,avg_case_fee_goal:numeric,show_up_rate_goal:numeric,created_at:timestamptz,practice_id:text',
  practice_metrics: 'id:int8,year:int4,month:int4,net_production:numeric,collections:numeric,npe_scheduled:int4,npe_showed:int4,obs_added:int4,starts:int4,show_up_rate:numeric,conversion_rate:numeric,avg_case_fee:numeric,notes:text,created_at:timestamptz,updated_at:timestamptz,practice_id:text',
  feedback: 'id:uuid,practice_id:text,tc_name:text,tc_email:text,view:text,category:text,description:text,created_at:timestamptz,needs_review:bool',
};
const NOT_COPIED = { tc_users: ['auth_user_id'] };

// The value as written in the file; NOT_COPIED columns are exported empty.
const selectList = (table) => TABLES[table].split(',').map(c => {
  const [name, type] = c.split(':');
  return (NOT_COPIED[table] || []).includes(name) ? `NULL::${type}` : `"${name}"`;
});

// One-way fingerprint of a table: hash of the sorted per-row hashes. The same SQL runs on AWS.
const fingerprintSql = (table) =>
  `select count(*)::int as n, coalesce(md5(string_agg(h, '' order by h)), '') as fp
     from (select md5(row(${selectList(table).join(',')})::text) as h from public.${table}) s`;

// CSV in PostgreSQL's format: unquoted empty = NULL, "" = empty text.
const csvCell = v => (v === null ? '' : `"${String(v).replace(/"/g, '""')}"`);

// Prints the question once, then shows nothing of what is typed.
function askHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {};
    rl.question('', answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

console.log('This copies the CadenceIQ practice data from Supabase to files on this Mac, for the AWS test copy.');
console.log('It only reads; nothing on Supabase changes.');
console.log('Password: Supabase dashboard > Project Settings > Database > database password.\n');
const password = TEST ? TEST.password : await askHidden('Supabase database password (hidden): ');
if (!password) { console.log('No password entered; nothing done.'); process.exit(1); }

const outDir = TEST ? TEST.outDir : path.join(homedir(), 'CadenceIQ-data-copy');
const client = new pg.Client(TEST ? { ...TEST, outDir: undefined } : {
  // Encrypted connection (the same TLS setting the earlier structure export used).
  host: HOST, port: 5432, user: USER, password, database: 'postgres',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});

let failed = false;
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query(`SET LOCAL TimeZone = 'UTC'`);

  // Same columns, same order, same types as AWS, or stop.
  const { rows: cols } = await client.query(
    `select table_name, string_agg(column_name||':'||udt_name, ',' order by ordinal_position) as cols
       from information_schema.columns where table_schema = 'public' and table_name = any($1) group by table_name`,
    [Object.keys(TABLES)]);
  const found = Object.fromEntries(cols.map(r => [r.table_name, r.cols]));
  const mismatched = Object.keys(TABLES).filter(t => found[t] !== TABLES[t]);
  if (mismatched.length) throw new Error(`Supabase's columns differ from AWS for: ${mismatched.join(', ')}. Nothing was exported.`);

  await mkdir(outDir, { recursive: true });
  await chmod(outDir, 0o700);
  const manifest = { exportedAt: new Date().toISOString(), tables: {} };
  console.log('');
  for (const table of Object.keys(TABLES)) {
    const names = TABLES[table].split(',').map(c => c.split(':')[0]);
    const textCols = selectList(table).map((expr, i) => `(${expr})::text as "${names[i]}"`);
    const { rows } = await client.query(`select ${textCols.join(',')} from public.${table}`);
    const csv = [names.join(','), ...rows.map(r => names.map(n => csvCell(r[n])).join(','))].join('\n') + '\n';
    const file = path.join(outDir, `${table}.csv`);
    await writeFile(file, csv, { mode: 0o600 });
    const { rows: [fp] } = await client.query(fingerprintSql(table));
    if (fp.n !== rows.length) throw new Error(`${table}: row count changed during export.`);
    manifest.tables[table] = { rows: fp.n, fingerprint: fp.fp, columns: names, notCopied: NOT_COPIED[table] || [] };
    console.log(`  ${table.padEnd(17)} ${String(fp.n).padStart(5)} rows   fingerprint ${fp.fp}`);
  }
  await client.query('COMMIT');
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  console.log(`\nDone. Files are in ${outDir} (only you can open them).`);
  console.log('Tell Claude "export done". It does not need the files\' contents, only that they exist.');
} catch (err) {
  failed = true;
  const msg = /password authentication failed/i.test(err.message) ? 'The password was not accepted. Nothing was exported.'
    : /timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(err.message) ? 'Could not reach the Supabase database. This network may block database connections (only web traffic allowed); try another network, such as a phone hotspot. Nothing was exported.'
    : err.message;
  console.error(`\nStopped: ${msg}`);
} finally {
  await client.end().catch(() => {});
}
process.exit(failed ? 1 : 0);
