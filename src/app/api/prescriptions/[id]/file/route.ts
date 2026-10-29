import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await context(Permission.PRESCRIPTION);
  const { id } = await params;
  const record = await db().prescription.findFirst({
    where: { id, branchId: ctx.branch.id },
    select: { fileData: true, fileName: true, mimeType: true },
  });
  if (!record) return new Response("Not found", { status: 404 });
  const filename = record.fileName.replace(/["\r\n]/g, "_");
  return new Response(record.fileData, {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
