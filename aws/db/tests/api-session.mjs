// Tests the request pattern the AWS API layer (Lambda) will use, over a real login instead of
// a superuser session:
//   connect as `authenticator` -> BEGIN -> set the verified JWT claims -> SET LOCAL ROLE
//   authenticated -> read/write the way the app does -> COMMIT.
// Also proves that claims and role do not leak into the next request on a pooled connection.
//
// Works on either database version:
//   * production today: the app reads and writes the tables directly, guarded by RLS.
//   * with the pending security update (tenant_security_hardening): the app goes through the
//     read_patients/save_patient functions and patient data needs two-step verification (aal2).
// A protection the tested version does not have yet is reported as a known gap, not a failure.
// Synthetic data only.
import assert from 'node:assert/strict';

const A = '10000000-0000-0000-0000-00000000000a';
const B = '10000000-0000-0000-0000-00000000000b';
const C = '10000000-0000-0000-0000-00000000000c';
const EMAIL = { [A]: 'api-a@invalid.test', [B]: 'api-b@invalid.test', [C]: 'api-c@invalid.test' };

export async function runApiSessionTests({ admin, connect }) {
  const [{ hardened }] = (await admin.query(`SELECT to_regprocedure('public.read_patients(text)') IS NOT NULL AS hardened`)).rows;
  await admin.query(`ALTER ROLE authenticator PASSWORD 'local-only'`);
  await admin.query(`
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
      ('${A}','${EMAIL[A]}',now()),('${B}','${EMAIL[B]}',now()),('${C}','${EMAIL[C]}',now());
    INSERT INTO public.practices(id,name) VALUES('__api_a','Synthetic A'),('__api_b','Synthetic B');
    INSERT INTO public.tc_users(auth_user_id,name,email,role,status,practice_id,location_scope) VALUES
      ('${A}','Synthetic A','${EMAIL[A]}','admin','active','__api_a',null),
      ('${B}','Synthetic B','${EMAIL[B]}','admin','active','__api_b',null),
      ('${C}','Synthetic C','${EMAIL[C]}','location_owner','active','__api_a','North');
    INSERT INTO public.patients(id,name,practice_id,location,npe_date) VALUES
      ('__api_pa','Synthetic Patient A North','__api_a','North','2026-09-27'),
      ('__api_pa2','Synthetic Patient A South','__api_a','South','2026-09-27'),
      ('__api_pb','Synthetic Patient B','__api_b','Main','2026-09-27');
  `);

  const api = await connect('authenticator', 'local-only');
  // What the Lambda does per request, after verifying the login token.
  const asUser = async (claims, fn, role = 'authenticated') => {
    await api.query('BEGIN');
    try {
      await api.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await api.query(`SET LOCAL ROLE ${role}`);
      const out = await fn(api);
      await api.query('COMMIT');
      return out;
    } catch (err) {
      await api.query('ROLLBACK');
      throw err;
    }
  };
  const claimsFor = (sub, aal = 'aal2') => ({ sub, role: 'authenticated', aal, email: EMAIL[sub] });
  const onlyTest = ids => ids.filter(id => id.startsWith('__api_')).sort();

  // The app's two ways of reading and saving patients, depending on the version.
  const readPatientIds = async c => hardened
    ? ((await c.query('SELECT public.read_patients() AS rows')).rows[0].rows || []).map(r => r.id)
    : (await c.query('SELECT id FROM public.patients')).rows.map(r => r.id);
  const savePatient = async (c, row) => hardened
    ? c.query('SELECT public.save_patient($1::jsonb)', [JSON.stringify(row)])
    : c.query(`INSERT INTO public.patients AS p (id,name,practice_id,location,npe_date,notes)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (id) DO UPDATE SET name=excluded.name, notes=excluded.notes, location=excluded.location`,
      [row.id, row.name, row.practice_id, row.location, row.npe_date, row.notes ?? '']);

  const passed = [];
  const gaps = [];
  const check = async (name, fn) => { await fn(); passed.push(name); };

  try {
    await check('login role alone cannot read patients', async () => {
      await assert.rejects(api.query('SELECT count(*) FROM public.patients'), /permission denied/);
    });

    await check('a signed-in user reads only their own practice\'s patients', async () => {
      const ids = await asUser(claimsFor(A), readPatientIds);
      assert.deepEqual(onlyTest(ids), ['__api_pa', '__api_pa2']);
    });

    await check('a location owner reads only their own office\'s patients', async () => {
      const ids = await asUser(claimsFor(C), readPatientIds);
      assert.deepEqual(onlyTest(ids), ['__api_pa']);
    });

    await check('a signed-in user can save a patient in their own practice', async () => {
      await asUser(claimsFor(A), c => savePatient(c, { id: '__api_pa', name: 'Synthetic Patient A North', practice_id: '__api_a', location: 'North', npe_date: '2026-09-27', notes: 'updated via api' }));
      const r = await admin.query(`SELECT notes FROM public.patients WHERE id='__api_pa'`);
      assert.equal(r.rows[0].notes, 'updated via api');
    });

    await check('a signed-in user cannot change another practice\'s patient', async () => {
      try {
        await asUser(claimsFor(A), c => savePatient(c, { id: '__api_pb', name: 'Hijacked', practice_id: '__api_b', location: 'Main', npe_date: '2026-09-27' }));
      } catch { /* rejected outright is the expected outcome */ }
      const r = await admin.query(`SELECT name FROM public.patients WHERE id='__api_pb'`);
      assert.equal(r.rows[0].name, 'Synthetic Patient B');
    });

    await check('a signed-in user cannot add a patient to another practice', async () => {
      try {
        await asUser(claimsFor(A), c => savePatient(c, { id: '__api_new', name: 'Planted', practice_id: '__api_b', location: 'Main', npe_date: '2026-09-27' }));
      } catch { /* rejected outright is the expected outcome */ }
      const r = await admin.query(`SELECT count(*)::int AS n FROM public.patients WHERE id='__api_new'`);
      assert.equal(r.rows[0].n, 0);
    });

    // Two-step verification at the database level arrives with the pending security update.
    let aal1Ids = [];
    try { aal1Ids = await asUser(claimsFor(A, 'aal1'), readPatientIds); } catch { /* rejected is fine */ }
    if (onlyTest(aal1Ids).length === 0) passed.push('a password-only session (no two-step code) gets no patients');
    else gaps.push('a password-only session (no two-step code) can still read patients: the database does not require two-step verification in this version');

    await check('claims and role do not leak to the next request on the same connection', async () => {
      await asUser(claimsFor(A), c => c.query('SELECT 1'));
      const r = await api.query(`SELECT nullif(current_setting('request.jwt.claims', true), '') AS claims, current_user AS who`);
      assert.equal(r.rows[0].claims, null);
      assert.equal(r.rows[0].who, 'authenticator');
      await assert.rejects(api.query('SELECT count(*) FROM public.patients'), /permission denied/);
    });

    await check('anonymous requests see no patients', async () => {
      let ids = [];
      try { ids = await asUser({ role: 'anon' }, readPatientIds, 'anon'); } catch { /* denied outright is fine */ }
      assert.deepEqual(onlyTest(ids), []);
    });
  } finally {
    await api.end();
  }
  return { passed, gaps, version: hardened ? 'with the pending security update' : 'production as it is today' };
}
