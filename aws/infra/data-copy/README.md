# Moving the practice data between Supabase and AWS

Every script prints only row counts and fingerprints; patient rows never pass through Claude.
A fingerprint is md5 of the sorted per-row `md5(row(<columns>)::text)`, computed with
`TimeZone = 'UTC'`, with `tc_users.auth_user_id` treated as NULL (logins are not copied).

| Script | Direction | Network | Rehearsed |
|---|---|---|---|
| `export-over-https.mjs` | Supabase -> files on the Mac | HTTPS only (works behind firewalls) | fake data, 16/16; used for the real Stage 3 copy |
| `export-from-supabase.mjs` | Supabase -> files on the Mac | direct Postgres (port 5432) | fake data; blocked on restricted networks |
| `copy-back-to-supabase.mjs` | files from AWS -> Supabase (switching back) | HTTPS only | fake data, 18/18 (edits, adds, deletes, new team member, awkward text, login links untouched, 3 safety stops) |

## Supabase -> AWS (Stage 3, and the final copy at switch-over)
1. Mac: `node aws/infra/data-copy/export-over-https.mjs` (secret key, hidden) -> `~/CadenceIQ-data-copy/`.
2. Upload each CSV to `s3://cadenceiq-test-data-import-488482832567/<folder>/` through presigned PUT URLs.
3. Attach the import role (`ImportRoleArn` on the database stack), wait ~1 minute.
4. One Data API transaction as `cadenceiq_owner` (grant it aws_s3/aws_commons first, revoke after),
   `SET LOCAL TimeZone='UTC'`, TRUNCATE the 7 tables (switch-over only), `aws_s3.table_import_from_s3`
   each file into its column list, compare every fingerprint with the manifest, `setval` the two id
   sequences, COMMIT only if all match.
5. Delete the files (drop box and Mac); detach the import role.

## AWS -> Supabase (switching back)
Needs, beforehand, an export permission on the drop box (role with `s3:PutObject`, feature `s3Export`
on the database, gateway-endpoint policy allowing PutObject) - part of switch-over prep P4/P8.
1. One Data API transaction with `SET LOCAL TimeZone='UTC'`, for each table:
   `select * from aws_s3.query_export_to_s3('select <columns, with NULL::uuid as auth_user_id> from public.<table> order by <key>', aws_commons.create_s3_uri('<bucket>','copy-back/<table>.csv','us-east-1'), options := 'format csv, header true')`
   and the table's fingerprint; write `manifest.json` = `{ "tables": { "<table>": { "rows": n, "fingerprint": "..." } } }`.
2. Mac: download the 7 CSVs + manifest into `~/CadenceIQ-copy-back/` through presigned GET URLs.
3. Mac (Supabase still write-locked): `node aws/infra/data-copy/copy-back-to-supabase.mjs`; it shows the
   plan per table and writes only after `YES`; more than 25 deletions in a table need `--allow-deletes`.
4. After "Supabase matches AWS": run `aws/infra/sql/supabase-write-unlock.sql`, delete the files.
