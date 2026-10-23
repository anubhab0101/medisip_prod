# DESIGN — MediShop UI/UX

**Principle:** *If a new staff member needs to ask "what do I click?", the design failed.*

## 1. Visual Style
- Clean, calm, medical: white surfaces, soft gray background, one strong accent.
- Colors (Tailwind tokens):
  - Primary: teal `#0D9488` (buttons, links)
  - Success: green `#16A34A` · Warning: amber `#D97706` · Danger: red `#DC2626` · Info: blue `#2563EB`
  - Text: slate-900 / slate-600 · Background: slate-50 · Cards: white, `rounded-xl`, subtle shadow
- Font: Inter. Base size 16px; table text 15px; billing totals 28–36px bold.
- Large click targets (min 44px height). Icons always paired with text labels.
- Light theme default; dark mode optional later.

## 2. Layout
- **Left sidebar** (collapsible; bottom tab bar on mobile): Dashboard, **New Bill** (highlighted), Medicines, Stock, Purchases, Customers, Appointments, Messages, Reports, Settings.
- **Top bar**: global search (medicine/customer/bill), shop name, user menu, big **+ New Bill** button.
- Content area max-width 1280px except Billing (full width).

## 3. Key Screens

### 3.1 Dashboard
Top: 4 cards — Today's Sales, Bills Today, Low Stock, Expiring Soon.
Below: "Do this now" list (e.g., "12 medicines expire in 30 days → View"), today's appointments, quick buttons: **New Bill · Add Medicine · Add Stock · Book Appointment**.

### 3.2 Total Billing Page (most important)
```
┌──────────────────────────────────────────────────────────────┬──────────────────────┐
│ [🔍 Search medicine or scan barcode…            ] (autofocus) │ Customer (optional)  │
│                                                              │ [Phone / Name      ] │
│ # Medicine        Batch/Exp   Qty  MRP   Disc%  Amount   ✕   │ Doctor (if Sch. H)   │
│ 1 Paracetamol 500 B12 · 08/27 [10] 2.00  0     20.00     ✕   │ ──────────────────── │
│ 2 Azithro 500     A77 · 02/27 [ 3] 24.0  5%    68.40     ✕   │ Subtotal      88.40  │
│   ⚠ Expires in 28 days                                       │ Discount       0.00  │
│                                                              │ GST            4.20  │
│ Empty state: "Search a medicine above to start the bill"     │ Round-off     -0.60  │
│                                                              │ TOTAL    ₹ 92.00     │
│                                                              │ [Cash][UPI][Card][Udhar]
│                                                              │ Received [100] Change 8
│  [Hold Bill F6]  [Clear]                                     │ [ ✔ Save & Print F10 ]│
└──────────────────────────────────────────────────────────────┴──────────────────────┘
```
- Search results show: name, salt, stock, MRP, nearest expiry; Enter adds item, qty field gets focus.
- Shortcuts: `F2` search · `F4` customer · `F6` hold · `F9` payment · `F10` save & print · `Esc` cancel dialog.
- Color chips: green = healthy stock, amber = low/near expiry, red = expired/out.
- "Held bills" tab at top to switch between open bills.
- After save: success screen with **Print · WhatsApp bill · New Bill** (New Bill is auto-focused).

### 3.3 Medicines
Table: name, salt, stock, MRP, status chips. Primary button "Add Medicine". Drawer form (not a new page) with 3 grouped sections: Basic · Pricing & Tax · Stock alert. Inline "Add first batch" step.

### 3.4 Stock
Tabs: All · Low · Expiring · Expired. Each row has a one-click "Add stock" or "Adjust". Expired rows show "Remove from stock".

### 3.5 Appointments
Day/week calendar; click empty slot → booking drawer (patient search → doctor → slot). Status chips with one-click change. Today list for the reception desk.

### 3.6 Messages
Template list with live preview; "Send test to my number" button; delivery log table with filters and Retry.

## 4. Beginner-Friendly Patterns (mandatory)
1. **Guided first run**: 5-step setup checklist (Shop details → Add first medicine → Add stock → Make test bill → Add doctor). Progress bar on the dashboard until done.
2. **Inline hints**: gray helper text under every non-obvious field ("Batch number is printed on the strip box").
3. **Empty states** always explain + give one big action button.
4. **Friendly errors**: "This batch has only 5 strips left. Reduce quantity or pick another batch."
5. **Undo toasts** for non-financial changes.
6. **Confirm dialogs** state the effect: "Remove 20 strips of Batch A77? Stock will become 0."
7. **Tooltips + a "?" help button** on each page opening a 3-line "How to" panel.
8. **Demo mode / sample data** button to practice without affecting real data.
9. **Smart defaults**: today's date, quantity 1, payment = Cash, GST from medicine.
10. **Autosave drafts** of bills and forms.
11. **Language toggle** (English / हिन्दी / ଓଡ଼ିଆ) in the top bar — plan the i18n keys from day one.

## 5. Accessibility
Contrast ≥ 4.5:1, visible focus rings, labels on all inputs, full keyboard operation, `aria-live` for toasts.

## 6. Print Layouts
- 80mm thermal: shop header, bill no, items (name, batch, exp, qty, amt), GST, total, "Get well soon" footer.
- A4 GST invoice: full tax table, GSTIN, licence no., signature block.
