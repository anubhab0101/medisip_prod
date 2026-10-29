import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function signingKey(): string {
  const key = process.env.JOB_SIGNATURE_KEY;
  if (!key || key.length < 32) {
    throw new Error("JOB_SIGNATURE_KEY must be set and at least 32 characters");
  }
  return key;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

export function signJobPayload(payload: unknown): string {
  const data = JSON.stringify(canonicalize(payload));
  return createHmac("sha256", signingKey()).update(data).digest("base64url");
}

export function verifyJobSignature(payload: unknown, signature: string): boolean {
  const expected = signJobPayload(payload);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function createSignedJob<T extends Record<string, unknown>>(
  payload: T,
): T & { _sig: string } {
  return { ...payload, _sig: signJobPayload(payload) };
}

export function validateSignedJob<T extends Record<string, unknown>>(
  job: T & { _sig?: string },
): job is T & { _sig: string } {
  if (!job._sig) return false;
  const { _sig, ...payload } = job;
  return verifyJobSignature(payload, _sig);
}
