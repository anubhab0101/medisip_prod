import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendEvolutionGoText,
  evolutionGoPhoneNumber,
} from "../src/features/notifications/evolution-go";
import { SecretManager } from "@/lib/secret-manager";
vi.mock("server-only", () => ({}));

const names = [
  "EVOLUTION_GO_SEND_ENABLED",
  "EVOLUTION_GO_BASE_URL",
  "EVOLUTION_GO_INSTANCE_TOKEN",
  "EVOLUTION_GO_ALLOW_PRIVATE_HTTP",
] as const;
const original = Object.fromEntries(
  names.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  SecretManager.getInstance().clearCache();
});

afterEach(() => {
  for (const key of names) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  SecretManager.getInstance().clearCache();
  vi.restoreAllMocks();
});

function configure() {
  process.env.EVOLUTION_GO_SEND_ENABLED = "true";
  process.env.EVOLUTION_GO_BASE_URL = "https://evolution-go.example.test";
  process.env.EVOLUTION_GO_INSTANCE_TOKEN = "test-only-key-32-chars-minimum-length";
  process.env.EVOLUTION_GO_ALLOW_PRIVATE_HTTP = "false";
}

describe("Evolution Go provider", () => {
  it("requires the feature flag and complete server configuration", () => {
    delete process.env.EVOLUTION_GO_SEND_ENABLED;
    process.env.EVOLUTION_GO_BASE_URL = "https://evolution-go.example.test";
    process.env.EVOLUTION_GO_INSTANCE_TOKEN = "test-only-key-32-chars-minimum-length";
    return expect(
      sendEvolutionGoText({ phone: "+919876543210", text: "test" }),
    ).rejects.toThrow("WhatsApp sending is disabled.");
  });

  it("normalizes Indian mobile numbers for Evolution Go", () => {
    expect(evolutionGoPhoneNumber("+91 98765-43210")).toBe("919876543210");
    expect(() => evolutionGoPhoneNumber("9876543210")).toThrow(
      "valid Indian number with country code",
    );
  });

  it("uses Evolution Go's authenticated send-text endpoint", async () => {
    configure();
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { Info: { ID: "wa-message-1" } } }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    const result = await sendEvolutionGoText(
      { phone: "+919876543210", text: "Bill ready" },
      request,
    );
    expect(request).toHaveBeenCalledWith(
      "https://evolution-go.example.test/send/text",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "test-only-key-32-chars-minimum-length" }),
        body: JSON.stringify({ number: "919876543210", text: "Bill ready" }),
      }),
    );
    expect(result).toEqual({ id: "wa-message-1" });
  });

  it("refuses insecure public Evolution Go URLs", async () => {
    configure();
    process.env.EVOLUTION_GO_BASE_URL = "http://evolution-go.example.test";
    await expect(
      sendEvolutionGoText({ phone: "+919876543210", text: "test" }),
    ).rejects.toThrow("HTTPS or a private local network URL");
  });

  it("allows HTTP for an explicitly configured private Render hostname", async () => {
    configure();
    process.env.EVOLUTION_GO_BASE_URL = "http://evolution-go-2j3e:2785";
    process.env.EVOLUTION_GO_ALLOW_PRIVATE_HTTP = "true";
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { Info: { ID: "wa-message-1" } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await expect(
      sendEvolutionGoText({ phone: "+919876543210", text: "test" }, request),
    ).resolves.toEqual({ id: "wa-message-1" });
  });

  it("preserves Evolution Go Retry-After delays", async () => {
    configure();
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: "rate limited" }),
          { status: 429, headers: { "Retry-After": "3600" } },
        ),
    );
    await expect(
      sendEvolutionGoText({ phone: "+919876543210", text: "test" }, request),
    ).rejects.toMatchObject({ retryable: true, retryAfterMs: 3600000 });
  });
});
