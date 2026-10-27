import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderKind } from "@prisma/client";
import { decryptProviderConfig, encryptProviderConfig, validateProviderConfig } from "@/lib/provider-integrations";
vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

describe("shop provider configuration", () => {
  it("encrypts secrets and binds ciphertext to its shop and provider", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const raw = { username: "shop-user", password: "private-password", deviceId: "device" };
    const encrypted = encryptProviderConfig("shop-a", ProviderKind.SMSGATE, raw);
    expect(encrypted).not.toContain(raw.password);
    expect(decryptProviderConfig("shop-a", ProviderKind.SMSGATE, encrypted)).toEqual(raw);
    expect(() => decryptProviderConfig("shop-b", ProviderKind.SMSGATE, encrypted)).toThrow();
  });

  it("rejects an absent or malformed encryption key", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "wrong");
    expect(() => encryptProviderConfig("shop-a", ProviderKind.SMSGATE, { username: "a" })).toThrow("32-byte key");
  });

  it("validates SMSGate and prevents public insecure Evolution Go endpoints", () => {
    expect(validateProviderConfig(ProviderKind.SMSGATE, { username: "u", password: "p" })).toMatchObject({ username: "u", password: "p" });
    expect(() => validateProviderConfig(ProviderKind.EVOLUTION_GO, { baseUrl: "http://public.example", token: "long-enough-token-123456" })).toThrow("HTTPS");
    expect(validateProviderConfig(ProviderKind.EVOLUTION_GO, { baseUrl: "https://wa.example", token: "long-enough-token-123456" })).toMatchObject({ baseUrl: "https://wa.example", token: "long-enough-token-123456" });
  });
});
