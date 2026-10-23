import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { PageTitle } from "@/components/shared/page";
const sections = [
  [
    "Start a new shop",
    "Open Settings and enter the shop name, address, phone, licence and invoice prefix. Add staff with only the access they need. Add suppliers and medicines, then receive opening stock through Purchases.",
  ],
  [
    "Make a bill",
    "Find a medicine by name, ingredient or barcode. Enter quantity, choose a customer if needed, check the payment and save. F2 opens search; F10 saves. Expired and reserved stock cannot be sold by the online counter.",
  ],
  [
    "Pause or recover a bill",
    "Use Hold / resume bills to pause work. If the browser closes, restore the saved draft. Current stock and prices are checked again. A held bill does not reserve stock.",
  ],
  [
    "Share a receipt",
    "Open the saved bill and create a customer receipt link. It opens a separate receipt-only viewer, with no staff-site links. Revoke a link when needed; returns automatically invalidate older links.",
  ],
  [
    "Correct a bill or stock",
    "Use Returns on the original bill. Enter only the returned quantities and check the refund. Use Stock > Adjust for counted stock differences, with a clear reason. Batch edits keep old invoice details unchanged.",
  ],
  [
    "Doctors and customers",
    "Appointments supports daily and seven-day views. Edit recurring hours in Doctors & hours. Existing bookings are protected. Customer profiles show credit, purchase history, loyalty and reminder scheduling.",
  ],
  [
    "Send announcements",
    "Messages > Broadcast lets you preview a doctor visit or custom update for all or selected customers. Only consented contacts are eligible. SMS needs the configured sending phone; WhatsApp and email open for staff to send manually.",
  ],
  [
    "Use an offline counter",
    "Reserve stock while connected and open the counter before disconnecting. Saved provisional bills stay on this browser. Reconnect, sign in as the original staff member and sync. Close the counter only after all bills sync and unsold stock is counted. Do not clear browser storage or use private browsing.",
  ],
  [
    "Review the business",
    "Reports supports date ranges, CSV downloads and Print / Save PDF. Credit and expiry reports show the current position. Profit is a gross margin estimate based on recorded batch costs, not a complete accounting statement.",
  ],
  [
    "Practice safely",
    "The practice banner identifies sample shops. Practice SMS is disabled. Keep sample and real records in separate shops. Fictional medicine names and tax values must not be used as a real catalogue.",
  ],
];
export default function Help() {
  return (
    <>
      <PageTitle
        title="Quick help"
        description="Simple steps for daily pharmacy work."
        action={
          <Link className="button secondary" href="/dashboard">
            <T>{"Home"}</T>
          </Link>
        }
      />
      {sections.map(([title, body]) => (
        <details className="panel disclosure" key={title}>
          <summary>{title}</summary>
          <p>{body}</p>
        </details>
      ))}
    </>
  );
}
