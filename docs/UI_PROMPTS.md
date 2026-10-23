# UI PROMPTS — Make it usable by anyone, on day one

Paste these into Codex after the related feature exists. Each one is self-contained.

---

## UI-1 — Guided first-run setup
```
Add a first-run setup wizard + dashboard checklist with 5 steps: 1) Shop details, 2) Add your first medicine, 3) Add stock for it, 4) Make a practice bill, 5) Add a doctor.
Each step is one simple screen: big title, one sentence of explanation, ONE primary button, a "Skip for now" link. Show a progress bar ("2 of 5 done") on the dashboard until complete. Auto-detect completed steps from real data. Use friendly wording, no jargon.
```

## UI-2 — Plain-language labels & hints
```
Audit every form and table. Replace technical terms with plain words (SKU→Medicine, Batch→Batch no. (on strip box), MRP→Price on pack, Reorder level→Tell me when stock falls below). Add gray helper text under every non-obvious field with one real example. Add a small "?" icon with tooltip where needed. Keep all text in i18n files (en, hi, or).
```

## UI-3 — Billing page for zero training
```
On the billing page add: (a) an empty state "Type a medicine name or scan the barcode to start", (b) a one-time 4-step coach-mark tour (search → quantity → payment → print) with Next/Skip, (c) a persistent "Shortcuts" popover (F2 search, F6 hold, F10 save). Make the Save & Print button disabled with a tooltip explaining what is missing (e.g., "Add at least one medicine"). After saving, show a success card with Print / Send on WhatsApp / New Bill, focus on New Bill.
```

## UI-4 — Friendly errors, confirms, undo
```
Create a central error-message map. Replace every raw error with: what happened + what to do next (e.g., "Only 5 strips left in this batch. Lower the quantity or choose another batch."). Add confirm dialogs for destructive actions that state the exact effect. Add undo toasts (8 seconds) for non-financial edits. Never show stack traces or database errors to users.
```

## UI-5 — Smart defaults & autosave
```
Apply smart defaults: today's date, quantity 1, payment Cash, GST from medicine, expiry month picker (MM/YY), phone field with +91 and 10-digit validation. Autosave drafts of forms and open bills; on return show "Continue where you left off?".
```

## UI-6 — Dashboard "Do this now"
```
Build a "Do this now" panel on the dashboard listing prioritized actions with one button each: expired items to remove, items expiring in 30 days, low-stock items → "Create purchase list", today's appointments, overdue credit customers → "Send reminder". Each row: icon, one-line message, count, action button. Hide the panel when empty and show a green "All good today ✓".
```

## UI-7 — Demo / practice mode
```
Add a "Practice mode" toggle in the top bar. When on: show an amber banner "Practice mode — nothing here is real", use an isolated demo dataset, disable notifications and printing to real devices, and offer "Reset demo data". New staff can safely learn the full flow.
```

## UI-8 — In-app help
```
Add a "?" Help button on every page that opens a right-side panel with: 3-line "How to use this page", a 30-second animated GIF/placeholder, common mistakes, and a "Ask the owner" link. Also add a searchable Help Center page with short how-tos: Add a medicine, Add stock, Make a bill, Return a bill, Book appointment, Send message to customers.
```

## UI-9 — Mobile & low-end devices
```
Make all screens usable at 360px width and on slow devices: bottom tab bar, large touch targets (44px), tables turn into cards, no layout shift, skeleton loaders, lazy-load heavy pages, billing search results virtualized. Verify with Lighthouse ≥ 90 performance on the billing page.
```

## UI-10 — Accessibility & language
```
Pass WCAG AA: contrast ≥ 4.5:1, visible focus ring, labels for all inputs, keyboard-only billing, aria-live for toasts. Add a language switcher (English / हिन्दी / ଓଡ଼ିଆ) in the top bar, persisted per user; no hard-coded strings anywhere.
```

---

## Ready-made friendly microcopy

| Where | Text |
|---|---|
| Empty medicines | "No medicines yet. Add your first medicine to start billing." |
| Empty stock alerts | "All good! Nothing is expiring or running low." |
| Out of stock | "Out of stock. Add stock or choose a substitute." |
| Near expiry | "Expires in 28 days — sell this first." |
| Expired | "This batch has expired and can't be sold." |
| Schedule H | "This medicine needs a doctor's prescription. Enter the doctor's name." |
| Bill saved | "Bill #INV-0042 saved. Print it or send it on WhatsApp." |
| Slot taken | "Someone just booked that slot. Please pick another time." |
| Message failed | "Couldn't send the message. We'll retry automatically." |
| Delete confirm | "Remove this medicine? Old bills stay safe. You can restore it later." |
