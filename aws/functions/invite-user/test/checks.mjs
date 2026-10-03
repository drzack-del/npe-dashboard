import crypto from 'node:crypto';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
Object.assign(process.env, { JWKS: JSON.stringify({ keys: [jwk] }), ISSUER: 'https://iss', CLIENT_ID: 'client', API_BASE: 'https://api/rest/v1',
  ALLOWED_ORIGINS: 'http://localhost:5173', USER_POOL_ID: 'pool' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (claims, key = privateKey, kid = 'k1') => { const h = b64({ alg: 'RS256', kid }), p = b64(claims);
  return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url')}`; };
const tok = (sub, extra = {}) => sign({ sub, iss: 'https://iss', token_use: 'access', client_id: 'client', exp: Date.now() / 1000 + 600, ...extra });
// Stand-in PostgREST: rows visible to each caller (as RLS would decide).
const TEAM = {
  admin:  { practice_id: 'p1', role: 'admin', status: 'active', location_scope: null, auth_user_id: 'admin', email: 'admin@p1.test' },
  tc:     { practice_id: 'p1', role: 'tc', status: 'active', location_scope: null, auth_user_id: 'tc', email: 'tc@p1.test' },
  owner:  { practice_id: 'p1', role: 'admin', status: 'active', location_scope: 'North', auth_user_id: 'owner', email: 'owner@p1.test' },
  oldadm: { practice_id: 'p1', role: 'admin', status: 'inactive', location_scope: null, auth_user_id: 'oldadm', email: 'old@p1.test' },
  plat:   { practice_id: 'miller-ortho', role: 'admin', status: 'active', location_scope: null, auth_user_id: 'plat', email: 'z@m.test' },
  new1:   { practice_id: 'p1', role: 'tc', status: 'active', location_scope: null, auth_user_id: null, email: 'new1@p1.test' },
  new2:   { practice_id: 'p1', role: 'tc', status: 'active', location_scope: null, auth_user_id: null, email: 'new2@p1.test' },
  gone:   { practice_id: 'p1', role: 'tc', status: 'inactive', location_scope: null, auth_user_id: null, email: 'gone@p1.test' },
  p2new:  { practice_id: 'p2', role: 'tc', status: 'active', location_scope: null, auth_user_id: null, email: 'p2new@p2.test' },
};
const visible = (callerSub) => { const me = Object.values(TEAM).find(r => r.auth_user_id === callerSub);
  if (!me) return []; if (me.practice_id === 'miller-ortho' && me.role === 'admin') return Object.values(TEAM);
  return Object.values(TEAM).filter(r => r.practice_id === me.practice_id); };
globalThis.fetch = async (url, opts) => {
  const tokenSub = JSON.parse(Buffer.from(opts.headers.Authorization.split(' ')[1].split('.')[1], 'base64url')).sub;
  const u = new URL(url); const rows = visible(tokenSub);
  const a = u.searchParams.get('auth_user_id'), e = u.searchParams.get('email');
  const out = rows.filter(r => (a ? r.auth_user_id === a.slice(3) : true) && (e ? r.email === e.slice(3) : true));
  return { ok: true, json: async () => out };
};
globalThis.POOL = { 'new2@p1.test': 'FORCE_CHANGE_PASSWORD', 'tc@p1.test': 'CONFIRMED' };
const { handler } = await import('./index.mjs');
const call = (token, body, { method = 'POST', origin = 'http://localhost:5173' } = {}) =>
  handler({ httpMethod: method, headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), isBase64Encoded: false });
let fails = 0;
const check = async (name, p, status, bodyHas, createsNothing = true) => {
  globalThis.CALLS = []; const r = await p; const ok = r.statusCode === status && (!bodyHas || r.body.includes(bodyHas)) && (!createsNothing || !globalThis.CALLS.some(c => c[0] === 'create'));
  if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${r.statusCode} ${r.body}`); return r; };
const A = tok('admin');
await check('no token', call(null, { email: 'new1@p1.test' }), 401);
await check('garbage token', call('x.y', { email: 'new1@p1.test' }), 401);
await check('token signed by another key', call(sign({ sub: 'admin', iss: 'https://iss', token_use: 'access', client_id: 'client', exp: 9e9 }, other.privateKey), { email: 'new1@p1.test' }), 401);
await check('expired token', call(tok('admin', { exp: 1 }), { email: 'new1@p1.test' }), 401);
await check('ID token', call(tok('admin', { token_use: 'id' }), { email: 'new1@p1.test' }), 401);
await check('other app client', call(tok('admin', { client_id: 'x' }), { email: 'new1@p1.test' }), 401);
await check('wrong issuer', call(tok('admin', { iss: 'https://evil' }), { email: 'new1@p1.test' }), 401);
await check('TC (not admin)', call(tok('tc'), { email: 'new1@p1.test' }), 403);
await check('location-scoped owner', call(tok('owner'), { email: 'new1@p1.test' }), 403);
await check('inactive admin', call(tok('oldadm'), { email: 'new1@p1.test' }), 403);
await check('login with no team row', call(tok('stranger'), { email: 'new1@p1.test' }), 403);
await check('bad email', call(A, { email: 'not-an-email' }), 400);
await check('email not on the team', call(A, { email: 'random@x.test' }), 404);
await check("another practice's person", call(A, { email: 'p2new@p2.test' }), 404);
await check('inactive team member', call(A, { email: 'gone@p1.test' }), 404);
await check('already linked (signed in before)', call(A, { email: 'tc@p1.test' }), 200, '"exists"');
await check('unknown origin', call(A, { email: 'new1@p1.test' }, { origin: 'https://evil.example' }), 403);
await check('GET', call(A, { email: 'new1@p1.test' }, { method: 'GET' }), 405);
let r = await check('admin invites a new team member (mixed-case email)', call(A, { email: ' New1@P1.test ' }), 200, '"invited"', false);
const cr = globalThis.CALLS.find(c => c[0] === 'create');
if (!(cr && cr[1].Username === 'new1@p1.test' && cr[1].DesiredDeliveryMediums[0] === 'EMAIL' && !cr[1].MessageAction)) { fails++; console.log('FAIL  create call shape', JSON.stringify(cr)); }
r = await check('invite again before they sign in → resend', call(A, { email: 'new2@p1.test' }), 200, '"resent"', false);
if (!globalThis.CALLS.some(c => c[0] === 'create' && c[1].MessageAction === 'RESEND')) { fails++; console.log('FAIL  resend call'); }
r = await check('platform owner invites into another practice', call(tok('plat'), { email: 'p2new@p2.test' }), 200, '"invited"', false);
// ── reset two-step sign-in ──
await check('reset: TC cannot reset anyone', call(tok('tc'), { email: 'admin@p1.test', action: 'reset-mfa' }), 403);
await check('reset: location owner cannot reset', call(tok('owner'), { email: 'tc@p1.test', action: 'reset-mfa' }), 403);
await check("reset: another practice's person refused", call(A, { email: 'p2new@p2.test', action: 'reset-mfa' }), 404);
await check('reset: someone who never signed in -> use Resend invite', call(A, { email: 'new2@p1.test', action: 'reset-mfa' }), 409, 'Resend invite');
await check('reset: an admin cannot reset their own', call(A, { email: 'admin@p1.test', action: 'reset-mfa' }), 400);
await check('reset: unknown action refused', call(A, { email: 'tc@p1.test', action: 'delete-user' }), 400);
globalThis.CALLS = [];
let rr = await call(A, { email: 'tc@p1.test', action: 'reset-mfa' });
const mfa = globalThis.CALLS.find(c => c[0] === 'mfapref'), so = globalThis.CALLS.find(c => c[0] === 'signout');
const resetOk = rr.statusCode === 200 && rr.body.includes('mfa-reset') && mfa && mfa[1].Username === 'tc@p1.test' && mfa[1].SoftwareTokenMfaSettings.Enabled === false && so && so[1].Username === 'tc@p1.test' && !globalThis.CALLS.some(c => c[0] === 'create');
if (!resetOk) fails++; console.log(`${resetOk ? 'PASS' : 'FAIL'}  reset: admin resets a team member (authenticator off + signed out everywhere): ${rr.statusCode} ${rr.body}`);
await check('reset: no token -> 401', call(null, { email: 'tc@p1.test', action: 'reset-mfa' }), 401);
const pre = await handler({ httpMethod: 'OPTIONS', headers: { origin: 'http://localhost:5173' } });
const preOk = pre.statusCode === 204 && pre.headers['Access-Control-Allow-Origin'] === 'http://localhost:5173';
if (!preOk) fails++; console.log(`${preOk ? 'PASS' : 'FAIL'}  pre-flight from allowed origin`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
