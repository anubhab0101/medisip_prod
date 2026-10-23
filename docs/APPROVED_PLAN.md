# Approved implementation — 2026-10-08

The user approved the full core product and eight TASKS Phase 8 extras. This document supersedes conflicting choices in the original archive.

- UI: simple, compact, minimalist; clear actions, short labels, accessible controls. Avoid marketing panels in the working app.
- Database: TiDB Cloud / Prisma MySQL; jobs in TiDB with leases. No PostgreSQL or Redis dependency.
- Messaging: SMSGate Android public cloud; WhatsApp and email are manual redirects until future API integration.
- Offline: device-reserved stock; provisional receipts; final invoice allocated on synchronization.
- OCR: printed text locally, mandatory staff confirmation.
- Delivery: locally verified and deploy-ready; no live deployment in this goal.
- Do not claim cloud flows verified without actual credentials/tests. Use isolated development data.
- All financial writes use transactional services and audit trails; amounts are integer paise.
- Expiry month is valid through its last calendar day in Asia/Kolkata.

## Milestones
- [ ] Database, auth, branch permissions and setup
- [ ] Medicines, batches, suppliers, purchases and imports
- [ ] Billing, customers, payments, print and returns
- [ ] Doctors, appointments, SMS and redirect messaging
- [ ] Reports, translations, onboarding and isolated practice mode
- [ ] Substitutes, OCR, refills, purchase orders, offline, loyalty, branches, delivery
- [ ] Integration/E2E verification, deployment and restore rehearsal

Goal remains active until complete or an external blocker is demonstrated. No credentials are recorded here.
