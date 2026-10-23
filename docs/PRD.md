# PRD — MediShop (Medical Shop Management Software)

## 1. Vision
A simple, fast, mistake-proof web app for a small/medium medical shop (pharmacy) in India.
A brand-new staff member must be able to make a bill in under 2 minutes with zero training.

## 2. Users & Roles
| Role | Can do |
|---|---|
| Owner | Everything, reports, settings, users, prices |
| Pharmacist | Billing, stock, purchases, customers, appointments |
| Cashier | Billing, view stock, customers only |
| Doctor (optional) | View own appointments |

## 3. Core Modules (MVP)

### 3.1 Medicine Management
- Add / edit / archive medicine: name, generic/salt, manufacturer, category (tablet, syrup, injection…), HSN, GST %, unit/pack size, barcode, rack location, Schedule H/H1/X flag, reorder level.
- Each medicine has many **batches**: batch no, expiry, quantity, purchase price, MRP, supplier.
- Bulk import from Excel/CSV with a preview and error report.
- Search by name, salt, barcode — fast (type-ahead).

### 3.2 Stock Tracking
- Live stock = sum of batch quantities.
- Dashboard alerts: **Low stock**, **Expiring in 30/60/90 days**, **Expired**, **Out of stock**.
- Stock adjustments (damage, return, correction) with mandatory reason.
- Purchase entry (supplier bill) increases stock by batch.
- Full stock movement history (who, when, why).

### 3.3 Billing (Total Billing Page) — the heart of the app
- Single full-screen page: search/scan → add items → bill total → pay → print.
- Auto picks batch using **FEFO** (First Expiry, First Out); cashier can override.
- Blocks expired batches; warns on near-expiry (<30 days).
- Line discount %, bill discount, GST split (CGST/SGST), round-off.
- Customer attach (optional): name + phone, auto-create.
- Payment: Cash, UPI, Card, Credit (udhar), Split payments.
- Hold bill / resume bill (multiple open bills).
- Print: A4 GST invoice + 80mm thermal receipt + PDF/WhatsApp share.
- Return / refund against an old bill (stock goes back to the same batch).
- Schedule H/H1: ask doctor name + prescription ref before completing.

### 3.4 Doctor Appointments
- Doctors list with specialization, fee, weekly availability, slot length.
- Book from the shop screen (walk-in/phone) or public booking link.
- Calendar view (day/week), statuses: Booked → Confirmed → Completed / Cancelled / No-show.
- Prevent double booking for the same slot.
- Automatic reminders to the patient.

### 3.5 Customer Notifications
- Channels: WhatsApp (primary), SMS, Email (pluggable providers).
- Templates with variables: `{name}`, `{shop}`, `{date}`, `{time}`, `{doctor}`, `{amount}`.
- Triggers: bill receipt, appointment confirmation, reminder (24h + 2h before), refill reminder (chronic medicines), payment due (udhar), offers/festival broadcast.
- Consent flag per customer (opt-in); respect opt-out.
- Delivery log with status (queued / sent / failed) and retry.

### 3.6 Reports
Daily sales, GST summary, profit by medicine, top sellers, slow movers, expiry loss, purchase vs sales, outstanding credit, staff-wise sales. Export CSV / PDF.

## 4. Suggested Extra Features (Phase 2+)
1. **Prescription upload + OCR** → auto-fill bill items.
2. **Medicine substitute finder** (same salt, cheaper brand) — big customer trust win.
3. **Refill reminders** based on purchase history.
4. **Supplier management + auto purchase order** from low-stock list.
5. **Barcode scanner & label printing** (USB scanner works as keyboard).
6. **Customer credit ledger (udhar khata)** with due reminders.
7. **Expiry return-to-supplier tracker.**
8. **Multi-store / branch support.**
9. **Online ordering + home delivery tracking.**
10. **Drug interaction / dosage warning** (licensed drug DB needed).
11. **Staff attendance + shift cash closing.**
12. **Offline mode (PWA)** — billing keeps working without internet and syncs later.
13. **Daily WhatsApp summary to owner** (sales, low stock, expiries).
14. **Loyalty points / discount coupons.**
15. **Backup & restore** (daily automatic, one-click restore).
16. **Audit log** — who edited price/stock/bill.
17. **Insurance / corporate-account billing.**
18. **Hindi / Odia / English language switch.**

## 5. Non-Goals (MVP)
Online payments gateway, e-commerce storefront, multi-branch, drug interaction DB.

## 6. Success Metrics
- New staff completes first bill < 2 min, without help.
- Billing page: add item < 3 sec; checkout < 10 sec.
- Zero negative stock; zero expired medicine sold.
- 95% of reminders delivered.

## 7. Compliance Notes (India)
- GST invoice fields: shop GSTIN, drug licence no., invoice no., HSN, GST rate split.
- Schedule H/H1/X sale register.
- Keep bills & records for the legally required period.
- Store only needed personal data; get notification consent.
