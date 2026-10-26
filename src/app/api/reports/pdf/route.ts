import { NextRequest } from "next/server";
import { getReport } from "@/features/reports/service";
import { context } from "@/server/context";
import { can, Permission } from "@/lib/permissions";
import { pdfResponse, pdfTable, pdfText, renderPdf } from "@/server/pdf";
import { validateCsrfToken, getCsrfTokenFromRequest } from "@/lib/csrf";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const csrfToken = await getCsrfTokenFromRequest(request);
  if (!(await validateCsrfToken(csrfToken))) {
    return Response.json(
      { error: "Invalid CSRF token." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const ctx = await context();
  if (!can(ctx.role, Permission.REPORT))
    return Response.json(
      { error: "Report permission required." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  const report = await getReport(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const buffer = await renderPdf(
    report.title,
    [
      pdfText(report.shop, { fontSize: 18, bold: true }),
      pdfText(report.title, { fontSize: 13, bold: true, margin: [0, 8, 0, 4] }),
      pdfText(`${report.from} to ${report.to}`),
      pdfText(report.note, { margin: [0, 5, 0, 12] }),
      report.rows.length
        ? pdfTable(report.headers, report.rows)
        : pdfText("No records for this report."),
      pdfText(`${report.rows.length} rows`, { margin: [0, 12, 0, 0] }),
    ],
    report.headers.length > 5,
  );
  return pdfResponse(buffer, `${report.kind}-${report.from}-${report.to}`);
}
