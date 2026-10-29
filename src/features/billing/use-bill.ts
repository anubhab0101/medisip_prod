"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseMoney } from "@/lib/money";
import { draftSchema, type BillDraft } from "./draft";
import { completedDraft } from "./held-actions";
import { checkoutAction, searchCatalog } from "./actions";
import { initialPayment, preparePayment } from "./payment";
import { priceCart } from "./cart";
import type { CartLine } from "./types";
export function useBill(branchId: string, userId: string, loyaltyRate = 0) {
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [prescriptionId, setPrescriptionId] = useState("");
  const [discount, setDiscount] = useState("0");
  const [payment, setPayment] = useState(initialPayment);
  const [doctorName, setDoctor] = useState("");
  const [prescriptionRef, setPrescription] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [draftNotice, setDraftNotice] = useState(false);
  const [ready, setReady] = useState(false);
  const operation = useRef(crypto.randomUUID());
  const router = useRouter();
  const storageKey = `medishop.draft.${branchId}.${userId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw && draftSchema.safeParse(JSON.parse(raw)).success)
        setDraftNotice(true);
    } catch {}
    setReady(true);
  }, [storageKey]);
  const draft: BillDraft = {
    version: 2,
    operationId: operation.current,
    cart,
    loyaltyPoints,
    customerId,
    prescriptionId,
    discount,
    doctorName,
    prescriptionRef,
  };
  useEffect(() => {
    if (!ready || draftNotice) return;
    try {
      if (!cart.length) localStorage.removeItem(storageKey);
      else
        localStorage.setItem(
          storageKey,
          JSON.stringify(
            draftSchema.parse({
              version: 2,
              operationId: operation.current,
              cart,
              loyaltyPoints,
              customerId,
              prescriptionId,
              discount,
              doctorName,
              prescriptionRef,
            }),
          ),
        );
    } catch {
      /* Retain last valid draft during temporary input errors. */
    }
  }, [
    cart,
    loyaltyPoints,
    customerId,
    prescriptionId,
    discount,
    doctorName,
    prescriptionRef,
    ready,
    draftNotice,
    storageKey,
  ]);
  function reset() {
    operation.current = crypto.randomUUID();
    setCart([]);
    setLoyaltyPoints(0);
    setCustomerId("");
    setPrescriptionId("");
    setDiscount("0");
    setDoctor("");
    setPrescription("");
    setPayment(initialPayment);
    setError("");
    setDraftNotice(false);
    localStorage.removeItem(storageKey);
  }
  async function restore(saved: BillDraft) {
    const parsed = draftSchema.parse(saved);
    const saleId = await completedDraft(parsed.operationId);
    if (saleId) {
      localStorage.removeItem(storageKey);
      router.push(`/bills/${saleId}`);
      return;
    }
    const restored = await Promise.all(
      parsed.cart.map(async (line) => {
        const medicine = (await searchCatalog(line.medicine.id)).find(
          (m) => m.id === line.medicine.id,
        );
        if (!medicine)
          throw new Error("A saved medicine is no longer available.");
        return { ...line, medicine };
      }),
    );
    operation.current = parsed.operationId;
    setCart(restored);
    setCustomerId(parsed.customerId);
    setPrescriptionId(parsed.prescriptionId);
    setLoyaltyPoints(parsed.loyaltyPoints);
    setDiscount(parsed.discount);
    setDoctor(parsed.doctorName);
    setPrescription(parsed.prescriptionRef);
    setPayment(initialPayment);
    setDraftNotice(false);
  }
  async function restoreDraft() {
    setPending(true);
    setError("");
    try {
      await restore(
        draftSchema.parse(JSON.parse(localStorage.getItem(storageKey) || "{}")),
      );
    } catch {
      setError(
        "Could not restore the draft. Check your connection and whether its medicines are still available.",
      );
    } finally {
      setPending(false);
    }
  }
  let totals: ReturnType<typeof priceCart> | undefined;
  let calculationError = "";
  try {
    if (cart.length)
      totals = priceCart(
        cart,
        parseMoney(discount) + loyaltyPoints * loyaltyRate,
      );
  } catch (e) {
    calculationError =
      e instanceof Error ? e.message : "Check quantities and discount.";
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending || draftNotice || !totals) return;
    let payments: ReturnType<typeof preparePayment>["payments"];
    try {
      payments = preparePayment(payment, totals.totalPaise).payments;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check payment amounts.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await checkoutAction({
        operationId: operation.current,
        items: cart.map((l) => ({
          medicineId: l.medicine.id,
          batchId: l.batchId || undefined,
          quantity: l.quantity,
          discountBasisPoints: l.discountBasisPoints,
        })),
        customerId: customerId || undefined,
        prescriptionId: prescriptionId || undefined,
        loyaltyPoints,
        billDiscountPaise: parseMoney(discount),
        doctorName,
        prescriptionRef,
        payments,
      });
      if (result.error) setError(result.error);
      else if (result.id) {
        localStorage.removeItem(storageKey);
        router.push(`/bills/${result.id}`);
      }
    } catch {
      setError(
        "Couldn’t confirm the bill. Retry this same bill to avoid a duplicate.",
      );
    } finally {
      setPending(false);
    }
  }
  return {
    cart,
    setCart,
    loyaltyPoints,
    setLoyaltyPoints,
    customerId,
    setCustomerId,
    prescriptionId,
    setPrescriptionId,
    discount,
    setDiscount,
    payment,
    setPayment,
    doctorName,
    setDoctor,
    prescriptionRef,
    setPrescription,
    error,
    pending,
    setPending,
    draftNotice,
    restoreDraft,
    reset,
    restore,
    draft,
    totals,
    calculationError,
    save,
  };
}
