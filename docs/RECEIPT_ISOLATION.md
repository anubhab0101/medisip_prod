# Customer receipt isolation

The receipt viewer is a separate Node process and a minimal HTTP handler, not a public route in the staff Next.js app. It serves only `GET`/`HEAD /r/<unguessable-token>`; root, login, API and staff paths return 404. The static receipt contains no JavaScript, forms, navigation, external resources, cookies or staff links.

The receipt process uses a separate TiDB login with `SELECT` on `ReceiptShare` only. In the Render one-service preview, the runner gives it only `RECEIPT_DATABASE_URL`, `RECEIPT_PUBLIC_URL` and its port settings, and runs it under a different unprivileged Linux UID. Staff and worker processes do not receive the receipt DB URL. The root supervisor necessarily holds both DB URLs to start the processes, so this shares a container boundary; separate Render services provide stronger isolation and are recommended for production.

Snapshot reads are side-effect free, so messaging link-preview bots do not consume a receipt. Snapshots contain shop and invoice lines/totals, not customer contact details, staff IDs, prescription references or credentials. Tokens expire after 24 hours and can be revoked from the bill. Anyone with a valid link can read that receipt until expiry or revocation, so share it only with the intended customer.

## Local run

Run `npm run build`, then `npm run start:all`. Staff listens on port 3000 and the receipt viewer on 3002. Put the application settings and the receipt settings in `.env.local`; the receipt child reads only the receipt keys. A standalone viewer can still load `.env.receipts.local` when started separately.

## Render hostname routing

The one-service gateway routes `APP_URL` (and Render's service hostname) to Next.js. It routes only the hostname in `RECEIPT_PUBLIC_URL` to the receipt process. It never falls back between them. The receipt hostname must be a separate custom domain attached to that same Render service, with HTTPS verified. If the hostname is not configured, startup fails; no receipt link should use the staff hostname. Requests to `/login`, `/dashboard`, `/api` or any other path on the receipt hostname return 404.

Receipt process does not receive `DATABASE_URL`, `AUTH_SECRET`, `RECEIPT_TOKEN_SECRET`, SMS credentials, migration credentials or backup keys. Do not add those to its environment allowlist. Its database account must have only `SELECT` on `ReceiptShare`.

This protects the receipt hostname from serving staff pages; it cannot stop a customer from independently discovering and visiting a public staff hostname. Staff routes must still enforce authentication and authorization normally.
