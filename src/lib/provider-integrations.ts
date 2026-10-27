import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ProviderKind } from "@prisma/client";
import { db } from "@/server/db";

function encryptionKey() {
  const encoded = process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || encoded.trim() !== key.toString("base64"))
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be a base64 encoded 32-byte key.");
  return key;
}

export function encryptProviderConfig(branchId: string, provider: ProviderKind, config: object) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${branchId}:${provider}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

export function decryptProviderConfig<T>(branchId: string, provider: ProviderKind, encrypted: string): T {
  const [ivText, tagText, dataText, ...extra] = encrypted.split(".");
  if (!ivText || !tagText || !dataText || extra.length) throw new Error("Provider configuration is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64"));
  decipher.setAAD(Buffer.from(`${branchId}:${provider}`));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataText, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as T;
}

export async function branchProviderEnabled(branchId: string, provider: ProviderKind) {
  const row = await db().providerIntegration.findUnique({
    where: { branchId_provider: { branchId, provider } },
    select: { enabled: true, encryptedConfig: true },
  });
  if (!row?.enabled || !row.encryptedConfig) return false;
  try {
    validateProviderConfig(provider, decryptProviderConfig(branchId, provider, row.encryptedConfig));
    return true;
  } catch { return false; }
}

export async function getBranchProviderConfig<T>(branchId: string, provider: ProviderKind): Promise<T> {
  const row = await db().providerIntegration.findUnique({
    where: { branchId_provider: { branchId, provider } },
    select: { enabled: true, encryptedConfig: true },
  });
  if (!row?.enabled) throw new Error(`${provider === ProviderKind.SMSGATE ? "SMS" : "WhatsApp"} is not enabled for this shop.`);
  try { return decryptProviderConfig<T>(branchId, provider, row.encryptedConfig); }
  catch { throw new Error("Shop provider configuration cannot be decrypted. Ask the platform admin to check encryption settings."); }
}

export function validateProviderConfig(provider: ProviderKind, raw: unknown) {
  if (!raw || typeof raw !== "object") throw new Error("Provider settings are incomplete.");
  const data = raw as Record<string, unknown>;
  if (provider === ProviderKind.SMSGATE) {
    const username = String(data.username ?? "").trim();
    const password = String(data.password ?? "");
    const deviceId = String(data.deviceId ?? "").trim();
    if (!username || !password) throw new Error("SMSGate username and password are required.");
    if (username.length > 191 || password.length > 512 || deviceId.length > 191) throw new Error("SMSGate settings are too long.");
    return { username, password, deviceId };
  }
  const baseUrl = String(data.baseUrl ?? "").trim().replace(/\/$/, "");
  const token = String(data.token ?? "");
  let parsed: URL;
  if (baseUrl.length > 512) throw new Error("Evolution Go URL is too long.");
  try { parsed = new URL(baseUrl); } catch { throw new Error("Evolution Go URL is invalid."); }
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if ((!(["https:", "http:"].includes(parsed.protocol)) || (parsed.protocol !== "https:" && !localHttp)) || parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new Error("Evolution Go must use HTTPS (HTTP is allowed only on localhost for development).");
  if (token.length < 16 || token.length > 2048) throw new Error("Evolution Go token is missing or invalid.");
  return { baseUrl, token };
}

export function generateIntegrationEncryptionKey() { return randomBytes(32).toString("base64"); }
