import { NextRequest, NextResponse } from "next/server";
import { getReport } from "@/features/reports/service";
import { toCsv } from "@/lib/csv";
export async function GET(request: NextRequest) {
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
