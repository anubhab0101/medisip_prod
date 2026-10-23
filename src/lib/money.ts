/** Currency values and rates are integers; rates use basis points (100 = 1%). */
export function integer(value: number, name = "Value"): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative safe integer`);
  return value;
}
export function roundedRatio(numerator: bigint, denominator: bigint): number {
  if (numerator < 0n || denominator <= 0n) throw new Error("Invalid ratio");
  return integer(Number((numerator + denominator / 2n) / denominator));
}
export function parseMoney(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter an amount with up to two decimal places");
  const [whole, fraction = ""] = value.split(".");
  return integer(
    Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))),
  );
}
export function formatMoney(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new Error("Invalid amount");
  const magnitude = BigInt(paise < 0 ? -paise : paise);
  return `${paise < 0 ? "−" : ""}₹${(magnitude / 100n).toLocaleString("en-IN")}.${String(magnitude % 100n).padStart(2, "0")}`;
}
