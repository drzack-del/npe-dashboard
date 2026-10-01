# CadenceIQ on AWS: infrastructure templates

Each file is a CloudFormation template, deployed in order. Every deploy goes through a
change set: AWS lists exactly what it will create or change, and nothing happens until that
preview is approved. Deleting a stack removes what it created (the audit-log bucket is kept on
purpose, so audit history survives).

Account 488482832567, region us-east-1, covered by the AWS BAA (accepted 2026-09-30).

| Template | Stack | Creates |
|---|---|---|
| `01-foundation.yaml` | `cadenceiq-test-foundation` | Private network (database subnets with no internet route, no NAT gateway), account-wide CloudTrail with signed log files, VPC flow logs, encrypted HTTPS-only audit-log bucket kept 6 years. |
| `02-database.yaml` | `cadenceiq-test-database` | Aurora PostgreSQL 17.6 serverless in the private subnets: encrypted, TLS required, connections logged, 7-day point-in-time restore, pauses when idle, deletion protection, AWS-managed admin password in Secrets Manager, Data API for migrations. No inbound network access. |
| `03-login.yaml` | `cadenceiq-test-login` | Cognito user pool (Essentials): email sign-in, password + authenticator app required for everyone, invite-only, 12+ character passwords, deletion protection; web app client (no secret, SRP); a small function adding `role`, `aal`, `email` claims to access tokens for the database's security rules. |
| `04a-certificate.yaml` | `cadenceiq-test-certificate` | Free HTTPS certificate for `api-test.trycadenceiq.com`. DNS is at Porkbun, so the validation CNAME AWS shows is added there by hand; the stack waits until AWS sees it. |
| `04b-data-layer.yaml` | `cadenceiq-test-data-layer` | HTTPS-only load balancer (TLS 1.2/1.3) → PostgREST 14.1 behind an nginx that maps Supabase's `/rest/v1/` paths; tokens verified against the Cognito pool's public keys (`JwksJson` parameter); generated database password in Secrets Manager; the database's single inbound rule (data layer only). Starts with 0 running copies until the `authenticator` password is set in the database. |
| `05-greyfinch.yaml` | `cadenceiq-test-greyfinch` | `greyfinch-sync` Lambda behind the load balancer at `/functions/v1/greyfinch-sync` (code in `aws/functions/greyfinch-sync`, uploaded after creation); Greyfinch key in Secrets Manager, empty in Stage 2. `set-user-password` is not ported: it was already retired on Supabase (returns 410). |
| `05a-code-bucket.yaml` | `cadenceiq-test-function-code` | Private, encrypted, HTTPS-only, versioned bucket for Lambda code zips too large to put inline (old versions kept 6 years as a record of what code ran). Holds no patient data. Upload: zip on the Mac, PUT through a 15-minute presigned URL from the AWS connector, then `lambda:UpdateFunctionCode` with `S3Bucket`/`S3Key`/`S3ObjectVersion` and compare `CodeSha256` with the local zip. |



After `02-database.yaml`: bootstrap and load the schema as described in `sql/00_aws_bootstrap.sql`, then run the checks in `checks/README.md`.
