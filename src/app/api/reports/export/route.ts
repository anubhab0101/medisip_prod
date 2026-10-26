import { NextRequest, NextResponse } from "next/server";
import { getReport } from "@/features/reports/service";
import { toCsv } from "@/lib/csv";
import { validateCsrfToken, getCsrfTokenFromRequest } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  const csrfToken = await getCsrfTokenFromRequest(request);
  if (!(await validateCsrfToken(csrfToken))) {
    return NextResponse.json(
      { error: "Invalid CSRF token." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const report = await getReport(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  return new NextResponse(toCsv([report.headers, ...report.rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.kind}-${report.from}-${report.to}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
