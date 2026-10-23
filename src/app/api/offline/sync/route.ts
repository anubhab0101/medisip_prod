import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkout } from "@/features/billing/service";
import { closeOffline, offlineIdentity } from "@/features/offline/service";
import { friendlyError } from "@/lib/errors";
import { db } from "@/server/db";
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (
    request.headers.get("origin") !==
    new URL(process.env.APP_URL ?? request.url).origin
  )
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403, headers },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 64000)
    return NextResponse.json(
      { error: "Request is too large." },
      { status: 413, headers },
    );
  try {
    const text = await request.text();
    if (text.length > 64000) throw new Error("Request is too large.");
    const raw = z
      .object({
        identity: offlineIdentity,
        close: z.boolean().optional(),
        bill: z.unknown().optional(),
      })
      .parse(JSON.parse(text));
    if (raw.close) {
      await closeOffline({ ...raw.identity, confirmed: true });
      return NextResponse.json({ closed: true }, { headers });
    }
    const saleId = await checkout(raw.bill, raw.identity);
    const sale = await db().sale.findUniqueOrThrow({
      where: { id: saleId },
      select: { invoiceNo: true, totalPaise: true },
    });
    return NextResponse.json({ saleId, ...sale }, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyError(error) },
      { status: 400, headers },
    );
  }
}
