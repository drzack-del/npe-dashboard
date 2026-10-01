// greyfinch-sync — pulls New Patient Exam bookings from Greyfinch so the TC can
// one-click prepopulate the Add-NPE form instead of retyping. Holds the Greyfinch
// key/secret as Supabase secrets (never in the frontend). Returns PHI, so JWT
// verification stays ON (do NOT deploy with --no-verify-jwt).
//
// The Greyfinch credentials belong to ONE practice (Miller Orthodontics), so only
// that practice's active, non-location-scoped staff may call this. A valid Supabase
// session alone is not enough: other practices' staff and open sign-ups have those.
//
// Secrets required (set via `supabase secrets set`):
//   GREYFINCH_KEY     pk_user_...
//   GREYFINCH_SECRET  sk_user_...
// Optional:
//   APP_ORIGINS       comma-separated extra browser origins allowed by CORS
//
// The logic lives here (not index.ts) so tests can inject fakes for Supabase and
// Greyfinch; index.ts just serves it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const GREYFINCH_URL = 'https://connect-api.greyfinch.com/v1/graphql';

// The practice whose Greyfinch account GREYFINCH_KEY/SECRET log in to.
export const GREYFINCH_PRACTICE_ID = 'miller-ortho';
// Roles that use the Add New Patient screen. Location owners don't (see the nav in
// src/App.jsx) and must not see other locations' patients, so they're excluded.
const ALLOWED_ROLES = ['admin', 'manager', 'tc'];

const DEFAULT_ORIGINS = [
  'https://trycadenceiq.com',
  'https://www.trycadenceiq.com',
  'https://npe-dashboard.vercel.app',
];

export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type Caller = {
  userId: string;
  practiceId: string | null;
  role: string | null;
  status: string | null;
  locationScope: string | null;
};

type Gql = (query: string, variables: Record<string, unknown>, token?: string) => Promise<any>;

export type Deps = {
  // Verifies the bearer token with the Supabase auth server and returns the caller's
  // tc_users membership, or throws AccessError(401) for anything that isn't a real user.
  lookupCaller: (authHeader: string) => Promise<Caller>;
  gql: Gql;
  env: (name: string) => string | undefined;
};

