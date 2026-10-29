# OrioSlice to MediShop feature mapping

OrioSlice is a restaurant POS with menu, table, kitchen, kiosk, purchasing, inventory, staff, reports and audit workflows. MediShop keeps the pharmacy equivalents; restaurant-only flows (tables, KOT/KDS, recipes, meal modifiers and kitchen stations) are not appropriate for dispensing medicines.

| Pharmacy workflow | MediShop status | Adaptation |
| --- | --- | --- |
| Medicine catalogue and barcode lookup | Existing | Brand/generic name, strength, form, schedule, tax, barcode and batch availability. Barcode scanners that type into the search field are supported. |
| Prescription intake and pharmacist review | Added | Private PDF/JPEG/PNG upload, branch-scoped access, owner/pharmacist review, audit trail, and approved prescription check during scheduled-medicine billing. |
| Counter POS and billing | Existing | FEFO batch allocation, GST, discounts, split payment, returns, receipts, held bills and keyboard shortcuts. |
| Batch stock, expiry, low stock and transfers | Existing | Batch/expiry ledger, expired-stock blocking, alerts, adjustments and branch transfers. |
| Purchasing and suppliers | Existing | Supplier records, purchase history, draft reorder suggestions and batch-aware goods receipt. |
| Customers, loyalty and refills | Existing | Customer purchase/credit history, consent, loyalty and scheduled refill reminders. |
| Staff roles and audit | Existing | Owner, pharmacist, cashier and doctor access; inventory, billing, messaging and review actions are audited. |
| Reports and multi-shop | Existing | Sales, profit estimate, expiry/credit reports, CSV/PDF and isolated branch data. |
| Customer announcements | Existing | SMS/WhatsApp/email workflows with consent checks and doctor timing broadcasts. |
| Customer medicine order request and online pickup selection | Not implemented | Current delivery workflow tracks staff-created bills. It does not yet accept a medicine basket online or manage a customer order before billing. |

## Prescription rollout note

The migration `202610290001_prescription_review` must be applied before starting this version. Prescription files are stored in the application database, so database permissions and encrypted backups must be protected. The separate receipt service does not receive this table or its files.
