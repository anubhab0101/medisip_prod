# Deployment environment and launch decision

Current decision: staging/personal testing is suitable; full live-customer launch is not yet verified. The production build passes. Live SMS was confirmed by the user. Container execution, real HTTPS routing/cookie isolation, durable off-host backups and final broader-flow verification remain launch gates. Translation coverage and some offline modes are incomplete; see IMPLEMENTATION_STATUS.md and I18N_STATUS.md.

## Render setup (user-selected host)

The current workspace has no Git repository/remote. First push the project to a private GitHub/GitLab/Bitbucket repository, keeping .env*, .local, node_modules and .next out of Git. Do not upload the original credential-bearing screenshot or connection string. No Render service has been created by the agent.

Create these services from the SAME repository in the Render Dashboard. Choose Docker runtime and Singapore region, close to the existing TiDB endpoint:

| Service | Render type | Dockerfile path | Docker Command override | Environment |
|---|---|---|---|---|
| medishop-staff | Web Service | ./Dockerfile | Leave blank (image starts port 3000 on 0.0.0.0) | Staff/worker block below |
| medishop-worker | Background Worker | ./Dockerfile | node --conditions=react-server --import tsx scripts/worker.ts | Same staff/worker block |
| medishop-receipts | Web Service | ./Dockerfile.receipts | Leave blank (image starts receipt viewer on port 3002) | Receipt-only block below |

Use always-on paid services for a real shop and a persistent worker disk; review Render's displayed charges before creating resources. A free web-only setup does not provide this architecture. Select a disk for the worker mounted at /app/backups, initially 1 GB, matching BACKUP_DIRECTORY. Confirm the worker can write there after deployment; disk setup and image execution are not yet tested here. Disk storage needs off-host backup copies and retention too.

Render handles Docker build commands automatically; do not put npm start in Docker Command for the staff service because the package's local-preview start binds to loopback. Use the image default. Set staff health-check path to /login. Leave receipt HTTP health-check path unset: / intentionally returns 404; Render can use its default port check. Do not change receipt / into a staff-app redirect to make a health check pass.

Once Render assigns public HTTPS URLs (or after connecting custom domains), set APP_URL and AUTH_URL to the EXACT staff origin, and RECEIPT_PUBLIC_URL in all services to the EXACT receipt origin. No trailing paths. Do not put .internal/private hostnames here. Update/redeploy the services after changing origins. Keep SMS_SEND_ENABLED=false for staging; change only the worker to true when real customer messaging should run.

Apply database migrations using the separate migration credential from a trusted local/release environment before starting this version. Do not store MIGRATION_DATABASE_URL in the staff or receipt runtime merely to run a migration. Existing populated database: do not run seed. Fresh empty database: seed the owner once as described below.

Check Render logs for healthy staff/worker/receipt startup, daily-job failures and successful backup writes. Test staff login, an isolated receipt URL, guest denial on staff routes, medicine-to-bill flow and recovery in staging before live-customer use. Configure TiDB network access for the services' actual outbound access as required by your TiDB project.

