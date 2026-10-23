# Operations and restore

## Separate services

Run staff, worker and receipt viewer as separate processes. `compose.yaml` and the two Dockerfiles provide deployment scaffolding. Docker is not installed on the current workstation, so container builds are not yet verified. No live deployment has been performed.

Create ignored `.env.production` for staff/worker and `.env.receipts.production` for the viewer. Never put the staff database credential, AUTH_SECRET or RECEIPT_TOKEN_SECRET into the receipt service. Use separate HTTPS hostnames; preserve Host headers and never route a receipt-host miss to staff. See RECEIPT_ISOLATION.md. Application cookies must remain host-only.

Before deployment, run `npm run check:deployment -- .env.production`. It checks origin separation, strict database TLS configuration, root-account usage, secret presence/length, backup and SMS settings without printing their values. It does not connect to providers or prove grants, secret randomness, TLS certificates, durable/off-host storage or delivery. Verify those separately. Sitemap and robots are generated from APP_URL at runtime, so the same build can be configured for the real hostname without carrying a build-time localhost sitemap.

Run `npm run db:migrate` once with a migration account before starting the new version. Use a separate application database account with only required table permissions in production. Keep the supplied administrative credential out of deployed app containers. Generate fresh AUTH_SECRET and RECEIPT_TOKEN_SECRET values; development credentials are not production credentials.

Build includes `npm run ocr:prepare`, which packages the worker, WASM and English model locally. No prescription-image upload or runtime OCR CDN request is used.

Start staff with `npm run start`, worker with `npm run worker`, and receipts with `npm run receipts` (or compose). Monitor process health, failed/unknown jobs, database capacity and upcoming expiry. SMS remains disabled until SMSGate setup and a real authorized delivery test are complete. Do not blindly retry an UNKNOWN outcome.

## Encrypted snapshot backup

For a small deployment, `node scripts/init-backup-key.mjs` creates BACKUP_KEY in the ignored local environment. Keep an independent protected copy of that key; losing it makes backups unrecoverable. The backup contains private business records and password hashes and must be access-controlled even though encrypted. Rotate storage access independently from the key.

`node scripts/backup.mjs backup .local/backups/<unique-name>.msbackup`

This takes one repeatable-read logical snapshot of every application table, then encrypts it with AES-256-GCM and a new nonce. Files are created exclusively, so an existing backup is never overwritten. It stops above 100,000 rows per table or a 100 MB unencrypted snapshot; use TiDB managed backups for larger deployments. Protect backups off the application host and establish retention appropriate to the business. Do not use an untested local-only backup as the sole recovery plan.

## Restore rehearsal

Provision a separate EMPTY database named `medishop_restore_<suffix>`. Set RESTORE_DATABASE_URL to that database. Apply the same checked-in migrations to the empty target first. Preserve the exact application/schema version associated with each backup.

`node scripts/backup.mjs restore .local/backups/<name>.msbackup`

Restore refuses populated targets and schema mismatches, decrypts with authentication, restores all application tables in one transaction, and compares every table against the snapshot using SHA-256 after normalization. The source database is not modified. Prisma migration history is recreated by migrations, not copied from the source. Database accounts/grants, environment secrets, DNS and SMS provider configuration are separate recovery items.

For the isolated development database only, `node scripts/restore-rehearsal.mjs <backup-file>` creates a fresh rehearsal database, migrates it and restores the supplied encrypted snapshot. It uses the separate MIGRATION_DATABASE_URL from the ignored `.env.migration.local`; the restricted runtime account cannot create databases. It checks the source database matches before provisioning and retains the new database for inspection; it never drops a database.

The worker schedules stock scans at 07:00 and encrypted backups at 02:00 Asia/Kolkata, once per date. It catches up today's run after startup, without replaying missed historical days. Stock summaries appear on the owner's dashboard. Set DAILY_BACKUP_ENABLED=true, BACKUP_DIRECTORY to durable storage and BACKUP_KEY before enabling backups. The Compose worker mounts a persistent `backup-data` volume at `/app/backups`; container operation remains unverified locally.

`npm run worker -- --maintenance-only` runs the scheduler without sending or polling customer messages. Add `--once` for one due-work pass. Database leases prevent concurrent workers from claiming the same daily run; expired leases recover after ten minutes. Failed tasks retry up to three times. Check Job records for DAILY_STOCK_SCAN / DAILY_BACKUP and worker error logs when troubleshooting. Backup filenames include run and attempt identifiers, so retries never overwrite existing encrypted files.

Local daily backups are enabled in the ignored environment. Scheduling requires the maintenance process and computer to remain running; Windows login/startup registration is not configured. Configure off-host copies, retention, monitoring and deployment restart policy before launch. No automatic backup deletion is implemented. Rehearse restoring regularly and record recovery time.


Local hardening completed: a restricted application account is configured; `.env.migration.local` retains the separate administrative migration URL. `scripts/prisma.mjs migrate ...` loads that URL only for migration commands. The production preview uses loopback HTTP with LOCAL_PREVIEW=true for receipt testing; deployed services must use HTTPS and LOCAL_PREVIEW=false.
