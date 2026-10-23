export function receiptOrigin(
  raw: string | undefined,
  staffOrigin: string | undefined,
  production = process.env.NODE_ENV === "production" && process.env.LOCAL_PREVIEW !== "true",
) {
  if (!raw || !staffOrigin)
    throw new Error(
      "Configure a separate receipt address before sharing receipts.",
    );
  const receipt = new URL(raw),
    staff = new URL(staffOrigin);
  if (
    receipt.username ||
    receipt.password ||
    receipt.search ||
    receipt.hash ||
    receipt.pathname !== "/"
  )
    throw new Error(
      "Use a receipt origin without a path, query or credentials.",
    );
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(receipt.hostname);
  if (
    receipt.protocol !== "https:" &&
    !(local && !production && receipt.protocol === "http:")
  )
    throw new Error("The receipt address must use HTTPS.");
  if (
    receipt.origin === staff.origin ||
    (production && receipt.hostname === staff.hostname)
  )
    throw new Error(
      "Receipt sharing must use a different hostname from the staff app.",
    );
  return receipt.origin;
}