function allowedOrigins(env: Deps['env']) {
  const extra = (env('APP_ORIGINS') || '').split(',').map(v => v.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

function respond(req: Request, env: Deps['env'], body: unknown, status = 200) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const origin = req.headers.get('origin');
  if (origin && allowedOrigins(env).includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

// Real Supabase lookup. The auth server checks the token's signature and expiry; we
// never trust decoded claims. Membership is read with the caller's own token, so RLS
// on tc_users applies (a user can only see their own row or their practice's rows).
export async function supabaseLookupCaller(authHeader: string): Promise<Caller> {
  if (!/^Bearer\s+\S+$/i.test(authHeader)) throw new AccessError(401, 'Sign in required');
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user || user.is_anonymous) throw new AccessError(401, 'Sign in required');

  const { data: rows, error: rowError } = await client
    .from('tc_users')
    .select('practice_id, role, status, location_scope')
    .eq('auth_user_id', user.id)
    .limit(2);
  if (rowError) throw new Error(`tc_users lookup failed: ${rowError.message}`);
  // No row, or (unexpectedly) more than one: treat as not a member.
  const row = rows?.length === 1 ? rows[0] : null;
  return {
    userId: user.id,
    practiceId: row?.practice_id ?? null,
    role: row?.role ?? null,
    status: row?.status ?? null,
    locationScope: row?.location_scope ?? null,
  };
}

export function assertMayUseGreyfinch(c: Caller) {
  const ok = c.practiceId === GREYFINCH_PRACTICE_ID
    && c.status === 'active'
    && !c.locationScope
    && ALLOWED_ROLES.includes(c.role || '');
  if (!ok) throw new AccessError(403, 'Greyfinch import is not available for this account.');
}

// One GraphQL POST to Greyfinch with an optional bearer token.
export const greyfinchGql: Gql = async (query, variables, token) => {
  const res = await fetch(GREYFINCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors.map((e: { message: string }) => e.message).join('; '));
  return data.data;
};

// birthDate (ISO) -> integer age in years, or null.
function ageFromBirthDate(bd?: string | null): number | null {
  if (!bd) return null;
  const b = new Date(bd);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// Prefer a mobile/cell number; fall back to the first phone on file.
function pickPhone(phones?: Array<{ value?: string; type?: string }> | null): string {
  if (!phones || phones.length === 0) return '';
  const mobile = phones.find(p => /mobile|cell/i.test(p.type || ''));
  return (mobile?.value || phones[0]?.value || '').trim();
}

export const defaultDeps: Deps = {
  lookupCaller: supabaseLookupCaller,
  gql: greyfinchGql,
  env: (name) => Deno.env.get(name),
};

export function makeHandler(deps: Deps = defaultDeps) {
  const { gql, env } = deps;
  const json = (req: Request, body: unknown, status = 200) => respond(req, env, body, status);

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return json(req, {}, 200);
    if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
    const origin = req.headers.get('origin');
    if (origin && !allowedOrigins(env).includes(origin)) return json(req, { error: 'Origin not allowed' }, 403);

    try {
      const caller = await deps.lookupCaller(req.headers.get('authorization') || '');
      assertMayUseGreyfinch(caller);

      // Accept either casing — the secret may be set as GREYFINCH_KEY or greyfinch_key.
      const KEY = env('GREYFINCH_KEY') ?? env('greyfinch_key');
      const SECRET = env('GREYFINCH_SECRET') ?? env('greyfinch_secret');
      if (!KEY || !SECRET) return json(req, { error: 'Greyfinch is not configured. Contact support.' }, 500);

      // 1. Exchange key/secret for a 24h JWT. Trim in case the secret picked up a
      //    trailing space/newline when it was pasted into the dashboard.
      const login = await gql(
        `mutation($k:String!,$s:String!){ apiLogin(key:$k, secret:$s){ status accessToken } }`,
        { k: KEY.trim(), s: SECRET.trim() },
      );
      const token = login?.apiLogin?.accessToken;
      if (!token) {
        // Log only Greyfinch's status — never any part of the key or secret.
        console.error(`greyfinch-sync: Greyfinch login failed (status: ${login?.apiLogin?.status || 'none'})`);
        return json(req, { error: 'Greyfinch login failed. Contact support.' }, 502);
      }

      // Parse the request body once: { date?: "YYYY-MM-DD", mode?: "scan" }.
      let body: { date?: string; mode?: string } = {};
      try { body = (await req.json()) || {}; } catch { /* no body */ }

      // Today in the practice's local timezone (Florida = America/New_York). Greyfinch
      // booking dates are already local dates, so we compare local-to-local.
      const todayLocal = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date()); // en-CA renders as YYYY-MM-DD
      let targetDate = body.date || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) targetDate = todayLocal;

      // Diagnostic scan (testing aid): count NPEs per day over the next 21 days so the TC
      // can find a populated day. Queries bookings by date range — dates + counts only, no PHI.
      if (body.mode === 'scan') {
        const end = new Date(`${todayLocal}T00:00:00`);
        end.setDate(end.getDate() + 21);
        const cutoff = end.toISOString().slice(0, 10);
        const scanQ = `
          query NpeScan {
            appointmentBookings(where: {
              localStartDate: { _gte: "${todayLocal}", _lte: "${cutoff}" },
              appointment: { type: { name: { _ilike: "%New Patient Exam%" } } }
            }) {
              localStartDate
              appointment { id }
            }
          }`;
        const sData = await gql(scanQ, {}, token);
        const bookings: any[] = sData?.appointmentBookings || [];
        // Dedupe by appointment id per day so a double-booked appt isn't counted twice.
        const seen = new Set<string>();
        const counts: Record<string, number> = {};
        for (const b of bookings) {
          const d = b?.localStartDate;
          const id = b?.appointment?.id;
          if (!d) continue;
          const key = `${d}|${id}`;
          if (id && seen.has(key)) continue;
          if (id) seen.add(key);
          counts[d] = (counts[d] || 0) + 1;
        }
        const scan = Object.entries(counts)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));
        return json(req, { mode: 'scan', today: todayLocal, scan });
      }

      // Pull the NPE bookings for exactly the target day. Filtering by booking date in the
      // query (not fetching all appointments and filtering here) is what makes busy days
      // accurate — the appointments list is capped at ~1000 and would truncate them.
      const q = `
        query NpeBookingsForDay {
          appointmentBookings(where: {
            localStartDate: { _eq: "${targetDate}" },
            appointment: { type: { name: { _ilike: "%New Patient Exam%" } } }
          }) {
            localStartTime
            appointment {
              id
              type { name isVirtual }
              patient {
                id
                primaryLocation { id name }
                person { firstName lastName birthDate phones { value type } }
              }
            }
          }
        }`;
      const data = await gql(q, {}, token);
      const bookings: any[] = data?.appointmentBookings || [];

      // One row per appointment (dedupe in case an appt has two bookings the same day).
      const byAppt = new Map<string, any>();
      for (const b of bookings) {
        const appt = b?.appointment;
        if (!appt?.id) continue;
        if (!byAppt.has(appt.id)) byAppt.set(appt.id, { appt, time: b.localStartTime || '' });
      }

      const list = Array.from(byAppt.values())
        .map(({ appt, time }) => {
          const person = appt.patient?.person || {};
          const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
          return {
            greyfinchId: appt.patient?.id || appt.id,
            apptId: appt.id,
            name,
            phone: pickPhone(person.phones),
            age: ageFromBirthDate(person.birthDate),
            birthDate: person.birthDate || null,
            location: appt.patient?.primaryLocation?.name || '',
            apptDate: targetDate,
            apptTime: time,
            isVirtual: !!appt.type?.isVirtual,
          };
        })
        .filter(p => p.name) // drop records with no name
        .sort((a, b) => (a.apptTime || '').localeCompare(b.apptTime || '')); // earliest first

      return json(req, { date: targetDate, patients: list, count: list.length });
    } catch (e) {
      if (e instanceof AccessError) return json(req, { error: e.message }, e.status);
      console.error('greyfinch-sync:', (e as Error)?.message || e);
      return json(req, { error: 'Could not reach Greyfinch. Try again or contact support.' }, 500);
    }
  };
}
