# RULES — MediShop (Non-negotiable for the AI and humans)

## A. Working rules for the AI agent
1. **Read first**: `PRD.md` → `ARCHITECTURE.md` → `DESIGN.md` → `TASKS.md` → `MEMORY.md` before writing code.
2. Work on **one task at a time** from `TASKS.md`. Do not start the next until the current one passes its acceptance checks.
3. After each task: tick it in `TASKS.md`, and append decisions/gotchas to `MEMORY.md`.
4. Do not invent features outside the PRD. Put ideas under "Parking Lot" in `MEMORY.md`.
5. Never change the stack in `ARCHITECTURE.md` silently. If you must, record why in `MEMORY.md`.
6. If a requirement is unclear, make the simplest reasonable assumption, note it in `MEMORY.md`, continue.
7. Small, reviewable commits: `feat(billing): ...`, `fix(stock): ...`.

## B. Code rules
- TypeScript `strict: true`. No `any` (use `unknown` + Zod).
- Validate every input on the **server** with Zod, even if the client validated.
- Business logic lives in `/features/*/service.ts`, not in components.
- Components are small (<200 lines). Reuse `/components/shared`.
- No hard-coded strings for roles, statuses — use enums.
- Handle loading, empty, and error states on every screen.
- Every list screen: search, pagination, empty state.
- Dates stored UTC, shown in `Asia/Kolkata`.

## C. Money & stock rules (bugs here = real losses)
- Money is **integer paise**. Use helpers in `lib/money.ts`. No floating-point math.
- GST computed in `lib/gst.ts` with unit tests. Round per line, then reconcile round-off at bill level.
- Stock changes **only** through service functions that write a `StockMovement`.
- Billing runs inside **one DB transaction** with row locks. No negative stock, ever.
- **Never sell an expired batch.** Warn if expiry < 30 days.
- Default batch selection is FEFO.
- Sales are never hard-deleted. Corrections = Return or Void with reason + audit log.
- Invoice numbers are sequential, gap-free, unique per financial year.

## D. Pharmacy compliance rules
- Schedule H / H1 / X medicines: require doctor name + prescription ref before completing the sale; log in the schedule register.
- Show MRP; never sell above MRP.
- Invoice must show GSTIN, drug licence no., batch no., expiry, HSN.

## E. Notification rules
- Send only if the customer has consent for that channel.
- Always include shop name; include opt-out line on promotional messages.
- Never block billing on notification failure — queue and retry.
- Quiet hours for promotional messages: 9 PM–8 AM (no sends).

## F. UX rules (see DESIGN.md)
- Every primary action reachable in ≤ 2 clicks from the dashboard.
- Destructive actions need a confirm dialog that states consequences.
- Use plain words ("Add medicine", not "Create SKU").
- Keyboard-first on the billing page.
- Never show raw error text — show a friendly message + what to do next.

## G. Testing rules
- Unit tests: `money`, `gst`, `fefo`, slot generation.
- Integration: create bill (success, insufficient stock, expired batch, concurrent bills).
- E2E (Playwright): login → add medicine → purchase → bill → print → return.
- A task is "done" only when tests for it pass and `npm run lint && npm run typecheck && npm test` is green.

## H. Definition of Done
- [ ] Meets acceptance criteria in TASKS.md
- [ ] Works on desktop and 360px mobile width
- [ ] Loading / empty / error states done
- [ ] Permissions enforced
- [ ] Tests pass, lint/typecheck clean
- [ ] TASKS.md ticked, MEMORY.md updated
