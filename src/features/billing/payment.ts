import { parseMoney } from "@/lib/money";
export type PaymentInput = {
  method: string;
  secondMethod: string;
  firstAmount: string;
  cashReceived: string;
};
export const initialPayment: PaymentInput = {
  method: "CASH",
  secondMethod: "UPI",
  firstAmount: "",
  cashReceived: "",
};
export function preparePayment(input: PaymentInput, totalPaise: number) {
  const allowed = ["CASH", "UPI", "CARD", "CREDIT"];
  const split = input.method === "SPLIT";
  const first = split ? parseMoney(input.firstAmount) : totalPaise;
  if (first < 0 || first > totalPaise)
    throw new Error("The cash part must be between zero and the bill total.");
  const method = split ? "CASH" : input.method;
  if (!allowed.includes(method) || !allowed.includes(input.secondMethod))
    throw new Error("Choose a payment method.");
  if (split && input.secondMethod === "CASH")
    throw new Error("Choose a different method for the remaining amount.");
  const payments = [{ method, amountPaise: first, reference: "" }];
  if (split)
    payments.push({
      method: input.secondMethod,
      amountPaise: totalPaise - first,
      reference: "",
    });
  const cashDue = method === "CASH" ? first : 0;
  const cashReceived =
    input.cashReceived.trim() && cashDue > 0
      ? parseMoney(input.cashReceived)
      : cashDue;
  if (cashReceived < cashDue)
    throw new Error("Cash received is less than the cash amount due.");
  return {
    payments,
    changePaise: cashReceived - cashDue,
    remainderPaise: totalPaise - first,
  };
}
