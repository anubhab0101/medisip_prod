import { z } from "zod";
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly uncertain = false,
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
function configuration() {
  const base =
    process.env.SMSGATE_URL ?? "https://api.sms-gate.app/3rdparty/v1";
  if (new URL(base).protocol !== "https:")
    throw new ProviderError("SMS endpoint must use HTTPS.", false);
  const user = process.env.SMSGATE_USERNAME;
  const password = process.env.SMSGATE_PASSWORD;
  if (!user || !password)
    throw new ProviderError("SMS account is not configured.", false);
  return {
    base: base.replace(/\/$/, ""),
    authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
  };
}
export async function smsStatus(
  id: string,
  request: typeof fetch = fetch,
): Promise<SmsResult | null> {
  const { base, authorization } = configuration();
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
  const { base, authorization } = configuration();
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
