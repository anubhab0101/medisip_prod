import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission, can } from "@/lib/permissions";
import { invoicePdf } from "@/features/billing/invoice-pdf";
import { pdfResponse } from "@/server/pdf";
import { validateCsrfToken, getCsrfTokenFromRequest } from "@/lib/csrf";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfToken = await getCsrfTokenFromRequest(request);
  if (!(await validateCsrfToken(csrfToken))) {
    return Response.json(
      { error: "Invalid CSRF token." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const ctx = await context();
  if (!can(ctx.role, Permission.BILL) || ctx.branch.demo)
    return Response.json(
      {
        error:
          "Invoice downloads are unavailable for this account or practice shop.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  const { id } = await params;
  const sale = await db().sale.findFirst({
    where: { id, branchId: ctx.branch.id },
    include: {
      items: { orderBy: { id: "asc" } },
      payments: true,
      returns: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!sale)
    return Response.json(
      { error: "Bill not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  return pdfResponse(await invoicePdf(sale), sale.invoiceNo);
}
