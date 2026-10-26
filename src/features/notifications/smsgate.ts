import { z } from "zod";
import { getSmsGateConfig } from "@/lib/secret-manager";
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
async function getConfig() {
  return getSmsGateConfig();
}
export async function smsStatus(
  id: string,
  request: typeof fetch = fetch,
): Promise<SmsResult | null> {
  const { base, authorization } = await getConfig();
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
  input: { id: string; phone: string; body: string },
  request: typeof fetch = fetch,
): Promise<SmsResult> {
  if (process.env.SMS_SEND_ENABLED !== "true")
    throw new ProviderError("Live SMS sending is disabled.", false);
  const { base, authorization } = await getConfig();
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
        deviceId: process.env.SMSGATE_DEVICE_ID || undefined,
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
    const existing = await smsStatus(input.id, request);
    if (existing) return existing;
    throw new ProviderError(
      "SMS request already exists; verify its status.",
      false,
      true,
    );
  }
  if (!response.ok)
    throw new ProviderError(
      `SMS provider rejected the request (${response.status}).`,
      response.status === 429 || response.status >= 500,
    );
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
