// LOCAL TEST ONLY. Runs the real CadenceIQ app against a throwaway database on this machine,
// shaped like the planned AWS setup:
//
//   browser app (vite --mode awslocal)
//        -> http://localhost:54321   this gateway
//             /rest/v1/*       -> PostgREST 14.1 (same data layer Supabase uses) -> Postgres 17
//             /auth/v1/*       -> auth.mjs (stand-in for Supabase Auth / later Cognito)
//             /functions/v1/*  -> stubs: nothing is emailed, billed, or sent to Greyfinch
//             /__dev/totp      -> current six-digit code for a seeded account
//
// The database is rebuilt from the migrations and fake seed data on every start, and deleted
// on exit. Start:  node aws/db/local-app/start.mjs   then   npm run dev -- --mode awslocal
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applySchema, runFile, repo, here as dbDir } from '../schema.mjs';
import { createAuth, verifyJwt } from './auth.mjs';
import { DEMO_USERS, LOCAL_TEST_PASSWORD } from './demo-users.mjs';
import { PG_PORT, REST_PORT, GATEWAY_PORT, JWT_SECRET, APP_ENV } from './local-config.mjs';

const here = path.join(dbDir, 'local-app');
const APP_ORIGINS = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const dataDir = path.join(tmpdir(), 'cadenceiq-local-app-pg');
const log = msg => console.log(`[local] ${msg}`);

const db = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'local-only', port: PG_PORT,
  persistent: false, onLog: () => {}, onError: () => {} });
let postgrest;
const shutdown = async code => {
  postgrest?.kill();
  await db.stop().catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
  process.exit(code);
};
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

await rm(dataDir, { recursive: true, force: true });
await db.initialise();
await db.start();
await db.createDatabase('cadenceiq');
const admin = new pg.Client({ host: 'localhost', port: PG_PORT, user: 'postgres', password: 'local-only', database: 'cadenceiq' });
await admin.connect();

log('building database from migrations...');
await applySchema(admin, () => {});
await runFile(admin, path.join(here, 'seed-demo.sql'), () => {});
const auth = createAuth({ admin, jwtSecret: JWT_SECRET, users: DEMO_USERS, password: LOCAL_TEST_PASSWORD, log });
await auth.seedDatabaseRows();
for (const u of DEMO_USERS) {
  await admin.query(`INSERT INTO public.tc_users(auth_user_id,name,email,role,status,practice_id,location_scope,location_label)
    VALUES($1,$2,$3,$4,'active',$5,$6,$7)`, [u.id, u.name, u.email, u.role, u.practice_id, u.location_scope || null, u.location_label || null]);
}
await admin.query(`ALTER ROLE authenticator PASSWORD 'local-only'`);
log(`database ready: ${DEMO_USERS.length} fake staff, 80 fake patients`);

// Same library directory trick as the tests: PostgREST's macOS build expects Homebrew's libpq.
postgrest = spawn(path.join(here, 'bin/postgrest'), [], {
  env: {
    ...process.env,
    DYLD_LIBRARY_PATH: path.join(dbDir, 'node_modules/@embedded-postgres/darwin-arm64/native/lib'),
    PGRST_DB_URI: `postgres://authenticator:local-only@localhost:${PG_PORT}/cadenceiq`,
    PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(REST_PORT), PGRST_DB_MAX_ROWS: '1000', PGRST_LOG_LEVEL: 'error',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
postgrest.on('exit', code => { if (code) { console.error(`PostgREST exited (${code})`); shutdown(1); } });

const functionStubs = {
  'send-email': body => ({ status: 200, body: { ok: true, localStub: true, note: `not sent: would have emailed ${(body.to || []).length} recipient(s)` } }),
  'greyfinch-sync': () => ({ status: 503, body: { error: 'Greyfinch is not connected in local testing.' } }),
  billing: () => ({ status: 503, body: { error: 'Billing is not available in local testing.' } }),
};

const readBody = req => new Promise(resolve => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
});
const cors = req => ({
  'Access-Control-Allow-Origin': APP_ORIGINS.test(req.headers.origin || '') ? req.headers.origin : 'http://localhost:5173',
  'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Profile, Location',
  'Access-Control-Allow-Credentials': 'true',
});
const sendJson = (req, res, { status, body }) => {
  res.writeHead(status, { ...cors(req), 'Content-Type': 'application/json' });
  res.end(body === null ? undefined : JSON.stringify(body));
};

const gateway = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors(req)); return res.end(); }
    const url = new URL(req.url, `http://localhost:${GATEWAY_PORT}`);
    const raw = await readBody(req);

    if (url.pathname.startsWith('/rest/v1')) {
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'origin', 'connection', 'content-length'].includes(k)));
      // Versions of the app with the production anon key built in send a token this stack did
      // not sign. Treat any such request as anonymous rather than rejecting it.
      if (headers.authorization && !verifyJwt(headers.authorization.replace(/^Bearer /i, ''), JWT_SECRET)) delete headers.authorization;
      const upstream = await fetch(`http://127.0.0.1:${REST_PORT}${url.pathname.slice('/rest/v1'.length) || '/'}${url.search}`, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw,
      });
      const responseHeaders = { ...cors(req) };
      upstream.headers.forEach((v, k) => { if (!k.startsWith('access-control-') && !['content-encoding', 'transfer-encoding', 'connection'].includes(k)) responseHeaders[k] = v; });
      res.writeHead(upstream.status, responseHeaders);
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }
    const body = raw.length ? JSON.parse(raw.toString()) : {};
    if (url.pathname.startsWith('/auth/v1')) {
      return sendJson(req, res, await auth.handle(req.method, url.pathname.slice('/auth/v1'.length), url.searchParams, body, req));
    }
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.split('/')[3];
      log(`function stub called: ${name}`);
      return sendJson(req, res, functionStubs[name]?.(body) || { status: 503, body: { error: `${name} is not available in local testing.` } });
    }
    if (url.pathname === '/__health') return sendJson(req, res, { status: 200, body: { ok: true } });
    if (url.pathname === '/__dev/totp') {
      const code = auth.devTotp(url.searchParams.get('email'));
      return sendJson(req, res, code ? { status: 200, body: code } : { status: 404, body: { error: 'No authenticator for that email' } });
    }
    sendJson(req, res, { status: 404, body: { error: 'Not found' } });
  } catch (err) {
    console.error(err);
    sendJson(req, res, { status: 500, body: { error: err.message } });
  }
});
await new Promise(r => gateway.listen(GATEWAY_PORT, 'localhost', r));

// Points `npm run dev -- --mode awslocal` at this gateway. Gitignored (*.local).
await writeFile(path.join(repo, '.env.awslocal.local'),
  `# Written by aws/db/local-app/start.mjs. Local test stack only.\n${Object.entries(APP_ENV).map(([k, v]) => `${k}=${v}`).join('\n')}\n`);

log(`ready on http://localhost:${GATEWAY_PORT}  (Ctrl+C stops everything and deletes the test database)`);
log('fake logins are listed in aws/db/local-app/demo-users.mjs');
