// Run: npx deno test --allow-env --allow-net supabase/functions/greyfinch-sync/
// Uses fakes for Supabase and Greyfinch, so it never touches real patient data.
// The one live test (anon key against the real auth server) only runs when
// SUPABASE_URL and SUPABASE_ANON_KEY are set.

import { assert, assertEquals } from 'jsr:@std/assert@1';
import { AccessError, Caller, Deps, makeHandler, supabaseLookupCaller } from './handler.ts';

const APP = 'https://trycadenceiq.com';
const KEY = 'pk_user_SECRETKEYVALUE123';
const SECRET = 'sk_user_SECRETSECRETVALUE456';

const millerTc: Caller = { userId: 'u1', practiceId: 'miller-ortho', role: 'tc', status: 'active', locationScope: null };

function setup(lookup: (auth: string) => Promise<Caller>, gqlImpl?: Deps['gql']) {
  const calls: string[] = [];
  const env: Record<string, string> = { GREYFINCH_KEY: KEY, GREYFINCH_SECRET: SECRET };
  const gql: Deps['gql'] = gqlImpl ?? (async (query) => {
    calls.push(query);
    if (query.includes('apiLogin')) return { apiLogin: { status: 'OK', accessToken: 'gf-token' } };
    return {
      appointmentBookings: [{
        localStartTime: '09:30:00',
        appointment: {
          id: 'a1', type: { name: 'New Patient Exam', isVirtual: false },
          patient: { id: 'p1', primaryLocation: { id: 'l1', name: 'Carrollwood' },
            person: { firstName: 'Test', lastName: 'Patient', birthDate: '2015-01-01', phones: [{ value: '555-0100', type: 'mobile' }] } },
        },
      }],
    };
  });
  const handler = makeHandler({ lookupCaller: lookup, gql, env: (n) => env[n] });
  return { handler, calls, env };
}

const post = (headers: Record<string, string> = {}, body: unknown = { date: '2026-10-01' }) =>
  new Request('http://localhost/greyfinch-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer tok', origin: APP, ...headers },
    body: JSON.stringify(body),
  });

Deno.test('not signed in (lookup rejects, e.g. anon key) -> 401, Greyfinch never called', async () => {
  const { handler, calls } = setup(() => { throw new AccessError(401, 'Sign in required'); });
  const res = await handler(post());
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, 'Sign in required');
  assertEquals(calls.length, 0);
});

Deno.test('signed-in users outside Miller Ortho staff -> 403, Greyfinch never called', async () => {
  const cases: Caller[] = [
    { userId: 'x', practiceId: null, role: null, status: null, locationScope: null }, // open sign-up, no tc_users row
    { userId: 'x', practiceId: 'smile-bliss-ortho', role: 'admin', status: 'active', locationScope: null },
    { userId: 'x', practiceId: 'demo-ortho', role: 'tc', status: 'active', locationScope: null },
    { ...millerTc, status: 'inactive' },
    { ...millerTc, role: 'location_owner', locationScope: 'Apollo Beach' },
    { ...millerTc, locationScope: 'Apollo Beach' },
    { ...millerTc, role: 'something-else' },
  ];
  for (const c of cases) {
    const { handler, calls } = setup(async () => c);
    const res = await handler(post());
    assertEquals(res.status, 403, JSON.stringify(c));
    assertEquals(calls.length, 0);
  }
});

Deno.test('Miller staff (admin, manager, tc) get the same response shape as before', async () => {
  for (const role of ['admin', 'manager', 'tc']) {
    const { handler } = setup(async () => ({ ...millerTc, role }));
    const res = await handler(post());
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.date, '2026-10-01');
    assertEquals(body.count, 1);
    assertEquals(Object.keys(body.patients[0]).sort(),
      ['age', 'apptDate', 'apptId', 'apptTime', 'birthDate', 'greyfinchId', 'isVirtual', 'location', 'name', 'phone']);
    assertEquals(body.patients[0].name, 'Test Patient');
    assertEquals(body.patients[0].phone, '555-0100');
    assertEquals(res.headers.get('access-control-allow-origin'), APP);
  }
});

Deno.test('scan mode still returns { mode, today, scan }', async () => {
  const { handler } = setup(async () => millerTc, async (q) =>
    q.includes('apiLogin') ? { apiLogin: { accessToken: 't' } }
      : { appointmentBookings: [{ localStartDate: '2026-10-02', appointment: { id: 'a' } }] });
  const body = await (await handler(post({}, { mode: 'scan' }))).json();
  assertEquals(body.mode, 'scan');
  assertEquals(body.scan, [{ date: '2026-10-02', count: 1 }]);
});

Deno.test('CORS: unknown browser origin is refused and never gets an allow-origin header', async () => {
  const { handler, calls } = setup(async () => millerTc);
  const res = await handler(post({ origin: 'https://evil.example' }));
  assertEquals(res.status, 403);
  assertEquals(res.headers.get('access-control-allow-origin'), null);
  assertEquals(calls.length, 0);
  const pre = await handler(new Request('http://localhost/', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
  assertEquals(pre.headers.get('access-control-allow-origin'), null);
  const ok = await handler(new Request('http://localhost/', { method: 'OPTIONS', headers: { origin: APP } }));
  assertEquals(ok.headers.get('access-control-allow-origin'), APP);
});

Deno.test('Greyfinch login failure does not reveal any part of the key or secret', async () => {
  const { handler } = setup(async () => millerTc, async () => ({ apiLogin: { status: 'INVALID', accessToken: null } }));
  const res = await handler(post());
  assertEquals(res.status, 502);
  const text = await res.text();
  for (const s of [KEY.slice(0, 8), SECRET.slice(0, 8), String(KEY.length), String(SECRET.length)]) {
    assert(!text.includes(s), `response leaked "${s}": ${text}`);
  }
});

Deno.test('unexpected errors return a generic message', async () => {
  const { handler } = setup(async () => millerTc, async () => { throw new Error('internal detail xyz'); });
  const res = await handler(post());
  assertEquals(res.status, 500);
  assert(!(await res.text()).includes('xyz'));
});

Deno.test('missing or malformed Authorization header -> 401 from the real lookup', async () => {
  for (const h of ['', 'Basic abc', 'Bearer']) {
    try { await supabaseLookupCaller(h); throw new Error('should have thrown'); }
    catch (e) { assert(e instanceof AccessError && e.status === 401, String(e)); }
  }
});

Deno.test({
  name: 'LIVE: the public anon key is rejected by the real Supabase auth server',
  ignore: !Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_ANON_KEY'),
  async fn() {
    try {
      await supabaseLookupCaller(`Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`);
      throw new Error('anon key was accepted');
    } catch (e) {
      assert(e instanceof AccessError && e.status === 401, String(e));
    }
  },
});
