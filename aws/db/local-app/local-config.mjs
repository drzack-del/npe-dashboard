// Shared settings for the local test stack (start.mjs, the e2e tests). Local-only values.
import { signJwt } from './auth.mjs';

export const PG_PORT = 54330;
export const REST_PORT = 54331;
export const GATEWAY_PORT = 54321;
export const GATEWAY_URL = `http://localhost:${GATEWAY_PORT}`;
export const PG_CONNECTION = { host: 'localhost', port: PG_PORT, user: 'postgres', password: 'local-only', database: 'cadenceiq' };

// Shared by the auth stand-in and PostgREST. Never used anywhere real.
export const JWT_SECRET = 'cadenceiq-local-test-jwt-secret-not-for-production';
// Fixed payload so the key is the same on every run.
export const ANON_KEY = signJwt({ iss: 'cadenceiq-local-auth', role: 'anon', iat: 1790000000 }, JWT_SECRET);

// Everything the app needs to talk to this stack instead of production. Passed straight to
// Vite as environment variables, which take precedence over every .env file.
export const APP_ENV = {
  VITE_SUPABASE_URL: GATEWAY_URL,
  VITE_SUPABASE_ANON_KEY: ANON_KEY,
  VITE_STAGING_MOCK_ONLY: 'false',
};
