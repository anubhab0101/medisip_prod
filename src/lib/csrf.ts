import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const CSRF_COOKIE_NAME = "medishop.csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_BYTES = 32;
const CSRF_MAX_AGE = 60 * 60 * 24; // 24 hours

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function generateCsrfToken(): Promise<string> {
  const token = randomBytes(CSRF_TOKEN_BYTES).toString("base64url");
  const hashed = hashToken(token);
  const jar = await cookies();
  jar.set(CSRF_COOKIE_NAME, hashed, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CSRF_MAX_AGE,
  });
  return token;
}

export async function validateCsrfToken(
  requestToken: string | null,
): Promise<boolean> {
  if (!requestToken) return false;
  const jar = await cookies();
  const cookieToken = jar.get(CSRF_COOKIE_NAME)?.value;
  if (!cookieToken) return false;
  try {
    return timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(hashToken(requestToken)),
    );
  } catch {
    return false;
  }
}

export async function getCsrfTokenFromRequest(
  request: Request,
): Promise<string | null> {
  // Check header first
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken) return headerToken;
  // Check form data for multipart/form-data
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.clone().formData();
      return formData.get(CSRF_HEADER_NAME) as string | null;
    } catch {
      return null;
    }
  }
  return null;
}

export function csrfHeaderName(): string {
  return CSRF_HEADER_NAME;
}

export function csrfCookieName(): string {
  return CSRF_COOKIE_NAME;
}