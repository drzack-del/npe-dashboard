# greyfinch-sync (AWS Lambda)

Port of the Supabase Edge Function of the same name, behind the API load balancer at
`/functions/v1/greyfinch-sync`. Same request (`{ date?, mode?: "scan" }`) and response shape as
the Supabase version, so the app's `callGreyfinch` works unchanged.

Stricter than the Supabase version (2026-09-30), which only checked an unverified `role` claim:
the access token must be signed by the CadenceIQ Cognito pool (issuer, `token_use=access`, app
client, expiry), and the caller's own `tc_users` row, read through PostgREST with their token so
RLS applies, must be active, in `PRACTICE_ID`, and not location-scoped. CORS is limited to
`ALLOWED_ORIGINS`; errors never echo the Greyfinch key.

Deploy: `aws/infra/05-greyfinch.yaml` creates the function with a placeholder (the code exceeds
CloudFormation's 4 KB inline limit); then this `index.mjs` is zipped on the Mac, uploaded to the
function-code bucket (`aws/infra/05a-code-bucket.yaml`) through a presigned URL, and loaded with
`lambda:UpdateFunctionCode` from that S3 version. (The AWS connector sandbox blocks `zipfile` and
`base64`, so the zip cannot be built there.)
The Greyfinch key/secret live in Secrets Manager (`cadenceiq-<stage>/greyfinch`) and start empty.

Local checks (2026-10-01), with a generated RSA key, signed fake tokens and a stand-in PostgREST:
17 of 17 passed — no/garbage/foreign-key/tampered/expired/wrong-issuer/ID-token/other-client/
unknown-key tokens → 401; not on staff list, other practice, location-scoped owner, inactive
staff, disallowed origin → 403; active practice staff → 503 "not connected yet" (empty key);
OPTIONS → 204; CORS header only for allowed origins.
