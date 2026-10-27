# MediShop

Simple pharmacy management, currently under active implementation. The approved scope is in [docs/APPROVED_PLAN.md](docs/APPROVED_PLAN.md); historical feature evidence is in [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md), and current release gates are in [docs/LAUNCH_READINESS.md](docs/LAUNCH_READINESS.md).

## Run

Requires Node.js 22+ and an isolated TiDB Cloud database.

```powershell
npm ci
npm run db:generate
npm run ocr:prepare
npm run dev
```

Open http://127.0.0.1:3000 and sign in. The current local database has one clean shop; sample records were removed after an encrypted backup. Complete Settings with your real shop details before billing. Generated development login details are in the ignored `.local/LOGIN.txt`; database credentials remain in `.env.local`. Never commit either file.

New owners can use **Settings → Setup guide**: enter shop details, add the first medicine, add a supplier and receive opening stock, then open Billing. Each step uses real saved records and resumes automatically after a reload. Bulk catalogue import is also available; return to the guide afterward to add stock.

For the faster production preview, use `npm run build` once, then `npm run start`; stop the existing preview before building again. Saved bills offer A4/PDF and compact 80mm receipt layouts. For thermal printing, select 80mm paper in the printer dialog and disable browser headers/footers. PDF currently uses the browser's Save as PDF option; physical printer output has not been tested.

To start all three local services together after building, put the staff/worker settings and `RECEIPT_DATABASE_URL` plus `RECEIPT_PUBLIC_URL` in one `.env.local`, then run `npm run start:all`. `RECEIPT_DATABASE_URL` must use the receipt-only database account; the receipt process receives only its receipt settings. It starts the staff app on port 3000, worker, and receipt viewer on port 3002; `Ctrl+C` stops all three. The worker follows its configured send switches and may deliver queued messages when enabled.

Messages → Message templates lets you save reusable wording with `{name}`, `{shop}`, `{date}`, `{time}`, `{doctor}` and `{amount}`. Select a saved template on Messages, choose the customer, fill the remaining values and review the message. Saving a template never sends it; WhatsApp is queued only when the optional Evolution Go integration is enabled, otherwise it opens for staff to send manually. Email remains manual. Disabling a template removes it from new messages without changing already prepared messages.

For a personal test, open a saved template and choose **Test with my contact**. Add your own customer record with consent first if needed, select it, enter your own number and confirm. Email tests must use your staff sign-in email. Tests are labelled [TEST]; SMS tests expire after 15 minutes and still respect promotional sending hours. WhatsApp/email test links require you to send manually. Ownership is declared by the staff member; this flow does not verify phone ownership with an OTP.

Use the history channel/status filters on Messages to find failures. Eligible failed SMS messages have a Retry SMS control with confirmation; retries reuse the original provider message ID. Unknown or already accepted messages require checking SMSGate and cannot be resent using this control. Customer consent and announcement expiry are checked again. You have confirmed that the live SMS test already succeeded; keep production sending disabled until the shop owner is ready to notify real customers.

## Fresh setup

Copy `.env.example` to `.env.local`. Set DATABASE_URL to a dedicated application database, not `sys`, and generate a strong AUTH_SECRET. Use TLS and configure TiDB pessimistic transactions. Set AUTH_URL and APP_URL to the exact application origin.

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

Seeding requires SEED_OWNER_EMAIL and a 12–72 character SEED_OWNER_PASSWORD, and refuses a database with existing users. ALLOW_DEMO_SEED=true also requires SEED_SAMPLE_PASSWORD and creates a practice-only sample shop. The sample catalogue is fictional. Existing business records are never reset by the seed.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration
npx playwright install chromium
npm run test:e2e -- --workers=1
npm run build
```

Integration tests require a database name beginning with medishop_dev. They create isolated test branches, retain financial history and deactivate those branches afterward. Browser tests create labeled practice records and require the seeded owner credentials locally. Do not run these tests against a real shop database. Run a single browser suite at a time; avoid editing app files while a browser flow is running.

## Messages

SMS is disabled by default. Configure SMSGATE_USERNAME, SMSGATE_PASSWORD and optionally SMSGATE_DEVICE_ID locally. Enable SMS_SEND_ENABLED only when the intended real recipients and message content are authorized. Practice branches never send messages.

```powershell
npm run worker
```

The separate worker processes durable TiDB jobs and polls SMS delivery status. `npm run worker -- --once` processes at most one job and exits. Unknown provider outcomes are retained for review rather than blindly resent. See `docs/EVOLUTION_GO_SETUP.md` before enabling automated WhatsApp; Evolution Go is off by default and WhatsApp receipt delivery uses only the isolated receipt-host link.

Open **Messages > Broadcast** to announce a doctor visit or write a custom update. Choose all consented customers or specific customers, then review the exact message and recipient list. Confirmation queues SMS and, when enabled, WhatsApp; otherwise WhatsApp/email must be opened and sent manually. Announcements respect 8 AM-9 PM India time and doctor announcements expire when the visit ends. Practice mode supports previews only.

## Customer receipts and offline counter

Run `npm run receipts` in a separate terminal before receipt browser tests. Receipt links use the isolated viewer on port 3002 locally; staff stays on port 3000. See [receipt isolation](docs/RECEIPT_ISOLATION.md) for production hostname and restricted database-account requirements.

Saved bills and Reports have **Download PDF** for a direct A4 download. Long bills repeat table headings and keep medicine/batch rows together; saved shop details, totals and recorded returns are retained. Fonts for English, Hindi and Odia are embedded locally. Invoice PDFs have no staff-site links, customer contact fields or prescription references. Staff sign-in, current branch and role checks protect the download endpoint; invoice downloads are disabled in practice mode. The existing print button still supports 80mm paper.

Open **New bill > Offline counter**, reserve stock while online, and open the counter before disconnecting. It stores provisional bills on the device; reconnect and sign in as the original staff member to sync, then close the counter to release unsold stock. Do not clear browser data before sync. Current offline mode supports cash walk-in sales of reserved non-prescription stock. The service worker caches only its own counter shell, never staff pages or customer accounts.

See [operations and backup/restore](docs/OPERATIONS.md). A real encrypted restore rehearsal passed; container deployment and live SMS remain unverified.

## Important limits

The core workflows and approved extras are implemented, with isolated test evidence recorded in the implementation log. Remaining release gates include pushing a Git remote, Render service setup, production database grants and migrations, container/runtime validation, off-host backup recovery and a supervised real-shop rehearsal. The latest launch checklist separates current evidence from these external gates; the project is not yet cleared for live customer use.

## Add real medicines

1. Settings: enter shop name, address, phone and licence details.
2. Medicines: use **Add medicine**, or **Import CSV / Excel** and download the column template. Import creates the catalogue only.
3. Purchases: add the supplier, then record batch number, expiry month, quantity, cost and MRP. This adds billable stock.
4. New bill: search the medicine, choose quantity/payment, then save.

The current local preview runs an optimized production build with `next start`. Public sitemap, robots and canonical metadata use the runtime APP_URL, so a container does not retain a local sitemap address from its build. Set the real HTTPS APP_URL and matching AUTH_URL before starting deployed services. LOCAL_PREVIEW=true is for loopback receipt testing only and must be false on deployed services. Run `npm run check:deployment -- .env.production` to check configuration without displaying credentials. Passing this check does not prove DNS/TLS, provider delivery, database grants or backup recovery; those require real verification. Full completion and external launch gates remain tracked in IMPLEMENTATION_STATUS.md.
