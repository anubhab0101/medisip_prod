# Render deployment: one Free Web Service

## What this setup does

`render.yaml` defines one Free Render Web Service from this repository. It runs the staff Next.js app, the background job worker and the receipt-only viewer as separate processes in the same container. The gateway listens on Render's `PORT` and routes requests by hostname:

- `APP_URL` and Render's `RENDER_EXTERNAL_HOSTNAME` go only to the staff app.
- `RECEIPT_PUBLIC_URL` goes only to the receipt viewer. `/login`, `/dashboard`, `/api` and any non-receipt path return 404 from that host; they never fall through to the staff app.
- Unrecognized hosts receive 421.

Set `APP_URL` and `AUTH_URL` to the staff origin. Set `RECEIPT_PUBLIC_URL` to a DIFFERENT HTTPS hostname. The Render `onrender.com` address can serve staff; add a separate receipt hostname as a custom domain on the same Render service. That hostname needs a domain and DNS you control. Without it, do not enable receipt sharing; the app fails closed instead of making receipts public on the staff host.

## Free-tier limits

Render Free web instances currently have 512 MB RAM and 0.1 CPU, spin down after 15 minutes without inbound traffic, and have ephemeral local files. A spun-down service can take about a minute to wake. A free web instance cannot have a persistent disk. Therefore:

- The worker runs inside the web service but sleeps/restarts with it; queued SMS, WhatsApp and scheduled jobs are not reliably immediate.
- `DAILY_BACKUP_ENABLED=false`. Do not treat files inside this service as backups. Configure and verify independent off-host backups for TiDB before storing real business data.
- This is for preview/testing, not a dependable live pharmacy service. A successful build does not remove these limits.
- Keep `SMS_SEND_ENABLED=false` and `EVOLUTION_GO_SEND_ENABLED=false` until you deliberately configure and verify provider sending. Jobs can remain queued while the free service is asleep.

These limits are Render platform behavior and may change; check Render's current [Free instance limits](https://render.com/docs/free) and [compute plans](https://render.com/docs/compute-plans) before deploying.

## Deploy from this repository

1. In Render choose **New > Blueprint** and connect this GitHub repository. Render reads the single-service `render.yaml`; confirm the service plan says **Free** before applying it.
2. Enter the requested secrets in the service environment. Do not add `.env.local` to Git or paste secrets into chat.
3. Add your separate receipt hostname under the same web service's **Settings > Custom Domains** and configure its DNS to the target Render shows. Wait for HTTPS/TLS verification before sharing links.
4. Use the actual service `onrender.com` URL for `APP_URL` and the identical origin for `AUTH_URL`, unless you have also attached a staff custom hostname.
5. Keep `RECEIPT_PUBLIC_URL` set to the separate receipt hostname. The gateway validates the staff/receipt host separation during startup.
6. Apply database migrations from a trusted environment using the separate migration credential before staff begins using the new schema. Do not run migrations automatically from the public startup process and do not seed a populated database.
7. Check Render logs for the three process startup messages and the public gateway. Verify both hostnames: staff routes work only on the staff host; only `/r/<token>` works on the receipt host. Then smoke-test a bill and receipt with synthetic data.

## Environment values

Set these in the single Render service. `sync: false` entries in `render.yaml` are entered as secrets/config during Blueprint setup.

```dotenv
NODE_ENV=production
SINGLE_SERVICE_MODE=true
LOCAL_PREVIEW=false
ALLOW_DEMO_SEED=false
DATABASE_URL=mysql://APP_USER:URL_ENCODED_PASSWORD@YOUR_TIDB_HOST:4000/YOUR_APP_DATABASE?sslaccept=strict&connection_limit=5&connect_timeout=15&pool_timeout=15
APP_URL=https://YOUR_RENDER_SERVICE.onrender.com
AUTH_URL=https://YOUR_RENDER_SERVICE.onrender.com
AUTH_SECRET=NEW_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
JOB_SIGNATURE_KEY=DIFFERENT_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
PLATFORM_ADMIN_EMAILS=YOUR_ADMIN_EMAIL
INTEGRATION_ENCRYPTION_KEY=BASE64_32_BYTE_KEY
RECEIPT_PUBLIC_URL=https://receipts.YOUR_DOMAIN
RECEIPT_DATABASE_URL=mysql://RECEIPT_READER:URL_ENCODED_PASSWORD@YOUR_TIDB_HOST:4000/YOUR_APP_DATABASE?sslaccept=strict&connection_limit=2&connect_timeout=15&pool_timeout=15
RECEIPT_TOKEN_SECRET=DIFFERENT_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
SMS_SEND_ENABLED=false
EVOLUTION_GO_SEND_ENABLED=false
DAILY_BACKUP_ENABLED=false
```

`RECEIPT_DATABASE_URL` must be a distinct TiDB login with `SELECT` on `ReceiptShare` only. The receipt process runs under a separate unprivileged Linux UID and receives only receipt settings; it does not receive `DATABASE_URL`, staff auth, provider or migration secrets. The staff/worker processes do not receive the receipt DB URL. The supervisor must hold both DB URLs to start both processes, so this single-container topology has a weaker isolation boundary than separate Render services. Use separate always-on services for higher-assurance production.

The staff/worker runtime database account needs only the application table permissions it uses, not root/admin grants. The receipt DB grant and TLS must be verified independently. The migration account belongs only in a trusted release environment. The local database is a development DB; create/use a separate production TiDB database and never use `sys`.

## Migrations and checks

Use the migration-only environment locally (never add it to the Render service):

```powershell
npm run db:migrate
npm run check:deployment -- .env.production
```

There are seven checked-in migrations. The latest adds private prescription records and their bill link. Back up the database before migration. Do not run `db:seed` on an existing shop database.

A passing config check is not proof of domain routing, provider delivery, database grants, backups or recovery. The free deployment does not satisfy the durable-backup launch gate. Test DNS/TLS and receipt-host isolation from an external browser before issuing any customer link.

## Local single-repo run

For local development, build once, keep app and receipt settings in `.env.local`, then run:

```powershell
npm run build
npm run start:all
```

The local runner starts staff on port 3000, worker, and receipt viewer on port 3002. The Render one-service gateway mode is enabled only by `SINGLE_SERVICE_MODE=true`.
