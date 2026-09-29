// LOCAL TEST ONLY. A minimal stand-in for Supabase Auth (GoTrue), covering just the endpoints
// the CadenceIQ app calls: password sign-in, token refresh, get/update user, sign-out, sign-up,
// password-reset request, and authenticator-app (TOTP) enroll/challenge/verify/unenroll.
//
// It issues tokens with the same claims Supabase does (sub, role, email, aal, amr, session_id),
// signed with a local secret that PostgREST also trusts. On AWS this role is played by Cognito
// plus a token trigger that adds `role` and `aal`; this file is never deployed.
import crypto from 'node:crypto';

const b64url = buf => Buffer.from(buf).toString('base64url');
export const signJwt = (payload, secret) => {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};
const verifyJwt = (token, secret) => {
  const [head, body, sig] = (token || '').split('.');
  if (!sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  return claims.exp && claims.exp < Date.now() / 1000 ? null : claims;
};

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits), the scheme authenticator apps use.
const base32Decode = s => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
};
export const totpCode = (secret, step = Math.floor(Date.now() / 30000)) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};
const totpMatches = (secret, code) => [-1, 0, 1].some(d => totpCode(secret, Math.floor(Date.now() / 30000) + d) === code);
const newBase32Secret = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  return Array.from(crypto.randomBytes(32), b => alphabet[b % 32]).join('');
};

const hashPassword = pw => {
  const salt = crypto.randomBytes(16);
  return { salt, hash: crypto.scryptSync(pw, salt, 32) };
};
const passwordMatches = (stored, pw) => stored && crypto.timingSafeEqual(stored.hash, crypto.scryptSync(pw, stored.salt, 32));

