import { z } from "zod";
import { getBranchProviderConfig, validateProviderConfig } from "@/lib/provider-integrations";
import { ProviderKind } from "@prisma/client";
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly uncertain = false,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}
const resultSchema = z.object({
  id: z.string(),
  state: z.enum([
    "Pending",
    "Processed",
    "Sent",
    "Delivered",
    "Failed",
    "Cancelled",
    "Cancelling",
  ]),
});
export type SmsResult = z.infer<typeof resultSchema>;
export type SmsConfig = { username: string; password: string; deviceId?: string; baseUrl?: string };
async function safeProviderRejection(response: Response, phone: string) {
  const payload: unknown = await response.json().catch(() => null);
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const message = typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "";
  if (!message) return "";
  return message
    .replace(/\+?\d[\d\s()-]{8,}\d/g, (value) => `***${value.replace(/\D/g, "").slice(-4)}`)
    .replaceAll(phone, `***${phone.replace(/\D/g, "").slice(-4)}`)
    .replace(/[\r\n\t]/g, " ")
    .slice(0, 160);
}
async function getConfig(branchId: string, supplied?: SmsConfig) {
  const source = supplied ?? await getBranchProviderConfig<SmsConfig>(branchId, ProviderKind.SMSGATE);
  const saved = validateProviderConfig(ProviderKind.SMSGATE, source);
  return {
    base: (saved.baseUrl ?? "https://api.sms-gate.app/3rdparty/v1").replace(/\/$/, ""),
    authorization: `Basic ${Buffer.from(`${saved.username}:${saved.password}`).toString("base64")}`,
    deviceId: saved.deviceId,
  };
}
export async function smsStatus(
  id: string,
  branchId: string,
  request: typeof fetch = fetch,
  suppliedConfig?: SmsConfig,
): Promise<SmsResult | null> {
  const { base, authorization } = await getConfig(branchId, suppliedConfig);
  const response = await request(`${base}/messages/${encodeURIComponent(id)}`, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new ProviderError("SMS status is temporarily unavailable.", true);
  return resultSchema.parse(await response.json());
}
export async function sendSms(
  input: { id: string; branchId: string; phone: string; body: string },
  request: typeof fetch = fetch,
  suppliedConfig?: SmsConfig,
): Promise<SmsResult> {
  if (process.env.SMS_SEND_ENABLED !== "true")
    throw new ProviderError("Live SMS sending is disabled.", false);
  const { base, authorization, deviceId } = await getConfig(input.branchId, suppliedConfig);
  let response: Response;
  try {
    response = await request(`${base}/messages`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: input.id,
        textMessage: { text: input.body },
        phoneNumbers: [input.phone],
        deviceId: deviceId || undefined,
        withDeliveryReport: true,
        ttl: 86400,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ProviderError(
      "SMS submission outcome is unknown. Check provider status before retrying.",
      false,
      true,
    );
  }
  if (response.status === 409) {
    const existing = await smsStatus(input.id, input.branchId, request, suppliedConfig);
    if (existing) return existing;
    throw new ProviderError(
      "SMS request already exists; verify its status.",
      false,
      true,
    );
  }
  if (!response.ok) {
    const detail = await safeProviderRejection(response, input.phone);
    throw new ProviderError(
      `SMS provider rejected the request (${response.status}).${detail ? ` ${detail}` : ""}`,
      response.status === 429 || response.status >= 500,
    );
  }
  try {
    return resultSchema.parse(await response.json());
  } catch {
    throw new ProviderError(
      "SMS was accepted but its status could not be read.",
      false,
      true,
    );
  }
}
