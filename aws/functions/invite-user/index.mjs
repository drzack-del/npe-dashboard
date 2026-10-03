// invite-user on AWS Lambda (behind the API load balancer at /functions/v1/invite-user).
// Creates the Cognito login for someone a practice admin has already put on the team list
// (tc_users) and has Cognito email them a one-time password; resends it if they have not
// signed in yet. Request: { email }. Response: { status: 'invited' | 'resent' | 'exists' }.
//
// Also resets someone's two-step sign-in when they lose their phone. Request:
// { email, action: 'reset-mfa' }. Their authenticator is switched off and they are signed out
// everywhere; at their next sign-in (password unchanged) Cognito asks them to scan a new code.
// Response: { status: 'mfa-reset' }. Admins cannot reset their own (they could not use it).
//
// The caller must present a valid access token signed by the CadenceIQ Cognito pool and be an
// ACTIVE, practice-wide (not location-scoped) admin. The person being invited must already have
// an active, unlinked tc_users row that the caller can see through the database's own row-level
// security, in the caller's practice (or any practice, for the platform owner: a Miller Ortho
// admin, as in is_superadmin()). So this function can only ever create logins for people the
// admin was already allowed to add.
import crypto from 'node:crypto';
import {
  CognitoIdentityProviderClient, AdminCreateUserCommand, AdminGetUserCommand,
  AdminSetUserMFAPreferenceCommand, AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const E = process.env;
const JWKS = JSON.parse(E.JWKS).keys;
const ORIGINS = E.ALLOWED_ORIGINS.split(',');
const PLATFORM_PRACTICE = 'miller-ortho';
const cognito = new CognitoIdentityProviderClient({});

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

// tc_users rows, read with the caller's token so row-level security applies.
async function teamRows(token, filter) {
  const r = await fetch(`${E.API_BASE}/tc_users?select=practice_id,role,status,location_scope,auth_user_id&${filter}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  return r.ok ? r.json() : [];
}

async function cognitoStatus(email) {
  try {
    return (await cognito.send(new AdminGetUserCommand({ UserPoolId: E.USER_POOL_ID, Username: email }))).UserStatus;
  } catch (err) {
    if (err.name === 'UserNotFoundException') return null;
    throw err;
  }
}

export async function handler(event) {
  const origin = event.headers?.origin || '';
  if (event.httpMethod === 'OPTIONS') return reply(origin, 204, {});
  if (event.httpMethod !== 'POST') return reply(origin, 405, { error: 'Method not allowed' });
  if (origin && !ORIGINS.includes(origin)) return reply(origin, 403, { error: 'Origin not allowed' });

  const token = (event.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  let claims = null;
  try { claims = verifiedClaims(token); } catch { claims = null; }
  if (!claims) return reply(origin, 401, { error: 'Sign in required' });

  const [me] = await teamRows(token, `auth_user_id=eq.${claims.sub}`);
  if (!me || me.status !== 'active' || me.role !== 'admin' || me.location_scope) {
    return reply(origin, 403, { error: 'Only a practice admin can do this' });
  }

  let body = {};
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}') || {}; } catch { body = {}; }
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply(origin, 400, { error: 'Enter a valid email address' });

  const rows = await teamRows(token, `email=eq.${encodeURIComponent(email)}`);
  const target = rows.length === 1 ? rows[0] : null;
  const samePractice = target && (target.practice_id === me.practice_id || me.practice_id === PLATFORM_PRACTICE);
  if (!target || !samePractice || target.status !== 'active') {
    return reply(origin, 404, { error: 'Add this person to your team first' });
  }
  if (body.action === 'reset-mfa') {
    if (!target.auth_user_id) return reply(origin, 409, { error: 'This person has not finished setting up their login yet. Use Resend invite instead.' });
    if (target.auth_user_id === claims.sub) return reply(origin, 400, { error: 'You cannot reset your own two-step sign-in.' });
    try {
      if ((await cognitoStatus(email)) === null) return reply(origin, 404, { error: 'No login was found for this person.' });
      await cognito.send(new AdminSetUserMFAPreferenceCommand({
        UserPoolId: E.USER_POOL_ID, Username: email,
        SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
      }));
      await cognito.send(new AdminUserGlobalSignOutCommand({ UserPoolId: E.USER_POOL_ID, Username: email }));
      return reply(origin, 200, { status: 'mfa-reset' });
    } catch (err) {
      console.error('mfa reset failed', err.name);
      return reply(origin, 502, { error: 'The reset could not be completed. Try again shortly.' });
    }
  }
  if (body.action !== undefined) return reply(origin, 400, { error: 'Unknown action' });
  if (target.auth_user_id) return reply(origin, 200, { status: 'exists' });

  try {
    const status = await cognitoStatus(email);
    if (status === null) {
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: E.USER_POOL_ID, Username: email, DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }],
      }));
      return reply(origin, 200, { status: 'invited' });
    }
    if (status === 'FORCE_CHANGE_PASSWORD') {
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: E.USER_POOL_ID, Username: email, MessageAction: 'RESEND', DesiredDeliveryMediums: ['EMAIL'],
      }));
      return reply(origin, 200, { status: 'resent' });
    }
    return reply(origin, 200, { status: 'exists' });
  } catch (err) {
    console.error('invite failed', err.name);
    return reply(origin, 502, { error: 'The invite could not be sent. Try again shortly.' });
  }
}
