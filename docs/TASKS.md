# TASKS — MediShop

Work top to bottom. One task at a time. Tick `[x]` when done and update MEMORY.md.

## Phase 0 — Setup
- [ ] T0.1 Create Next.js 15 + TS strict + Tailwind + shadcn/ui project; ESLint, Prettier, Vitest, Playwright.
- [ ] T0.2 Docker Compose for Postgres (+ Redis). `.env.example`.
- [ ] T0.3 Prisma schema from ARCHITECTURE.md §3; first migration; `seed.ts` with 1 shop, 3 users (owner/pharmacist/cashier), 30 sample medicines with batches, 2 doctors.
- [ ] T0.4 `lib/money.ts`, `lib/gst.ts`, `lib/fefo.ts` + unit tests.
**Accept:** `npm run dev` runs; `npm test` green; seed works.

## Phase 1 — Auth & Layout
- [ ] T1.1 Login (Auth.js credentials), role in session, `permissions.ts`.
- [ ] T1.2 App shell: sidebar, top bar, global search, responsive, mobile bottom nav.
- [ ] T1.3 Settings: shop details (GSTIN, licence no., invoice prefix), users CRUD (Owner only).
**Accept:** each role sees only allowed menu items; direct URL access is blocked.

## Phase 2 — Medicines & Stock
- [ ] T2.1 Medicine list (search, filter, pagination) + add/edit drawer.
- [ ] T2.2 Batch management (add batch, edit, expiry, MRP).
- [ ] T2.3 Suppliers CRUD + Purchase entry (increase stock, write StockMovement).
- [ ] T2.4 Stock page tabs: All / Low / Expiring / Expired; adjust stock with reason.
- [ ] T2.5 CSV/Excel import with preview + error report.
- [ ] T2.6 Stock movement history per medicine.
**Accept:** stock always equals sum of batches; every change has a movement row.

## Phase 3 — Billing
- [ ] T3.1 Billing page UI per DESIGN.md §3.2 (search, cart, totals, keyboard shortcuts).
- [ ] T3.2 FEFO batch auto-selection + manual override; expiry blocking/warning.
- [ ] T3.3 Customer quick-add by phone; Schedule H doctor/prescription prompt.
- [ ] T3.4 Payments (cash/UPI/card/credit/split), change calculation, round-off.
- [ ] T3.5 `createSale` service — single transaction, row locks, gap-free invoice no.
- [ ] T3.6 Hold / resume bills; cart crash-recovery (localStorage).
- [ ] T3.7 Print: 80mm receipt + A4 GST invoice + PDF download.
- [ ] T3.8 Returns/refunds & void with reason + audit log.
- [ ] T3.9 Bills list: search by invoice/customer/date, reprint.
**Accept:** concurrent-sale test never produces negative stock; expired batch cannot be sold; totals match manual calc.

## Phase 4 — Customers & Notifications
- [ ] T4.1 Customers list, profile (purchase history, credit balance, consent toggles).
- [ ] T4.2 Notification provider adapters (WhatsApp, SMS, Email) + `NotificationLog`.
- [ ] T4.3 Template manager with variables, preview, send-test.
- [ ] T4.4 Queue worker with retry/backoff; bill-receipt trigger after sale.
- [ ] T4.5 Udhar (credit) ledger + due reminders.
- [ ] T4.6 Broadcast to selected customers (respect consent + quiet hours).
**Accept:** no message sent without consent; billing never blocked by a provider failure.

## Phase 5 — Appointments
- [ ] T5.1 Doctors CRUD + weekly availability.
- [ ] T5.2 Slot generator + booking drawer + double-booking prevention.
- [ ] T5.3 Calendar (day/week) + status changes.
- [ ] T5.4 Confirmation + reminders (T-24h, T-2h) via jobs.
- [ ] T5.5 Optional public booking link (rate limited).
**Accept:** two simultaneous bookings for one slot → exactly one succeeds.

## Phase 6 — Dashboard & Reports
- [ ] T6.1 Dashboard cards + "Do this now" list + first-run checklist.
- [ ] T6.2 Reports: daily sales, GST, profit, top/slow movers, expiry loss, credit due; CSV/PDF export.
- [ ] T6.3 Daily jobs: expiry scan, low-stock scan, owner summary, DB backup.

## Phase 7 — Beginner Experience & Polish
- [ ] T7.1 Guided setup wizard, inline hints, "?" help panels on each page.
- [ ] T7.2 Demo mode with sample data + reset.
- [ ] T7.3 i18n scaffolding (EN/HI/OR) for all UI strings.
- [ ] T7.4 Accessibility pass; empty/error states audit.
- [ ] T7.5 E2E tests of the full flow; performance check (search < 200 ms).
- [ ] T7.6 Deployment guide + backup/restore doc.

## Phase 8 — Extras (pick later)
Substitute finder · Prescription OCR · Refill reminders · Auto purchase orders · PWA offline billing · Loyalty · Multi-branch · Home delivery.

## Parking Lot
(AI: add new ideas here, don't build them.)
