// Stage 3, step 2 (web-traffic version): exports the practice data from the live Supabase
// project into CSV files on this Mac, over HTTPS (port 443) through Supabase's Data API. For
// networks that block direct database connections, such as a company VPN that allows only web
// traffic. Run by Dr. Miller in Terminal:
//
//   node aws/infra/data-copy/export-over-https.mjs
//
// Safe by construction:
//   * Reads only (GET requests); nothing on Supabase changes and the live app keeps working.
//   * The Supabase service key is typed here, hidden, used for these requests, never saved.
//   * Files go to ~/CadenceIQ-data-copy (outside every git folder, readable only by this Mac
//     user) and are deleted once the AWS copy is verified.
//   * Prints only row counts and fingerprints, never patient details. A fingerprint is a
//     one-way hash over every row, computed exactly as PostgreSQL's md5(row(...)::text), so the
//     AWS database can compute the same value from what it loaded.
//   * The tables are read twice; the export is kept only if both reads are identical, so no
//     edit made by staff during the export can leave a half-updated copy.
//   * Logins are not copied: tc_users.auth_user_id is left empty. Cognito logins re-link to
//     each team member on their first AWS sign-in (link_my_login).
import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

// EXPORT_TEST_* point it at the local stand-in for Supabase (aws-local-testing) for the
// rehearsal with fake data; they are never set for the real export.
const BASE = process.env.EXPORT_TEST_URL || 'https://flhvblepqsuvsmscmmxm.supabase.co';
const OUT_DIR = process.env.EXPORT_TEST_OUT || path.join(homedir(), 'CadenceIQ-data-copy');
const PAGE = 500;

// Column order of each table on AWS (read from the AWS database on 2026-10-01), and the
// primary key used to page through it in a fixed order.
const TABLES = {
  practices: { key: 'id', cols: 'id,name,location' },
  tc_users: { key: 'id', cols: 'id,auth_user_id,name,email,role,practice_id,status,created_at,bonus_enabled,bonus_rates,location_scope,location_label' },
  patients: { key: 'id', cols: 'id,name,npe_date,location,dp,tc,br,inv,ph1,ph2,ltd,r_plus,w_plus,pif,st,sch,pen,obs,mp,notx,obstacle,notes,contact_attempts,next_touch_date,last_contact_date,contact_log,created_at,phone,start_date,bond_date,practice_id,from_pending,dbrets,age,insurance_type,contract_amount,insurance_workflow,obs_appt_date,obs_anticipated_date,medicaid_pipeline,is_medicaid,financed_months,treatment_months,addon_skip_reason,third_party_financing,is_transfer_patient' },
  settings: { key: 'key,practice_id', cols: 'key,value,practice_id' },
  practice_goals: { key: 'id', cols: 'id,year,month,production_goal,npe_goal,start_goal,conversion_goal,avg_case_fee_goal,show_up_rate_goal,created_at,practice_id' },
  practice_metrics: { key: 'id', cols: 'id,year,month,net_production,collections,npe_scheduled,npe_showed,obs_added,starts,show_up_rate,conversion_rate,avg_case_fee,notes,created_at,updated_at,practice_id' },
  feedback: { key: 'id', cols: 'id,practice_id,tc_name,tc_email,view,category,description,created_at,needs_review' },
};
const NOT_COPIED = { tc_users: ['auth_user_id'] };
// true/false columns: col::text gives 'true'/'false', but inside a row PostgreSQL writes t/f.
const BOOLEANS = {
  patients: 'br,inv,ph1,ph2,ltd,r_plus,w_plus,pif,st,sch,pen,obs,mp,notx,from_pending,dbrets,medicaid_pipeline,is_medicaid,third_party_financing,is_transfer_patient',
  tc_users: 'bonus_enabled',
  feedback: 'needs_review',
};

function askHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {};
    rl.question('', answer => { rl.close(); process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

// Every value as PostgreSQL's own text form (col::text), so nothing is reformatted on the way.
async function readTable(table, key) {
  const names = TABLES[table].cols.split(',');
  const fetched = names.filter(n => !(NOT_COPIED[table] || []).includes(n));
  const select = fetched.map(n => `${n}:${n}::text`).join(',');
  const headers = { apikey: key, Accept: 'application/json' };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys do not.
  if (key.split('.').length === 3) headers.Authorization = `Bearer ${key}`;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const url = `${BASE}/rest/v1/${table}?select=${select}&order=${TABLES[table].key}&offset=${from}&limit=${PAGE}`;
    const res = await fetch(url, { headers });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('key'), { keyRejected: true });
    if (!res.ok) throw new Error(`${table}: Supabase answered ${res.status}`);
    const page = await res.json();
    rows.push(...page.map(r => names.map(n => (NOT_COPIED[table] || []).includes(n) ? null : r[n])));
    if (page.length < PAGE) break;
  }
  return rows;
}