Official references: [Render Docker](https://render.com/docs/docker), [persistent disks](https://render.com/docs/disks), [Blueprint/service fields](https://render.com/docs/blueprint-spec).

## Three services

1. Staff web application: Dockerfile, port 3000, public HTTPS hostname such as app.yourdomain.com.
2. Persistent background worker: same Dockerfile, command below, no public hostname. Needs a persistent backup volume and SMSGate access.
3. Receipt-only web application: Dockerfile.receipts, port 3002, DIFFERENT public HTTPS hostname such as receipts.yourdomain.com. Supply only its restricted environment.

Do not deploy only the web application: queued messages and daily jobs require the worker. Receipt routes must never fall through to the staff service. Use host-only cookies and preserve the original Host header through the proxy. Domains below are placeholders, not purchased/configured domains.

## Staff and worker environment

The existing compose.yaml shares .env.production between staff and worker. Enter values in the host's secret/environment settings; do not commit them.

```dotenv
NODE_ENV=production
DATABASE_URL=mysql://APP_USER:URL_ENCODED_PASSWORD@YOUR_TIDB_HOST:4000/YOUR_APP_DATABASE?sslaccept=strict&connection_limit=5&connect_timeout=15&pool_timeout=15
APP_URL=https://app.yourdomain.com
AUTH_URL=https://app.yourdomain.com
AUTH_SECRET=REPLACE_WITH_NEW_RANDOM_SECRET
LOCAL_PREVIEW=false
ALLOW_DEMO_SEED=false

RECEIPT_PUBLIC_URL=https://receipts.yourdomain.com
RECEIPT_TOKEN_SECRET=REPLACE_WITH_DIFFERENT_RANDOM_SECRET

SMSGATE_URL=https://api.sms-gate.app/3rdparty/v1
SMSGATE_USERNAME=YOUR_SMSGATE_USERNAME
SMSGATE_PASSWORD=YOUR_SMSGATE_PASSWORD
SMSGATE_DEVICE_ID=YOUR_ANDROID_DEVICE_ID
SMS_SEND_ENABLED=false

DAILY_BACKUP_ENABLED=true
BACKUP_DIRECTORY=/app/backups
BACKUP_KEY=REPLACE_WITH_32_RANDOM_BYTES_IN_BASE64
```

Set SMS_SEND_ENABLED=true in the worker only when that environment should actually send queued customer messages. The user has reported a successful SMS test, but staging should stay false by default. Keep the Android gateway online with its SMS permissions/connectivity. No API keys are needed for the current manual WhatsApp/email redirects. There is no Redis requirement.

Use a dedicated application database, never sys. Its runtime user needs SELECT, INSERT, UPDATE and DELETE on the application tables, not administrative privileges. Use the SAME database for staff and worker. The receipt reader must access ReceiptShare in that same database with SELECT only. The existing local application's database name is medishop_dev_20261008; changing the URL to a new name does not create a database or grant access. A separate staging database is preferable to sharing real business data.

If using a persistent disk mounted elsewhere, replace BACKUP_DIRECTORY with that path. Ephemeral container storage is insufficient. Copy encrypted backups off-host and keep the recovery key separately. Preserve the BACKUP_KEY for any backups you need to restore. Preserve RECEIPT_TOKEN_SECRET when migrating existing receipt links; changing it can invalidate issuance retries. Rotate AUTH_SECRET intentionally: it signs users out.

## Receipt service only

```dotenv
NODE_ENV=production
RECEIPT_DATABASE_URL=mysql://RECEIPT_READER:URL_ENCODED_PASSWORD@YOUR_TIDB_HOST:4000/YOUR_APP_DATABASE?sslaccept=strict&connection_limit=2&connect_timeout=15&pool_timeout=15
RECEIPT_PUBLIC_URL=https://receipts.yourdomain.com
RECEIPT_BIND=0.0.0.0
RECEIPT_PORT=3002
```

Do not give this service DATABASE_URL, AUTH_SECRET, RECEIPT_TOKEN_SECRET, SMS credentials, migration credentials or backup keys. Configure its platform ingress to port 3002 (or set RECEIPT_PORT to the required port). The separate receipt hostname must serve only receipt requests; /login, /dashboard and /api must not route to the staff app.

## One-time migration/setup secrets

```dotenv
MIGRATION_DATABASE_URL=mysql://MIGRATION_USER:URL_ENCODED_PASSWORD@YOUR_TIDB_HOST:4000/YOUR_APP_DATABASE?sslaccept=strict
```

Supply this only to a trusted release/migration step, not the running web/worker/receipt services. Run npm run db:migrate before starting the new version. There are currently six checked-in migrations.

On an EMPTY new database only, temporarily set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (12-72 characters), keep ALLOW_DEMO_SEED=false, and run npm run db:seed once. Remove those seed secrets afterward. Never reseed the existing populated database; its owner account already exists. SEED_SAMPLE_PASSWORD and RESTORE_DATABASE_URL are not normal production runtime variables.

Generate three independent secrets locally, one invocation per value:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Use separate outputs for AUTH_SECRET, RECEIPT_TOKEN_SECRET and BACKUP_KEY. Do not paste generated secrets into chat. Existing deployed/backup secrets may need to be preserved as explained above.

## Commands

Dockerfiles handle dependency installation, Prisma generation and OCR packaging. Compose starts the correct processes. For a non-Docker Linux host using Node 24:

```sh
npm ci
npm run db:generate
npm run ocr:prepare
npm run db:migrate
npm run build
```

Staff web start (use the platform's assigned port in place of 3000 when necessary):

```sh
node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000
```

Worker start:

```sh
node --conditions=react-server --import tsx scripts/worker.ts
```

Receipt start for a source checkout (the dedicated Docker image already starts receipt-server.cjs):

```sh
node --import tsx scripts/receipt-server.ts
```

Configuration check:

```sh
npm run check:deployment -- .env.production
```

It reports disabled SMS in staging; this is intentional until real sending is enabled. Passing is configuration evidence only, not a substitute for container, HTTPS, access-control, receipt-isolation, messaging and recovery tests. Never run sample-writing suites against the real shop. No public deployment has been made by the agent.
