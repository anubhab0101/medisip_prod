import "server-only";
import { z } from "zod";
import { ProviderError } from "./smsgate";
import { getBranchProviderConfig, validateProviderConfig } from "@/lib/provider-integrations";
import { ProviderKind } from "@prisma/client";

export function evolutionGoSendingEnabled() {
  return process.env.EVOLUTION_GO_SEND_ENABLED === "true";
}

export type EvolutionConfig = { baseUrl: string; token: string };
async function getConfig(branchId: string, supplied?: EvolutionConfig) {
  if (!evolutionGoSendingEnabled()) {
    throw new ProviderError("WhatsApp sending is disabled.", false);
  }
  const source = supplied ?? await getBranchProviderConfig<EvolutionConfig>(branchId, ProviderKind.EVOLUTION_GO);
  const saved = validateProviderConfig(ProviderKind.EVOLUTION_GO, source) as EvolutionConfig;
  return { url: `${saved.baseUrl.replace(/\/$/, "")}/send/text`, apiKey: saved.token };
}

export function evolutionGoPhoneNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!/^91[6-9]\d{9}$/.test(digits))
    throw new ProviderError(
      "Customer phone must be a valid Indian number with country code.",
      false,
    );
  return digits;
}

const responseSchema = z.object({
  data: z
    .object({
      Info: z.object({ ID: z.string().min(1) }).passthrough().optional(),
      info: z.object({ id: z.string().min(1) }).passthrough().optional(),
      key: z.object({ id: z.string().min(1) }).passthrough().optional(),
    })
    .passthrough(),
});

export async function sendEvolutionGoText(
  input: { branchId: string; phone: string; text: string },
  request: typeof fetch = fetch,
  suppliedConfig?: EvolutionConfig,
) {
  const config = await getConfig(input.branchId, suppliedConfig);
  const number = evolutionGoPhoneNumber(input.phone);
  if (!input.text.trim() || input.text.length > 4096)
    throw new ProviderError("WhatsApp message length is invalid.", false);

  let response: Response;
  try {
    response = await request(config.url, {
      method: "POST",
      headers: {
        apikey: config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number, text: input.text }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ProviderError(
      "WhatsApp send outcome is unknown. Check Evolution Go before retrying.",
      false,
      true,
    );
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get("Retry-After"));
    const retryAfterMs =
      Number.isInteger(seconds) && seconds > 0 && seconds <= 172800
        ? seconds * 1000
        : undefined;
    throw new ProviderError(
      "Evolution Go is rate limiting messages.",
      true,
      false,
      retryAfterMs,
    );
  }
  if (response.status >= 500)
    throw new ProviderError(
      "Evolution Go returned a server error; the send outcome may be unknown.",
      false,
      true,
    );
  if (!response.ok)
    throw new ProviderError(
      `Evolution Go rejected the message (${response.status}).`,
      false,
    );
  try {
    const result = responseSchema.parse(await response.json());
    const id =
      result.data.Info?.ID ?? result.data.info?.id ?? result.data.key?.id;
    if (!id) throw new Error("Message ID missing");
    return { id };
  } catch {
    throw new ProviderError(
      "Evolution Go accepted the request but returned an unreadable response. Check Evolution Go before retrying.",
      false,
      true,
    );
  }
}
