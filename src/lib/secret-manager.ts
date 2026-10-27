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
