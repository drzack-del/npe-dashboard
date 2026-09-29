// Tests the request pattern the AWS API layer (Lambda) will use, over a real login instead of
// a superuser session:
//   connect as `authenticator` -> BEGIN -> set the verified JWT claims -> SET LOCAL ROLE
//   authenticated -> call the same RPCs the app calls today -> COMMIT.
// Also proves that claims and role do not leak into the next request on a pooled connection.
// Synthetic data only.
import assert from 'node:assert/strict';

const A = '10000000-0000-0000-0000-00000000000a';
const B = '10000000-0000-0000-0000-00000000000b';

export async function runApiSessionTests({ admin, connect }) {
  await admin.query(`ALTER ROLE authenticator PASSWORD 'local-only'`);
  await admin.query(`
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
      ('${A}','api-a@invalid.test',now()),('${B}','api-b@invalid.test',now());
    INSERT INTO public.practices(id,name) VALUES('__api_a','Synthetic A'),('__api_b','Synthetic B');
    INSERT INTO public.tc_users(auth_user_id,name,email,role,status,practice_id) VALUES
      ('${A}','Synthetic A','api-a@invalid.test','admin','active','__api_a'),
      ('${B}','Synthetic B','api-b@invalid.test','admin','active','__api_b');
    INSERT INTO public.patients(id,name,practice_id,location,npe_date) VALUES
      ('__api_pa','Synthetic Patient A','__api_a','Main','2026-09-27'),
      ('__api_pb','Synthetic Patient B','__api_b','Main','2026-09-27');
  `);

  const api = await connect('authenticator', 'local-only');
  // What the Lambda does per request, after verifying the Cognito token.
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
  const claimsFor = (sub, aal = 'aal2') => ({ sub, role: 'authenticated', aal, email: sub === A ? 'api-a@invalid.test' : 'api-b@invalid.test' });
  const ids = rows => rows.map(r => r.id).filter(id => id.startsWith('__api_')).sort();
  const results = [];
  const check = async (name, fn) => { await fn(); results.push(name); };

  try {
    await check('login role alone cannot read patients', async () => {
      await assert.rejects(api.query('SELECT count(*) FROM public.patients'), /permission denied/);
    });

    await check('access context resolves the signed-in practice', async () => {
      const ctx = await asUser(claimsFor(A), c => c.query('SELECT public.get_access_context() AS ctx'));
      assert.equal(ctx.rows[0].ctx?.practice_id, '__api_a');
    });

    await check('read_patients returns only the caller\'s practice', async () => {
      const r = await asUser(claimsFor(A), c => c.query('SELECT public.read_patients() AS rows'));
      assert.deepEqual(ids(r.rows[0].rows), ['__api_pa']);
    });

    await check('save_patient writes to the caller\'s practice', async () => {
      await asUser(claimsFor(A), c => c.query('SELECT public.save_patient($1::jsonb)',
        [JSON.stringify({ id: '__api_pa', name: 'Synthetic Patient A', practice_id: '__api_a', location: 'Main', npe_date: '2026-09-27', notes: 'updated via api' })]));
      const r = await admin.query(`SELECT notes FROM public.patients WHERE id='__api_pa'`);
      assert.equal(r.rows[0].notes, 'updated via api');
    });

    await check('save_patient cannot write into another practice', async () => {
      await assert.rejects(asUser(claimsFor(A), c => c.query('SELECT public.save_patient($1::jsonb)',
        [JSON.stringify({ id: '__api_pb', name: 'Hijacked', practice_id: '__api_b', location: 'Main', npe_date: '2026-09-27' })])));
      const r = await admin.query(`SELECT name FROM public.patients WHERE id='__api_pb'`);
      assert.equal(r.rows[0].name, 'Synthetic Patient B');
    });

    await check('password-only session (no MFA) gets no patients', async () => {
      let rows = [];
      try {
        const r = await asUser(claimsFor(A, 'aal1'), c => c.query('SELECT public.read_patients() AS rows'));
        rows = r.rows[0].rows || [];
      } catch { /* rejected outright is also acceptable */ }
      assert.deepEqual(ids(rows), []);
    });

    await check('claims and role do not leak to the next request on the same connection', async () => {
      await asUser(claimsFor(A), c => c.query('SELECT 1'));
      const r = await api.query(`SELECT nullif(current_setting('request.jwt.claims', true), '') AS claims, current_user AS who`);
      assert.equal(r.rows[0].claims, null);
      assert.equal(r.rows[0].who, 'authenticator');
      await assert.rejects(api.query('SELECT count(*) FROM public.patients'), /permission denied/);
    });

    await check('anonymous requests cannot read patients', async () => {
      await assert.rejects(asUser({ role: 'anon' }, c => c.query('SELECT public.read_patients()'), 'anon'), /permission denied/);
    });
  } finally {
    await api.end();
  }
  return results;
}
