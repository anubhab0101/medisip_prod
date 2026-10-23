# MediShop launch readiness — 2026-10-23

## Current result

The local release candidate passes its current unit, lint, TypeScript and production-build checks. It is not deployed and is not yet cleared for live customer use. The Render Blueprint is prepared, but this workspace has no Git repository or remote, so Render cannot read or deploy it yet.

## Already implemented

- Pharmacy setup, staff roles, medicine catalogue/import, suppliers, batches, purchasing and stock movements.
- Billing, split payments, returns, credit, invoices, PDF/CSV reports and 80 mm print layout.
- Doctors, appointments, customer announcements, consent checks, manual WhatsApp/email preparation and SMSGate queue/worker.
- Receipt-only service on its own host, scoped read-only database access, revocable receipt tokens and no staff-site navigation.
- Reserved-stock offline billing, practice mode, public booking, loyalty, transfers, delivery tracking, local OCR and English/Hindi/Odia UI.
- Scheduled stock/backup jobs, encrypted backups, restore tooling and search/canonical/robots/sitemap setup.

The implementation log records earlier isolated TiDB/browser checks and a successful restore rehearsal. Those checks predate this release checkpoint and must be repeated against a fresh isolated staging database before launch. The user has reported that a live SMS test already succeeded; no second test is required just to repeat it.

## Verified in this checkpoint

- `npm test`: 63 tests passed across 13 files.
- `npm run lint` and `npm run typecheck`: passed.
- Optimized production build: passed before and after updating Next.js to 15.5.28.
- Runtime dependency audit: zero vulnerabilities after the Next.js security update.
- `render.yaml`: parsed and checked for the three services and worker backup disk.
- Docker image build, real Render operation, custom-domain/TLS checks, production database grants, off-host restore, and full live browser acceptance are not verified.

## Launch blockers

1. Create/push this project to a private GitHub, GitLab or Bitbucket repository. The current folder has no `.git` directory or remote.
2. Configure Render's staff, worker and receipt services from `render.yaml`; attach the two separate public hostnames and set environment values in Render.
3. Create a dedicated application database and limited runtime account in TiDB; use a separate read-only receipt account and migration account. Do not use the `sys` database or an administrative/root account for the app.
4. Rotate the TiDB administrative password shared earlier in chat before using that account again. Keep all new credentials in Render's secret settings, never in this file or Git.
5. Apply migrations to a fresh staging database and confirm production environment values, strict TLS, custom domains and receipt-host isolation.
6. Re-run isolated billing, returns, broadcast consent, booking, offline sync, roles, receipt revocation and restore checks. Test actual thermal printer output with the shop's printer.
7. Configure off-host encrypted backup copies, retention and monitoring. Keep SMS disabled until staging is accepted and the owner explicitly approves real-customer sending.
8. Run a supervised shop pilot and reconcile bills, stock and payments before a general launch.

## Eight-day target: 2026-10-24 to 2026-10-31

| Date | Target |
|---|---|
| Oct 24 | Push the private Git repo; rotate the exposed admin credential; provision staging TiDB users/database. |
| Oct 25 | Create the three Render services from the Blueprint; add app and receipt domains and HTTPS. |
| Oct 26 | Apply migrations; configure secrets and least-privilege grants; verify service startup and health. |
| Oct 27 | Complete staging setup, medicine import, purchase, bill, payment, return and report workflows. |
| Oct 28 | Verify staff roles, booking, broadcast consent/quiet hours and receipt isolation on desktop/mobile. |
| Oct 29 | Rehearse offline sync, backup restore to a separate database, worker recovery and off-host backup copy. |
| Oct 30 | Test the actual printer, train staff and run supervised transactions in the real shop setup. |
| Oct 31 | Review evidence and unresolved defects; start a controlled launch only if every gate passes. |

The date is a target, not a guarantee: it depends on repository access, domain control, TiDB permissions and the owner's staging/live-business availability. Do not label the system production-ready solely because the build passes.
