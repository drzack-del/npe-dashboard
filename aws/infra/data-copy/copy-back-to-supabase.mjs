// SWITCHING BACK: copies the practice data as it is on AWS back into the live Supabase project,
// so nothing entered on AWS after switch-over is lost. Run by Dr. Miller in Terminal, with
// Supabase still write-locked for the app (supabase-write-lock.sql); this script uses the secret
// key, which the lock does not affect. Unlock Supabase only after it reports success.
//
//   node aws/infra/data-copy/copy-back-to-supabase.mjs            (asks before writing)
//
// Input: ~/CadenceIQ-copy-back/<table>.csv exported from AWS (aws_s3.query_export_to_s3, CSV with
// header, NULL = unquoted empty) plus manifest.json with each table's AWS row count and fingerprint.
//
// Safe by construction:
//   * Refuses to write anything unless every file's fingerprint equals the AWS manifest.
//   * Shows, per table, how many rows it will add/update and delete, and writes only after "YES".
//   * Refuses to delete more than MAX_DELETES rows in a table unless run with --allow-deletes.
//   * Never changes tc_users.auth_user_id on Supabase (those are Supabase logins; AWS has its own).
//   * After writing, re-reads Supabase and requires every table's fingerprint to equal AWS.
//   * Prints only counts and fingerprints, never patient details.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

// COPYBACK_TEST_* point it at the local stand-in for Supabase for the rehearsal with fake data.
const BASE = process.env.COPYBACK_TEST_URL || 'https://flhvblepqsuvsmscmmxm.supabase.co';
const IN_DIR = process.env.COPYBACK_TEST_IN || path.join(homedir(), 'CadenceIQ-copy-back');
const MAX_DELETES = 25;
const BATCH = 200;
const PAGE = 500;

// Same tables, column order and keys as the export (aws/infra/data-copy/export-over-https.mjs).
const TABLES = {
  practices: { key: ['id'], cols: 'id,name,location' },
  tc_users: { key: ['id'], cols: 'id,auth_user_id,name,email,role,practice_id,status,created_at,bonus_enabled,bonus_rates,location_scope,location_label' },
  patients: { key: ['id'], cols: 'id,name,npe_date,location,dp,tc,br,inv,ph1,ph2,ltd,r_plus,w_plus,pif,st,sch,pen,obs,mp,notx,obstacle,notes,contact_attempts,next_touch_date,last_contact_date,contact_log,created_at,phone,start_date,bond_date,practice_id,from_pending,dbrets,age,insurance_type,contract_amount,insurance_workflow,obs_appt_date,obs_anticipated_date,medicaid_pipeline,is_medicaid,financed_months,treatment_months,addon_skip_reason,third_party_financing,is_transfer_patient' },
  settings: { key: ['key', 'practice_id'], cols: 'key,value,practice_id' },
  practice_goals: { key: ['id'], cols: 'id,year,month,production_goal,npe_goal,start_goal,conversion_goal,avg_case_fee_goal,show_up_rate_goal,created_at,practice_id' },
  practice_metrics: { key: ['id'], cols: 'id,year,month,net_production,collections,npe_scheduled,npe_showed,obs_added,starts,show_up_rate,conversion_rate,avg_case_fee,notes,created_at,updated_at,practice_id' },
  feedback: { key: ['id'], cols: 'id,practice_id,tc_name,tc_email,view,category,description,created_at,needs_review' },
};
// Left alone on Supabase and left out of fingerprints (treated as NULL on both sides).
const KEEP_ON_SUPABASE = { tc_users: 'auth_user_id' };
const BOOLEANS = {
  patients: 'br,inv,ph1,ph2,ltd,r_plus,w_plus,pif,st,sch,pen,obs,mp,notx,from_pending,dbrets,medicaid_pipeline,is_medicaid,third_party_financing,is_transfer_patient',
  tc_users: 'bonus_enabled',
  feedback: 'needs_review',
};
const JSONB = { patients: 'contact_log,insurance_workflow', tc_users: 'bonus_rates', settings: 'value' };
const listOf = (map, t) => (map[t] || '').split(',').filter(Boolean);
const colsOf = t => TABLES[t].cols.split(',');