export function createAuth({ admin, jwtSecret, users: seedUsers, password: seedPassword, log }) {
  const users = new Map();          // email -> { id, email, password, factors: [] , created_at }
  const refreshTokens = new Map();  // refresh token -> { userId, sessionId, aal, amr }
  const challenges = new Map();     // challenge id -> factor id
  const byId = id => [...users.values()].find(u => u.id === id);
  const now = () => new Date().toISOString();

  for (const u of seedUsers) {
    users.set(u.email, {
      id: u.id, email: u.email, password: hashPassword(seedPassword), created_at: now(),
      factors: u.totpSecret ? [{ id: crypto.randomUUID(), friendly_name: 'Cadence authenticator', factor_type: 'totp',
        status: 'verified', secret: u.totpSecret, created_at: now(), updated_at: now() }] : [],
    });
  }

  const publicUser = u => ({
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, phone: '',
    email_confirmed_at: u.created_at, confirmed_at: u.created_at, last_sign_in_at: now(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
    created_at: u.created_at, updated_at: now(), is_anonymous: false,
    factors: u.factors.map(({ secret, ...f }) => f),
  });

  const issueSession = (u, { aal, amr, sessionId = crypto.randomUUID() }) => {
    const iat = Math.floor(Date.now() / 1000);
    const expires_in = 3600;
    const access_token = signJwt({
      iss: 'cadenceiq-local-auth', aud: 'authenticated', sub: u.id, email: u.email, phone: '',
      role: 'authenticated', aal, amr, session_id: sessionId, is_anonymous: false,
      app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, iat, exp: iat + expires_in,
    }, jwtSecret);
    const refresh_token = crypto.randomBytes(24).toString('base64url');
    refreshTokens.set(refresh_token, { userId: u.id, sessionId, aal, amr });
    return { access_token, token_type: 'bearer', expires_in, expires_at: iat + expires_in, refresh_token, user: publicUser(u) };
  };

  const fail = (status, error_code, msg) => ({ status, body: { code: status, error_code, msg } });
  const ok = (body, status = 200) => ({ status, body });

  const currentUser = req => {
    const claims = verifyJwt((req.headers.authorization || '').replace(/^Bearer /i, ''), jwtSecret);
    if (!claims || claims.role !== 'authenticated') return {};
    return { claims, user: byId(claims.sub) };
  };

  const insertAuthRow = u => admin.query(
    `INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now()) ON CONFLICT (id) DO NOTHING`, [u.id, u.email]);

  return {
    async seedDatabaseRows() { for (const u of users.values()) await insertAuthRow(u); },

    devTotp(email) {
      const f = users.get((email || '').toLowerCase())?.factors.find(x => x.factor_type === 'totp');
      return f ? { email, code: totpCode(f.secret), note: 'Local test only. Valid for about 30 seconds.' } : null;
    },

    // (method, path after /auth/v1, query, body, req) -> { status, body }
    async handle(method, route, query, body, req) {
      if (method === 'POST' && route === '/token' && query.get('grant_type') === 'password') {
        const u = users.get((body.email || '').toLowerCase());
        if (!u || !passwordMatches(u.password, body.password || '')) return fail(400, 'invalid_credentials', 'Invalid login credentials');
        log(`auth: ${u.email} signed in with password (aal1)`);
        return ok(issueSession(u, { aal: 'aal1', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] }));
      }
      if (method === 'POST' && route === '/token' && query.get('grant_type') === 'refresh_token') {
        const r = refreshTokens.get(body.refresh_token);
        const u = r && byId(r.userId);
        if (!u) return fail(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        refreshTokens.delete(body.refresh_token);
        return ok(issueSession(u, r));
      }
      if (method === 'POST' && route === '/signup') {
        const email = (body.email || '').toLowerCase();
        if (users.has(email)) return fail(422, 'user_already_exists', 'User already registered');
        const u = { id: crypto.randomUUID(), email, password: hashPassword(body.password || ''), created_at: now(), factors: [] };
        users.set(email, u);
        await insertAuthRow(u);
        log(`auth: signed up ${email} (auto-confirmed locally)`);
        return ok(publicUser(u));
      }
      if (method === 'POST' && route === '/recover') {
        log(`auth: password reset requested for ${body.email} (no email is sent locally)`);
        return ok({});
      }
      if (method === 'POST' && route === '/logout') {
        const { claims } = currentUser(req);
        if (claims) for (const [t, r] of refreshTokens) if (r.userId === claims.sub) refreshTokens.delete(t);
        return { status: 204, body: null };
      }

      const { claims, user } = currentUser(req);
      if (!user) return fail(401, 'bad_jwt', 'invalid JWT: unable to parse or verify signature');

      if (method === 'GET' && route === '/user') return ok(publicUser(user));
      if (method === 'PUT' && route === '/user') {
        if (body.password) {
          if (body.password.length < 12) return fail(422, 'weak_password', 'Password should be at least 12 characters.');
          user.password = hashPassword(body.password);
          log(`auth: ${user.email} changed password`);
        }
        return ok(publicUser(user));
      }
      if (method === 'POST' && route === '/factors') {
        const factor = { id: crypto.randomUUID(), friendly_name: body.friendly_name || 'Authenticator', factor_type: 'totp',
          status: 'unverified', secret: newBase32Secret(), created_at: now(), updated_at: now() };
        user.factors.push(factor);
        const uri = `otpauth://totp/CadenceIQ%20local:${encodeURIComponent(user.email)}?secret=${factor.secret}&issuer=CadenceIQ%20local`;
        // No '#' anywhere: the client drops this SVG into a data: URL unescaped.
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="220" height="220" fill="lightgray"/><text x="110" y="100" font-size="13" text-anchor="middle">Local test: no QR.</text><text x="110" y="122" font-size="13" text-anchor="middle">Use the code below.</text></svg>`;
        return ok({ id: factor.id, type: 'totp', friendly_name: factor.friendly_name, totp: { qr_code: svg, secret: factor.secret, uri } });
      }
      let m = route.match(/^\/factors\/([^/]+)(\/challenge|\/verify)?$/);
      const factor = m && user.factors.find(f => f.id === m[1]);
      if (m && !factor) return fail(404, 'mfa_factor_not_found', 'Factor not found');
      if (m && method === 'POST' && m[2] === '/challenge') {
        const id = crypto.randomUUID();
        challenges.set(id, factor.id);
        return ok({ id, type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
      }
      if (m && method === 'POST' && m[2] === '/verify') {
        if (challenges.get(body.challenge_id) !== factor.id) return fail(422, 'mfa_challenge_expired', 'Challenge not found');
        challenges.delete(body.challenge_id);
        if (!totpMatches(factor.secret, String(body.code || ''))) return fail(422, 'mfa_verification_failed', 'Invalid TOTP code entered');
        factor.status = 'verified';
        factor.updated_at = now();
        log(`auth: ${user.email} passed two-step verification (aal2)`);
        const amr = [...(claims.amr || []), { method: 'totp', timestamp: Math.floor(Date.now() / 1000) }];
        return ok(issueSession(user, { aal: 'aal2', amr, sessionId: claims.session_id }));
      }
      if (m && method === 'DELETE' && !m[2]) {
        user.factors = user.factors.filter(f => f.id !== factor.id);
        return ok({ id: factor.id });
      }
      return fail(404, 'not_found', `Local auth stand-in does not implement ${method} ${route}`);
    },
  };
}
