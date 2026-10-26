import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const JOB_SIGNATURE_KEY = process.env.JOB_SIGNATURE_KEY;
if (!JOB_SIGNATURE_KEY || JOB_SIGNATURE_KEY.length < 32) {
  throw new Error("JOB_SIGNATURE_KEY must be set and at least 32 characters");
}
const KEY: string = JOB_SIGNATURE_KEY;

export function signJobPayload(payload: unknown): string {
  const data = JSON.stringify(payload);
  return createHmac("sha256", KEY).update(data).digest("base64url");
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