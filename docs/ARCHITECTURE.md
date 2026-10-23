# ARCHITECTURE — MediShop

## 1. Stack (decided — do not change without updating MEMORY.md)
| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript (strict) | One codebase for UI + API |
| UI | Tailwind CSS + shadcn/ui + lucide-react | Fast, consistent, accessible |
| Forms/validation | React Hook Form + Zod | Same schema client + server |
| Data fetching | TanStack Query + Server Actions | Caching, optimistic UI |
| Database | PostgreSQL | Transactions, reliability |
| ORM | Prisma | Typed, migrations |
| Auth | Auth.js (credentials + optional phone OTP) | Role based |
| Jobs/queue | BullMQ + Redis (or pg-boss to avoid Redis) | Reminders, retries |
| Notifications | Provider adapters: WhatsApp Cloud API, MSG91/Twilio SMS, SMTP email | Swap providers easily |
| PDF/Print | `@react-pdf/renderer` + print CSS for 80mm | Invoices |
| Tests | Vitest (unit), Playwright (e2e) | Billing must never break |
| Hosting | Docker; VPS or Vercel + managed Postgres | Simple |

## 2. Folder Structure
```
/docs                    # these files — source of truth
/prisma
  schema.prisma
  seed.ts
/src
  /app
    /(auth)/login
    /(app)/dashboard
    /(app)/billing         # total billing page
    /(app)/medicines
    /(app)/stock
    /(app)/purchases
    /(app)/customers
    /(app)/appointments
    /(app)/notifications
    /(app)/reports
    /(app)/settings
    /api/webhooks/*        # whatsapp status, etc.
  /components
    /ui                    # shadcn
    /shared                # DataTable, SearchBox, EmptyState, ConfirmDialog
  /features                # business logic grouped by module
    /billing  /medicines  /stock  /customers  /appointments  /notifications  /reports
      components/ actions.ts queries.ts schema.ts service.ts
  /lib
    db.ts auth.ts money.ts date.ts gst.ts fefo.ts permissions.ts
  /server
    /notifications/providers  # whatsapp.ts sms.ts email.ts
    /jobs                     # reminders, expiry-scan, low-stock-scan
/tests
```

## 3. Data Model (Prisma, summary)
```
User(id, name, phone, role, passwordHash, active)
Shop(id, name, gstin, drugLicenseNo, address, phone, invoicePrefix)

Medicine(id, name, genericName, manufacturer, category, hsn, gstPercent,
         packSize, barcode, rack, schedule(NONE|H|H1|X), reorderLevel, active)
Batch(id, medicineId, batchNo, expiryDate, qtyOnHand, purchasePricePaise,
      mrpPaise, supplierId, receivedAt)
Supplier(id, name, phone, gstin)
Purchase(id, supplierId, invoiceNo, date, totalPaise)  + PurchaseItem(...)
StockMovement(id, batchId, type(PURCHASE|SALE|RETURN|ADJUST|EXPIRED),
              qty, reason, userId, refId, createdAt)

Customer(id, name, phone, email, consentWhatsapp, consentSms, creditBalancePaise)
Sale(id, invoiceNo, customerId, userId, subtotalPaise, discountPaise, cgstPaise,
     sgstPaise, roundOffPaise, totalPaise, status(HELD|PAID|PARTIAL|RETURNED|VOID),
     doctorName, prescriptionRef, createdAt)
SaleItem(id, saleId, medicineId, batchId, qty, unitPricePaise, discountPct, gstPercent, lineTotalPaise)
Payment(id, saleId, method(CASH|UPI|CARD|CREDIT), amountPaise, reference)

Doctor(id, name, specialization, feePaise, slotMinutes, active)
DoctorAvailability(id, doctorId, weekday, startTime, endTime)
Appointment(id, doctorId, customerId, startsAt, endsAt, status, notes)

NotificationTemplate(id, key, channel, body, active)
NotificationLog(id, customerId, channel, templateKey, payload, status, error, scheduledFor, sentAt)
AuditLog(id, userId, action, entity, entityId, before, after, createdAt)
```
**Money = integer paise everywhere.** Never float.

## 4. Critical Flows

### 4.1 Create Bill (single DB transaction)
1. Validate cart (Zod). 2. Lock selected batches (`SELECT … FOR UPDATE`).
3. Verify `qtyOnHand >= qty` and `expiry > today`. 4. Decrement batch, write `StockMovement(SALE)`.
5. Compute totals with `gst.ts` + `money.ts`. 6. Create `Sale`, `SaleItem`, `Payment`.
7. Allocate invoice number (sequence, gap-free per FY). 8. Commit. 9. Enqueue receipt notification.
Any failure → full rollback.

### 4.2 FEFO allocation (`lib/fefo.ts`)
Sort non-expired batches by expiry ASC, take from earliest until qty satisfied; split a line across batches if needed.

### 4.3 Appointment booking
Generate slots from `DoctorAvailability`; reject overlap with unique constraint `(doctorId, startsAt)`; on success enqueue confirmation + reminders (T-24h, T-2h).

### 4.4 Notification pipeline
`enqueue()` → job → check consent → render template → provider adapter → write `NotificationLog` → retry with exponential backoff (max 3).

### 4.5 Scheduled jobs
- Hourly: send due reminders.
- Daily 07:00: expiry scan + low-stock scan → dashboard alerts + owner summary.
- Daily 02:00: DB backup.

## 5. Security
- Role-based permission check in every server action (`permissions.ts`).
- Passwords hashed (argon2/bcrypt); rate-limit login.
- Zod validate all input; parameterized queries only (Prisma).
- Soft-delete medicines/customers; never hard-delete sales.
- Audit log on price, stock adjustment, bill void/return.
- Secrets in `.env`, never committed.

## 6. Performance
- Index: `Medicine(name, genericName, barcode)`, `Batch(medicineId, expiryDate)`, `Sale(createdAt)`.
- Medicine search: Postgres `pg_trgm` for fuzzy type-ahead, debounce 150ms.
- Billing page loads medicine list lazily; keep cart in client state, persist to localStorage for crash recovery.

## 7. Environments
`.env.example` must list: DATABASE_URL, AUTH_SECRET, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, SMS_API_KEY, SMTP_*, REDIS_URL, APP_URL.