// ── Fingerprints: md5 of the sorted md5(row(...)::text), exactly as PostgreSQL computes them ──
const recordText = (table, row) => '(' + row.map((v, i) => {
  if (v === null) return '';
  if (listOf(BOOLEANS, table).includes(colsOf(table)[i])) return v === 'true' || v === 't' ? 't' : 'f';
  return v === '' || /["\\(), \t\n\r\v\f]/.test(v) ? `"${v.replace(/(["\\])/g, '$1$1')}"` : v;
}).join(',') + ')';
const md5 = s => createHash('md5').update(s, 'utf8').digest('hex');
const blankKept = (table, row) => row.map((v, i) => (listOf(KEEP_ON_SUPABASE, table).includes(colsOf(table)[i]) ? null : v));
const fingerprint = (table, rows) => (rows.length ? md5(rows.map(r => md5(recordText(table, blankKept(table, r)))).sort().join('')) : '');

// ── PostgreSQL CSV: "" is an empty string, an unquoted empty field is NULL ──
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') { inQuotes = true; quoted = true; }
    else if (ch === ',') { row.push(quoted || field !== '' ? field : null); field = ''; quoted = false; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(quoted || field !== '' ? field : null); rows.push(row); row = []; field = ''; quoted = false;
    } else field += ch;
  }
  if (field !== '' || quoted || row.length) { row.push(quoted || field !== '' ? field : null); rows.push(row); }
  return rows;
}

function askHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {};
    rl.question('', a => { rl.close(); process.stdout.write('\n'); resolve(a.trim()); });
  });
}
function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, a => { rl.close(); resolve(a.trim()); });
  });
}

let KEY = '';
const headers = (extra = {}) => {
  const h = { apikey: KEY, Accept: 'application/json', ...extra };
  if (KEY.split('.').length === 3) h.Authorization = `Bearer ${KEY}`;
  return h;
};
async function rest(method, url, body, extra) {
  const res = await fetch(url, { method, headers: headers(extra), body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('key'), { keyRejected: true });
  if (!res.ok) throw new Error(`Supabase answered ${res.status} to ${method} ${url.split('?')[0].split('/').pop()}: ${(await res.text()).slice(0, 200)}`);
  return method === 'GET' ? res.json() : null;
}

// Supabase's current rows, every column as PostgreSQL text (same as the export).
async function readSupabase(table) {
  const names = colsOf(table);
  const fetched = names.filter(n => !listOf(KEEP_ON_SUPABASE, table).includes(n));
  const select = fetched.map(n => `${n}:${n}::text`).join(',');
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await rest('GET', `${BASE}/rest/v1/${table}?select=${select}&order=${TABLES[table].key.join(',')}&offset=${from}&limit=${PAGE}`);
    rows.push(...page.map(r => names.map(n => (listOf(KEEP_ON_SUPABASE, table).includes(n) ? null : r[n]))));
    if (page.length < PAGE) break;
  }
  return rows;
}

// One CSV row as the JSON object PostgREST upserts. jsonb columns are sent as JSON values (not
// strings); everything else as PostgreSQL text, which the database converts to the column type.
const toPayload = (table, row) => {
  const out = {};
  colsOf(table).forEach((n, i) => {
    if (listOf(KEEP_ON_SUPABASE, table).includes(n)) return;
    const v = row[i];
    out[n] = v === null ? null : listOf(JSONB, table).includes(n) ? JSON.parse(v) : v;
  });
  return out;
};
const keyOf = (table, row) => TABLES[table].key.map(k => row[colsOf(table).indexOf(k)]).join('\u0001');
const inList = vals => `(${vals.map(v => `"${String(v).replace(/(["\\])/g, '\\$1')}"`).join(',')})`;

console.log('This copies the practice data from AWS back into Supabase (switching back).');
console.log('Nothing is written until you have seen the plan and typed YES.\n');
let failed = false;
try {
  const manifest = JSON.parse(await readFile(path.join(IN_DIR, 'manifest.json'), 'utf8'));
  // 1. The files must be exactly what AWS has.
  const aws = {};
  for (const table of Object.keys(TABLES)) {
    const text = await readFile(path.join(IN_DIR, `${table}.csv`), 'utf8');
    const [header, ...rows] = parseCsv(text);
    if (!header || header.join(',') !== TABLES[table].cols) throw new Error(`${table}.csv does not have the expected columns. Nothing was written.`);
    const m = manifest.tables?.[table];
    const fp = fingerprint(table, rows);
    if (!m || m.rows !== rows.length || m.fingerprint !== fp) throw new Error(`${table}.csv does not match what AWS reported (${rows.length} rows). Nothing was written.`);
    aws[table] = rows;
  }
  if (aws.patients.length === 0 || aws.practices.length === 0) throw new Error('The AWS files have no patients or practices. Nothing was written.');

  KEY = process.env.COPYBACK_TEST_KEY || await askHidden('Supabase secret key (hidden): ');
  const jwtRole = KEY.split('.').length === 3 ? (() => { try { return JSON.parse(Buffer.from(KEY.split('.')[1], 'base64url').toString()).role; } catch { return null; } })() : null;
  if (KEY.startsWith('sb_publishable_') || (jwtRole && jwtRole !== 'service_role') || (!jwtRole && !KEY.startsWith('sb_secret_'))) {
    throw new Error('That is not the secret key. Use the secret (service_role) key. Nothing was written.');
  }

  // 2. Plan: what changes on Supabase.
  const plan = {};
  for (const table of Object.keys(TABLES)) {
    const current = await readSupabase(table);
    const awsKeys = new Set(aws[table].map(r => keyOf(table, r)));
    const curByKey = new Map(current.map(r => [keyOf(table, r), md5(recordText(table, blankKept(table, r)))]));
    const changed = aws[table].filter(r => curByKey.get(keyOf(table, r)) !== md5(recordText(table, blankKept(table, r))));
    const added = changed.filter(r => !curByKey.has(keyOf(table, r))).length;
    const deletes = current.filter(r => !awsKeys.has(keyOf(table, r)));
    plan[table] = { upserts: changed, added, updated: changed.length - added, deletes };
  }
  console.log('\nPlan for Supabase:');
  for (const [t, p] of Object.entries(plan)) console.log(`  ${t.padEnd(17)} add ${String(p.added).padStart(4)}   update ${String(p.updated).padStart(4)}   delete ${String(p.deletes.length).padStart(4)}`);
  const bigDelete = Object.entries(plan).filter(([, p]) => p.deletes.length > MAX_DELETES).map(([t]) => t);
  if (bigDelete.length && !process.argv.includes('--allow-deletes')) {
    throw new Error(`More than ${MAX_DELETES} rows would be deleted in: ${bigDelete.join(', ')}. That is unusual; nothing was written. Ask Claude before re-running with --allow-deletes.`);
  }
  const total = Object.values(plan).reduce((n, p) => n + p.upserts.length + p.deletes.length, 0);
  if (total === 0) console.log('\nSupabase already matches AWS. Nothing to write.');
  else {
    const answer = process.env.COPYBACK_TEST_CONFIRM || await ask('\nType YES to write these changes to Supabase: ');
    if (answer !== 'YES') throw new Error('Not confirmed. Nothing was written.');
    // 3. Write: upserts in batches (auth_user_id untouched), then deletes.
    for (const [table, p] of Object.entries(plan)) {
      const onConflict = TABLES[table].key.join(',');
      for (let i = 0; i < p.upserts.length; i += BATCH) {
        await rest('POST', `${BASE}/rest/v1/${table}?on_conflict=${onConflict}`, p.upserts.slice(i, i + BATCH).map(r => toPayload(table, r)),
          { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' });
      }
      if (TABLES[table].key.length === 1) {
        const k = TABLES[table].key[0]; const idx = colsOf(table).indexOf(k);
        for (let i = 0; i < p.deletes.length; i += 50) {
          await rest('DELETE', `${BASE}/rest/v1/${table}?${k}=in.${encodeURIComponent(inList(p.deletes.slice(i, i + 50).map(r => r[idx])))}`, null, { Prefer: 'return=minimal' });
        }
      } else {
        for (const r of p.deletes) {
          const q = TABLES[table].key.map(k => `${k}=eq.${encodeURIComponent(r[colsOf(table).indexOf(k)])}`).join('&');
          await rest('DELETE', `${BASE}/rest/v1/${table}?${q}`, null, { Prefer: 'return=minimal' });
        }
      }
    }
  }
  // 4. Verify: Supabase now equals AWS, table by table.
  console.log('\nCheck:');
  let allMatch = true;
  for (const table of Object.keys(TABLES)) {
    const now = await readSupabase(table);
    const ok = now.length === aws[table].length && fingerprint(table, now) === manifest.tables[table].fingerprint;
    allMatch &&= ok;
    console.log(`  ${table.padEnd(17)} ${String(now.length).padStart(5)} rows   ${ok ? 'matches AWS' : 'DIFFERENT FROM AWS'}`);
  }
  if (!allMatch) throw new Error('Supabase does not fully match AWS. Keep Supabase locked and tell Claude.');
  console.log('\nDone: Supabase matches AWS. Tell Claude "copy-back done" before unlocking Supabase.');
} catch (err) {
  failed = true;
  console.error(`\nStopped: ${err.keyRejected ? 'Supabase did not accept that key. Nothing more was written.' : err.message}`);
}
process.exit(failed ? 1 : 0);
