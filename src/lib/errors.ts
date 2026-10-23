export class BusinessError extends Error {}
export function friendlyError(error: unknown): string {
  if (error instanceof BusinessError) return error.message;
  return "We couldn’t save that. Check your connection and try again.";
}
