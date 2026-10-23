# MEMORY — MediShop (living project log)

> The AI agent MUST read this at the start of every session and update it at the end.
> Keep it short, factual, newest entries at the top of each section.

## Project Snapshot
- Product: MediShop — medical shop management (medicines, stock, billing, appointments, notifications).
- Market: India (GST, Schedule H/H1/X, INR, Asia/Kolkata).
- Stack: Next.js 15 + TS + Tailwind + shadcn/ui + Prisma + PostgreSQL + Auth.js + BullMQ.
- Current phase: Phase 0 — Setup
- Last completed task: none
- Next task: T0.1

## Decisions Log
| Date | Decision | Why |
|---|---|---|
| (start) | Money stored as integer paise | Avoid float errors |
| (start) | FEFO batch selection by default | Reduce expiry loss |
| (start) | Notification providers behind adapters | Swap WhatsApp/SMS vendor easily |

## Assumptions (confirm with owner later)
- Single shop for MVP; multi-branch is Phase 8.
- WhatsApp Cloud API is the preferred channel; SMS is fallback.
- Prices are MRP-inclusive of GST (confirm).

## Gotchas / Lessons
- (add as discovered, e.g., "Prisma `$transaction` needs raw `FOR UPDATE` for batch locks")

## Commands
```
npm run dev          # start app
npm run lint && npm run typecheck && npm test
npx prisma migrate dev
npx prisma db seed
```

## Environment Notes
- Test logins (from seed): owner@demo.com / pharmacist@demo.com / cashier@demo.com — password in `.env.example` (dev only).

## Open Questions
- Which thermal printer model / paper width does the shop use?
- Does the shop need barcode label printing?
- Which WhatsApp provider/number will be used?

## Parking Lot (ideas not yet approved)
- Substitute medicine finder
- Prescription OCR
- Offline PWA billing

## Session Log
- (YYYY-MM-DD) Session 1: <what was done, what is next>
