# Customer receipt isolation

Shared receipts run in a separate Node process, not a public route in the staff Next.js app. The only valid path is `/r/<unguessable-token>`; root, login, API and staff paths return 404 without redirecting. The viewer serves escaped static HTML with no JavaScript, forms, navigation, external resources, cookies or staff links. It has no staff authentication code.

The viewer loads only `.env.receipts.local`. Its TiDB account has SELECT on `ReceiptShare` only; it cannot read staff accounts or pharmacy operational tables. Snapshots contain the shop and invoice lines/totals, not customer contact details, staff IDs, prescription references or account credentials. Tokens are HMAC-derived, stored as SHA-256 hashes, expire after 30 days, and can be revoked from the bill. Returns revoke prior links in the same transaction. Anyone possessing a valid link can read that one receipt, so share it only with the intended customer.

## Local verification

Run `npm run dev` for staff and `npm run receipts` for the isolated viewer. Local preview uses ports 3000 and 3002. `node scripts/verify-receipt-reader.mjs` confirms snapshot reads work and staff-table reads are denied. Receipt tests check route isolation, hostile HTML escaping, cookies, security headers, invalid tokens and hostname rules. The browser flow tests an unauthenticated receipt and revocation after a return.

## Deployment boundary

Use a dedicated HTTPS receipt hostname, ideally a separate registrable domain. Configure `RECEIPT_PUBLIC_URL` on both processes. Production link creation rejects the staff hostname and non-HTTPS URLs. Do not route any receipt-domain paths to Next.js, and do not configure a fallback redirect to the staff site. Preserve the receipt Host header at the reverse proxy. Give the viewer only its read-only receipt database URL; never give it the staff database login, AUTH_SECRET or receipt token-generation secret. Do not enable access logs containing full token paths. Do not put staff cookies on a shared parent domain. Set the viewer's `RECEIPT_BIND=0.0.0.0` only behind the intended HTTPS ingress; allow no public database access beyond the normal TiDB network policy.

No DNS, HTTPS ingress or public deployment has been configured yet. A receipt link is not a staff credential; customers cannot access staff data without separately obtaining valid staff authorization. This does not make the existence of an independently public staff login hostname undiscoverable.
