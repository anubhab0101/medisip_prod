import "server-only";

export interface SecretConfig {
  name: string;
  required: boolean;
  minLength?: number;
  rotateAfterDays?: number;
}

interface CachedSecret {
  value: string;
  fetchedAt: number;
  ttl: number;
}

const secretCache = new Map<string, CachedSecret>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Secret Manager - abstraction for fetching secrets from various sources.
 * Currently supports environment variables with caching.
 * Can be extended for AWS Secrets Manager, HashiCorp Vault, etc.
 */
export class SecretManager {
  private static instance: SecretManager;
  private customFetcher?: (name: string) => Promise<string | null>;

  private constructor() {}

  static getInstance(): SecretManager {
    if (!SecretManager.instance) {
      SecretManager.instance = new SecretManager();
    }
    return SecretManager.instance;
  }

  /**
   * Register a custom secret fetcher (e.g., for AWS Secrets Manager, Vault)
   * @param fetcher Async function that returns secret value or null
   */
  setCustomFetcher(fetcher: (name: string) => Promise<string | null>) {
    this.customFetcher = fetcher;
  }

  /**
   * Get a secret value with caching
   * @param config Secret configuration
   * @returns Secret value
   * @throws If required secret is not found
   */
  async getSecret(config: SecretConfig): Promise<string> {
    const cacheKey = config.name;
    const cached = secretCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < cached.ttl) {
      return cached.value;
    }

    let value: string | null = null;

    // Try custom fetcher first (e.g., Secrets Manager)
    if (this.customFetcher) {
      try {
        value = await this.customFetcher(config.name);
      } catch (error) {
        console.warn(`Custom secret fetcher failed for ${config.name}:`, error);
      }
    }

    // Fallback to environment variable
    if (!value) {
      value = process.env[config.name] ?? null;
    }

    if (!value) {
      if (config.required) {
        throw new Error(`Required secret "${config.name}" is not configured`);
      }
      return "";
    }

    if (config.minLength && value.length < config.minLength) {
      throw new Error(`Secret "${config.name}" must be at least ${config.minLength} characters`);
    }

    // Check rotation policy
    if (config.rotateAfterDays) {
      const ageDays = (now - (cached?.fetchedAt ?? now)) / (1000 * 60 * 60 * 24);
      if (ageDays > config.rotateAfterDays) {
        console.warn(`Secret "${config.name}" is older than ${config.rotateAfterDays} days - rotation recommended`);
      }
    }

    secretCache.set(cacheKey, {
      value,
      fetchedAt: now,
      ttl: DEFAULT_TTL_MS,
    });

    return value;
  }

  /**
   * Invalidate cache for a secret (call after rotation)
   */
  invalidateSecret(name: string): void {
    secretCache.delete(name);
  }

  /**
   * Clear all cached secrets
   */
  clearCache(): void {
    secretCache.clear();
  }
}

// Predefined secret configurations
export const SECRET_CONFIGS = {
  // SMS Gate credentials
  SMS_GATE_USERNAME: { name: "SMSGATE_USERNAME", required: true, minLength: 1 },
  // SMSGate accepts account credentials through Basic Auth; do not impose a
  // local length rule that can reject valid provider-issued passwords.
  SMS_GATE_PASSWORD: { name: "SMSGATE_PASSWORD", required: true, rotateAfterDays: 90 },
  SMS_GATE_DEVICE_ID: { name: "SMSGATE_DEVICE_ID", required: false },

  // Evolution Go (WhatsApp)
  EVOLUTION_GO_BASE_URL: { name: "EVOLUTION_GO_BASE_URL", required: false },
  EVOLUTION_GO_INSTANCE_TOKEN: { name: "EVOLUTION_GO_INSTANCE_TOKEN", required: false, minLength: 32, rotateAfterDays: 90 },

  // Authentication
  AUTH_SECRET: { name: "AUTH_SECRET", required: true, minLength: 32, rotateAfterDays: 90 },
  RECEIPT_TOKEN_SECRET: { name: "RECEIPT_TOKEN_SECRET", required: true, minLength: 32, rotateAfterDays: 90 },
  JOB_SIGNATURE_KEY: { name: "JOB_SIGNATURE_KEY", required: true, minLength: 32, rotateAfterDays: 90 },

  // Database
  DATABASE_URL: { name: "DATABASE_URL", required: true, minLength: 1 },

  // Backup
  BACKUP_KEY: { name: "BACKUP_KEY", required: false, minLength: 44 }, // base64 encoded 32 bytes
  BACKUP_DIRECTORY: { name: "BACKUP_DIRECTORY", required: false },
} as const satisfies Record<string, SecretConfig>;

/**
 * Get a secret by predefined config key
 */
export async function getSecret(key: keyof typeof SECRET_CONFIGS): Promise<string> {
  return SecretManager.getInstance().getSecret(SECRET_CONFIGS[key]);
}

/**
 * Get SMS Gate configuration with secret management
 */
export async function getSmsGateConfig() {
  const manager = SecretManager.getInstance();
  const [username, password] = await Promise.all([
    manager.getSecret(SECRET_CONFIGS.SMS_GATE_USERNAME),
    manager.getSecret(SECRET_CONFIGS.SMS_GATE_PASSWORD),
  ]);

  const base = process.env.SMSGATE_URL ?? "https://api.sms-gate.app/3rdparty/v1";
  if (new URL(base).protocol !== "https:") {
    throw new Error("SMS endpoint must use HTTPS.");
  }

  return {
    base: base.replace(/\/$/, ""),
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    deviceId: process.env.SMSGATE_DEVICE_ID,
  };
}

/**
 * Get Evolution Go configuration with secret management
 */
export async function getEvolutionGoConfig() {
  const manager = SecretManager.getInstance();
  const token = await manager.getSecret(SECRET_CONFIGS.EVOLUTION_GO_INSTANCE_TOKEN);
  const base = process.env.EVOLUTION_GO_BASE_URL;

  if (!token || !base) {
    throw new Error("WhatsApp sending is not configured.");
  }

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("Evolution Go base URL is invalid.");
  }

  const privateHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname.endsWith(".internal") ||
    process.env.EVOLUTION_GO_ALLOW_PRIVATE_HTTP === "true";

  if (
    !["http:", "https:"].includes(url.protocol) ||
    (url.protocol !== "https:" && !privateHost) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Evolution Go must use HTTPS or a private local network URL.");
  }

  return {
    url: `${url.origin}${url.pathname.replace(/\/$/, "")}/send/text`,
    apiKey: token,
  };
}
