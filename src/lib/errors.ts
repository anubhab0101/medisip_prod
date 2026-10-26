export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}
const SAFE_ERROR_CODES = new Set([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "PERMISSION_DENIED",
  "CONFLICT",
  "RATE_LIMITED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "EXPIRED",
  "UNAVAILABLE",
]);
export function friendlyError(error: unknown): string {
  if (error instanceof BusinessError) {
    // Only expose messages for known safe error codes
    if (error.code && SAFE_ERROR_CODES.has(error.code)) {
      return error.message;
    }
    // Generic message for unknown/internal errors
    return "We couldn't complete that action. Please try again.";
  }
  if (error instanceof Error) {
    // Log full error server-side for debugging
    console.error("Unexpected error:", error.message, error.stack);
  }
  return "We couldn't save that. Check your connection and try again.";
}
export function logError(context: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`[${context}]`, error.message, error.stack);
  } else {
    console.error(`[${context}]`, error);
  }
}
