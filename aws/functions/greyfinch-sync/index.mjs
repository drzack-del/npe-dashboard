// greyfinch-sync on AWS Lambda (behind the API load balancer at /functions/v1/greyfinch-sync).
// Pulls a day's New Patient Exam bookings from Greyfinch so a TC can prefill Add NPE.
// Returns PHI, so a caller must: present a valid access token signed by the CadenceIQ Cognito
// pool, and be an ACTIVE, practice-wide (not location-scoped) staff member of the practice that
// owns the Greyfinch credentials, checked through the database's own row-level security.
import crypto from 'node:crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const E = process.env;
const JWKS = JSON.parse(E.JWKS).keys;
const ORIGINS = E.ALLOWED_ORIGINS.split(',');
const GF = 'https://connect-api.greyfinch.com/v1/graphql';
const sm = new SecretsManagerClient({});

const reply = (origin, status, body) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    ...(ORIGINS.includes(origin) ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    } : {}),
  },
  body: JSON.stringify(body),
  isBase64Encoded: false,
});

const b64json = s => JSON.parse(Buffer.from(s, 'base64url').toString());

// Signature, issuer, token type, app client and expiry. Never trust decoded claims alone.
function verifiedClaims(token) {
  const [h, p, s] = (token || '').split('.');
  if (!s) return null;
  const head = b64json(h);
  const jwk = JWKS.find(k => k.kid === head.kid);
  if (!jwk || head.alg !== 'RS256') return null;
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) return null;
  const c = b64json(p);
  const fresh = c.exp > Date.now() / 1000;
  return c.iss === E.ISSUER && c.token_use === 'access' && c.client_id === E.CLIENT_ID && fresh ? c : null;
}

// The caller's own staff row, read with the caller's token so row-level security applies.
async function membership(token, sub) {
  const r = await fetch(`${E.API_BASE}/tc_users?select=practice_id,status,location_scope&auth_user_id=eq.${sub}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const rows = r.ok ? await r.json() : [];
  return rows[0] || null;
}

async function gql(query, variables, token) {
  const r = await fetch(GF, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const d = await r.json();
  if (d.errors) throw new Error('Greyfinch request failed');
  return d.data;
}

function age(bd) {
  const b = new Date(bd || '');
  if (isNaN(b)) return null;
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}
const phone = ps => ((ps || []).find(p => /mobile|cell/i.test(p.type || '')) || (ps || [])[0] || {}).value?.trim() || '';

export async function handler(event) {
  const origin = event.headers?.origin || '';
  if (event.httpMethod === 'OPTIONS') return reply(origin, 204, {});
  if (event.httpMethod !== 'POST') return reply(origin, 405, { error: 'Method not allowed' });
  if (origin && !ORIGINS.includes(origin)) return reply(origin, 403, { error: 'Origin not allowed' });

  const token = (event.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  let claims = null;
  try { claims = verifiedClaims(token); } catch { claims = null; }
  if (!claims) return reply(origin, 401, { error: 'Sign in required' });
  const member = await membership(token, claims.sub);
  if (!member || member.status !== 'active' || member.practice_id !== E.PRACTICE_ID || member.location_scope) {
    return reply(origin, 403, { error: 'Greyfinch is available to practice staff only' });
  }

  const creds = JSON.parse((await sm.send(new GetSecretValueCommand({ SecretId: E.GREYFINCH_SECRET_ARN }))).SecretString);
  if (!creds.key || !creds.secret) return reply(origin, 503, { error: 'Greyfinch is not connected yet.' });

  try {
    const login = await gql('mutation($k:String!,$s:String!){ apiLogin(key:$k, secret:$s){ status accessToken } }',
      { k: creds.key.trim(), s: creds.secret.trim() });
    const gfToken = login?.apiLogin?.accessToken;
    if (!gfToken) return reply(origin, 502, { error: 'Greyfinch login failed. Check the Greyfinch key in AWS.' });

    let body = {};
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}') || {}; } catch { body = {}; }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : today;
    const npe = '{ type: { name: { _ilike: "%New Patient Exam%" } } }';

    if (body.mode === 'scan') {
      const end = new Date(`${today}T00:00:00`);
      end.setDate(end.getDate() + 21);
      const d = await gql(`query { appointmentBookings(where: { localStartDate: { _gte: "${today}", _lte: "${end.toISOString().slice(0, 10)}" }, appointment: ${npe} }) { localStartDate appointment { id } } }`, {}, gfToken);
      const seen = new Set(), counts = {};
      for (const b of d?.appointmentBookings || []) {
        const k = `${b.localStartDate}|${b.appointment?.id}`;
        if (!b.localStartDate || seen.has(k)) continue;
        seen.add(k);
        counts[b.localStartDate] = (counts[b.localStartDate] || 0) + 1;
      }
      const scan = Object.entries(counts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
      return reply(origin, 200, { mode: 'scan', today, scan });
    }

    const d = await gql(`query { appointmentBookings(where: { localStartDate: { _eq: "${date}" }, appointment: ${npe} }) { localStartTime appointment { id type { name isVirtual } patient { id primaryLocation { id name } person { firstName lastName birthDate phones { value type } } } } } }`, {}, gfToken);
    const byAppt = new Map();
    for (const b of d?.appointmentBookings || []) {
      if (b.appointment?.id && !byAppt.has(b.appointment.id)) byAppt.set(b.appointment.id, b);
    }
    const patients = [...byAppt.values()].map(({ appointment: a, localStartTime }) => {
      const p = a.patient?.person || {};
      return {
        greyfinchId: a.patient?.id || a.id, apptId: a.id,
        name: [p.firstName, p.lastName].filter(Boolean).join(' ').trim(),
        phone: phone(p.phones), age: age(p.birthDate), birthDate: p.birthDate || null,
        location: a.patient?.primaryLocation?.name || '', apptDate: date, apptTime: localStartTime || '',
        isVirtual: !!a.type?.isVirtual,
      };
    }).filter(p => p.name).sort((x, y) => x.apptTime.localeCompare(y.apptTime));
    return reply(origin, 200, { date, patients, count: patients.length });
  } catch {
    return reply(origin, 502, { error: 'Greyfinch request failed. Try again shortly.' });
  }
}