// PostgreSQL's record text form: (a,b,...) with NULL empty and quoting as record_out does.
const recordText = (table, row) => '(' + row.map((v, i) => {
  if (v === null) return '';
  if (boolIndexes(table).has(i)) return v === 'true' ? 't' : 'f';
  return v === '' || /["\\(), \t\n\r\v\f]/.test(v) ? `"${v.replace(/(["\\])/g, '$1$1')}"` : v;
}).join(',') + ')';
const md5 = s => createHash('md5').update(s, 'utf8').digest('hex');
const boolIndexes = table => new Set(TABLES[table].cols.split(',').map((n, i) => ((BOOLEANS[table] || '').split(',').includes(n) ? i : -1)).filter(i => i >= 0));
const fingerprint = (table, rows) => (rows.length ? md5(rows.map(r => md5(recordText(table, r))).sort().join('')) : '');

// CSV in PostgreSQL's format: unquoted empty = NULL, "" = empty text.
const csvCell = v => (v === null ? '' : `"${v.replace(/"/g, '""')}"`);

async function readAll(key) {
  const out = {};
  for (const table of Object.keys(TABLES)) out[table] = await readTable(table, key);
  return out;
}

console.log('This copies the CadenceIQ practice data from Supabase to files on this Mac, for the AWS test copy.');
console.log('It only reads; nothing on Supabase changes.');
console.log('Key: Supabase dashboard > Project Settings > API Keys > the secret (service_role) key.\n');
const key = process.env.EXPORT_TEST_KEY || await askHidden('Supabase secret key (hidden): ');
if (!key) { console.log('No key entered; nothing done.'); process.exit(1); }
// The public (anon / publishable) key would not fail: row-level security would just return
// empty tables. Only the secret key reads everything.
const jwtRole = key.split('.').length === 3
  ? (() => { try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { return null; } })()
  : null;
if (key.startsWith('sb_publishable_') || (jwtRole && jwtRole !== 'service_role') || (!jwtRole && !key.startsWith('sb_secret_'))) {
  console.log('That is not the secret key. Use the secret (service_role) key, not the public (anon) one. Nothing done.');
  process.exit(1);
}

let failed = false;
try {
  let data = null;
  for (let attempt = 1; attempt <= 3 && !data; attempt++) {
    const first = await readAll(key);
    const second = await readAll(key);
    const same = Object.keys(TABLES).every(t => fingerprint(t, first[t]) === fingerprint(t, second[t]));
    if (same) data = second;
    else console.log(`  Someone changed data while it was being read; reading again (${attempt}/3)...`);
  }
  if (!data) throw new Error('The data kept changing while being read. Try again in a quieter moment. Nothing was saved.');
  if (data.patients.length === 0 || data.practices.length === 0) throw new Error('Supabase returned no patients or practices, so the key cannot see the data. Nothing was saved.');

  // Times must be in UTC (+00) so the AWS fingerprints, also computed in UTC, can match.
  const stamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?)$/;
  for (const [t, rows] of Object.entries(data)) for (const r of rows) for (const v of r) {
    const m = v && stamp.exec(v);
    if (m && m[2] !== '+00') throw new Error(`${t}: a time was not in UTC (${m[2]}). Nothing was saved; tell Claude.`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await chmod(OUT_DIR, 0o700);
  const manifest = { exportedAt: new Date().toISOString(), via: 'https', tables: {} };
  console.log('');
  for (const [table, rows] of Object.entries(data)) {
    const names = TABLES[table].cols.split(',');
    const csv = [names.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n') + '\n';
    await writeFile(path.join(OUT_DIR, `${table}.csv`), csv, { mode: 0o600 });
    const fp = fingerprint(table, rows);
    manifest.tables[table] = { rows: rows.length, fingerprint: fp, columns: names, notCopied: NOT_COPIED[table] || [] };
    console.log(`  ${table.padEnd(17)} ${String(rows.length).padStart(5)} rows   fingerprint ${fp}`);
  }
  await writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  console.log(`\nDone. Files are in ${OUT_DIR} (only you can open them).`);
  console.log('Tell Claude "export done". It does not need the files\' contents, only that they exist.');
} catch (err) {
  failed = true;
  console.error(`\nStopped: ${err.keyRejected ? 'Supabase did not accept that key. Use the secret (service_role) key, not the public (anon) one. Nothing was exported.' : err.message}`);
}
process.exit(failed ? 1 : 0);
