# CODEX MASTER PROMPTS — MediShop

Put the 6 docs in `/docs` of your repo (PRD, ARCHITECTURE, RULES, DESIGN, TASKS, MEMORY). Optionally copy Prompt 1's "Standing Instructions" into `AGENTS.md` at the repo root so Codex reads them every session.

---

## PROMPT 1 — Kickoff (paste once)

```
You are a senior full-stack engineer and pharmacy-domain product designer. You are building "MediShop", a medical shop management web app for small Indian pharmacies.

SOURCE OF TRUTH — read these fully before doing anything, in this order:
1. /docs/PRD.md          – what to build and for whom
2. /docs/ARCHITECTURE.md – stack, folders, data model, critical flows
3. /docs/RULES.md        – non-negotiable rules (money, stock, compliance, code style)
4. /docs/DESIGN.md       – UI/UX, screens, beginner-friendly patterns
5. /docs/TASKS.md        – ordered task list
6. /docs/MEMORY.md       – current state, decisions, gotchas

PRODUCT IN ONE PARAGRAPH
Shop staff add medicines with batches and expiry, track stock with low-stock/expiry alerts, create bills on one fast full-screen billing page (FEFO batch selection, GST, multiple payment modes, print/WhatsApp), book doctor appointments, and send automatic notifications (receipts, reminders, refills) to customers. A brand-new staff member must be able to use it with no training.

HOW TO WORK
- Follow TASKS.md strictly, one task at a time, starting at the first unchecked task.
- Before coding each task, output a 5–8 line plan: files you will create/change, data impact, edge cases, tests.
- Implement it completely (no TODO stubs, no placeholder logic) including loading, empty and error states, permission checks, and Zod validation on the server.
- Write tests for the business logic you touch. Run lint, typecheck and tests; fix everything until green.
- Tick the task in TASKS.md and append decisions/gotchas/next step to MEMORY.md.
- Stop after finishing the task and report: what was built, how to run/verify it, what is next. Wait for "continue".

HARD CONSTRAINTS (violating any is a failure)
- Money is integer paise only. No floats for currency.
- Stock changes only via service functions that write StockMovement, inside DB transactions with row locks. Negative stock is impossible.
- Expired batches can never be sold. Default batch pick is FEFO.
- Sales are never hard-deleted; use Return/Void with reason + AuditLog.
- Schedule H/H1/X sales require doctor name + prescription ref.
- Notifications respect customer consent and never block billing.
- Do not add features that are not in the PRD; put ideas in MEMORY.md "Parking Lot".
- Do not change the tech stack without recording the reason in MEMORY.md.

UI QUALITY BAR
Clean, calm, medical look (teal primary), large click targets, plain language, keyboard-first billing, helpful hints under fields, friendly error messages, undo toasts, guided first-run checklist. Follow DESIGN.md exactly.

If something is ambiguous: choose the simplest sensible assumption, record it in MEMORY.md, and continue — do not stall.

Start now with Phase 0 (T0.1). First confirm you have read all six docs by listing, in one line each, the three most important constraints from each.
```

---

## PROMPT 2 — Continue (paste at the start of every new session)

```
Read /docs/MEMORY.md and /docs/TASKS.md, then re-skim /docs/RULES.md.
Tell me in 3 lines: current phase, last completed task, next task.
Then execute the next unchecked task following the same workflow (plan → implement fully → tests → lint/typecheck → tick TASKS.md → update MEMORY.md → report and stop).
```

---

## PROMPT 3 — Code review / bug-hunt (run after each phase)

```
Act as a strict reviewer. Audit the code added in the last phase against /docs/RULES.md and /docs/ARCHITECTURE.md.
Check specifically: float money usage, stock changes outside services, missing transactions/locks, missing permission checks, missing Zod validation, expired-batch sales, N+1 queries, missing empty/error states, accessibility, hard-coded strings.
Output a table: Severity | File:line | Problem | Fix. Then apply all High and Medium fixes, add regression tests, rerun lint/typecheck/tests, and log the lessons in MEMORY.md.
```

---

## PROMPT 4 — Billing page deep-dive (use for T3.x)

```
Build the Total Billing Page exactly as in /docs/DESIGN.md §3.2 and the flow in /docs/ARCHITECTURE.md §4.1–4.2.
Requirements: autofocus search with 150ms debounce and fuzzy match (name, salt, barcode); Enter adds item and moves focus to Qty; FEFO auto batch with override dropdown; red/amber/green stock and expiry chips; per-line and bill discount; GST split; round-off; payment modes incl. split; change calculation; hold/resume multiple bills; shortcuts F2/F4/F6/F9/F10; cart persisted to localStorage; Save & Print opens 80mm receipt and offers WhatsApp share.
Server: createSale in one transaction with SELECT … FOR UPDATE on batches, gap-free invoice number, StockMovement rows, enqueue receipt notification.
Tests: GST rounding cases, FEFO split across batches, insufficient stock, expired batch, two concurrent sales on the same last unit (exactly one succeeds).
```

---

## PROMPT 5 — Notifications (use for T4.x)

```
Implement the notification system per /docs/ARCHITECTURE.md §4.4.
Create provider adapters (WhatsApp Cloud API, SMS, Email) behind one interface `send({to, channel, templateKey, variables})`. Add a mock provider for dev/tests.
Pipeline: enqueue → worker → consent check → template render ({name},{shop},{date},{time},{doctor},{amount}) → provider → NotificationLog → retry with exponential backoff (max 3).
Triggers: bill receipt, appointment confirmation, reminders T-24h and T-2h, refill reminder, credit due, broadcast (respect quiet hours 9PM–8AM for promotional).
UI: template editor with live preview and "send test to my number", delivery log with Retry.
Billing and booking must succeed even if a provider is down.
```

---

## PROMPT 6 — Appointments (use for T5.x)

```
Implement doctor appointments per PRD §3.4 and ARCHITECTURE §4.3.
Weekly availability → slot generator (slotMinutes) → booking drawer (patient search/quick-add → doctor → date → slot). Enforce unique (doctorId, startsAt) and handle the race with a friendly "slot just taken, pick another" message. Day/week calendar, status chips, today's list for reception, reminders via jobs. Add tests for slot generation (breaks, past times, overlap) and concurrent booking.
```

---

## STANDING INSTRUCTIONS (copy into /AGENTS.md)

```
Always read /docs/MEMORY.md and /docs/RULES.md at session start.
Follow /docs/TASKS.md order. One task at a time. Plan → build → test → tick → log in MEMORY.md.
Money in integer paise. Stock only via transactional services. Never sell expired batches. No features outside the PRD.
Definition of Done is in /docs/RULES.md §H.
```
