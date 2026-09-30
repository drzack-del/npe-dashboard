# CadenceIQ on AWS: infrastructure templates

Each file is a CloudFormation template, deployed in order. Every deploy goes through a
change set: AWS lists exactly what it will create or change, and nothing happens until that
preview is approved. Deleting a stack removes what it created (the audit-log bucket is kept on
purpose, so audit history survives).

Account 488482832567, region us-east-1, covered by the AWS BAA (accepted 2026-09-30).

| Template | Stack | Creates |
|---|---|---|
| `01-foundation.yaml` | `cadenceiq-test-foundation` | Private network (database subnets with no internet route, no NAT gateway), account-wide CloudTrail with signed log files, VPC flow logs, encrypted HTTPS-only audit-log bucket kept 6 years. |

Later phases (database, login, data layer, functions) add their own templates here.
