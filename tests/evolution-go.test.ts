import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sendEvolutionGoText,
  evolutionGoPhoneNumber,
} from "../src/features/notifications/evolution-go";
vi.mock("server-only", () => ({}));

const names = [
  "EVOLUTION_GO_SEND_ENABLED",
] as const;
const original = Object.fromEntries(
  names.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of names) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function configure() {
  process.env.EVOLUTION_GO_SEND_ENABLED = "true";
}
const shop = "shop-a";
const config = { baseUrl: "https://evolution-go.example.test", token: "test-only-key-32-chars-minimum-length" };

describe("Evolution Go provider", () => {
  it("requires the feature flag and complete server configuration", () => {
    delete process.env.EVOLUTION_GO_SEND_ENABLED;
    return expect(
      sendEvolutionGoText({ branchId: shop, phone: "+919876543210", text: "test" }),
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
      { branchId: shop, phone: "+919876543210", text: "Bill ready" },
      request,
      config,
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
    await expect(
      sendEvolutionGoText({ branchId: shop, phone: "+919876543210", text: "test" }, fetch, { baseUrl: "http://evolution-go.example.test", token: config.token }),
    ).rejects.toThrow("HTTPS");
  });

  it("allows HTTP for an explicitly configured private Render hostname", async () => {
    configure();
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { Info: { ID: "wa-message-1" } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await expect(
      sendEvolutionGoText({ branchId: shop, phone: "+919876543210", text: "test" }, request, { baseUrl: "http://localhost:8080", token: config.token }),
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
      sendEvolutionGoText({ branchId: shop, phone: "+919876543210", text: "test" }, request, config),
    ).rejects.toMatchObject({ retryable: true, retryAfterMs: 3600000 });
  });
});
