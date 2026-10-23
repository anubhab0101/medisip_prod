import { calculateBill } from "../billing/pricing";
import { parseMoney, formatMoney } from "../../lib/money";
import { shopDate } from "../../lib/date";
type Item = {
  reservationId: string;
  batchId: string;
  medicineId: string;
  name: string;
  batchNo: string;
  expiryDate: string;
  available: number;
  unitPricePaise: number;
  gstBasisPoints: number;
};
type Bundle = {
  deviceId: string;
  secret: string;
  name: string;
  day: string;
  shop: {
    name: string;
    address: string;
    phone: string;
    drugLicenseNo: string;
    practice: boolean;
  };
  items: Item[];
};
type Line = { batchId: string; quantity: number; discountBasisPoints?: number };
type Payment = {
  method: "CASH" | "UPI" | "CARD";
  amountPaise: number;
  reference?: string;
};
type Bill = {
  operationId: string;
  lines: Line[];
  totalPaise: number;
  createdAt: string;
  billDiscountPaise?: number;
  payments?: Payment[];
  invoiceNo?: string;
  saleId?: string;
};
type State = {
  bundle: Bundle;
  bills: Bill[];
  closed?: boolean;
  closing?: boolean;
};
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const message = (text: string) => {
  el("status").textContent = text;
};
const opened = new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open("medishop-offline", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("state");
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function read(): Promise<State | undefined> {
  const db = await opened;
  return new Promise((resolve, reject) => {
    const r = db.transaction("state").objectStore("state").get("counter");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function change(
  update: (current: State | undefined) => State,
): Promise<State> {
  const db = await opened;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite"),
      store = tx.objectStore("state"),
      r = store.get("counter");
    let next: State;
    let failure: unknown;
    r.onsuccess = () => {
      try {
        next = update(r.result);
        store.put(next, "counter");
      } catch (e) {
        failure = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(failure ?? tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
let state: State | undefined;
let cart: Line[] = [];
let busy = false;
function left(item: Item, s: State) {
  return (
    item.available -
    s.bills
      .flatMap((b) => b.lines)
      .filter((l) => l.batchId === item.batchId)
      .reduce((n, l) => n + l.quantity, 0)
  );
}
function price(lines: Line[], bundle: Bundle, billDiscountPaise = 0) {
  return calculateBill(
    lines.map((l) => {
      const item = bundle.items.find((i) => i.batchId === l.batchId);
      if (!item) throw new Error("Reserved medicine is unavailable.");
      return {
        unitPricePaise: item.unitPricePaise,
        gstBasisPoints: item.gstBasisPoints,
        quantity: l.quantity,
        discountBasisPoints: l.discountBasisPoints ?? 0,
      };
    }),
    billDiscountPaise,
  );
}
function render() {
  if (!state) {
    message(
      "No counter prepared on this browser. Ask staff to reserve stock from Offline counter while online.",
    );
    el("billing").hidden = true;
    return;
  }
  el("shop").textContent =
    `${state.bundle.shop.name} · ${state.bundle.name}${state.bundle.shop.practice ? " · PRACTICE" : ""}`;
  el("billing").hidden = !!state.closed || !!state.closing;
  const select = el<HTMLSelectElement>("medicine"),
    chosen = select.value;
  select.replaceChildren();
  for (const item of state.bundle.items) {
    const option = document.createElement("option");
    option.value = item.batchId;
    option.textContent = `${item.name} / ${item.batchNo} · ${left(item, state)} left`;
    select.append(option);
  }
  if (chosen) select.value = chosen;
  const area = el("cart");
  area.replaceChildren();
  cart.forEach((line, index) => {
    const p = document.createElement("p");
    p.textContent = `${state!.bundle.items.find((i) => i.batchId === line.batchId)!.name} × ${line.quantity}${line.discountBasisPoints ? ` · ${line.discountBasisPoints / 100}% off` : ""} `;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.onclick = () => {
      cart.splice(index, 1);
      render();
    };
    p.append(remove);
    area.append(p);
  });
  try {
    el("total").textContent = cart.length
      ? `Total ${formatMoney(price(cart, state.bundle, parseMoney(el<HTMLInputElement>("bill-discount").value || "0")).totalPaise)}`
      : "Add a reserved medicine to start.";
  } catch (error) {
    el("total").textContent =
      error instanceof Error ? error.message : "Check discount.";
  }
  el<HTMLButtonElement>("save").disabled =
    busy || !cart.length || !!state.closed;
  const list = el("bills");
  list.replaceChildren();
  for (const bill of [...state.bills].reverse()) {
    const p = document.createElement("p");
    p.textContent = `${bill.invoiceNo ?? `Provisional ${bill.operationId.slice(0, 8)}`} · ${formatMoney(bill.totalPaise)} · ${bill.saleId ? "Synced" : "Waiting to sync"} `;
    const button = document.createElement("button");
    button.textContent = "Print";
    button.onclick = () => printBill(bill);
    p.append(button);
    list.append(p);
  }
  el<HTMLButtonElement>("sync").disabled = busy || !!state.closed;
  el<HTMLButtonElement>("close").disabled =
    busy || !!state.closed || state.bills.some((b) => !b.saleId);
}
function printBill(bill: Bill) {
  if (!state) return;
  const root = el("receipt");
  root.replaceChildren();
  const text = (tag: string, value: string) => {
    const e = document.createElement(tag);
    e.textContent = value;
    root.append(e);
  };
  text("h1", state.bundle.shop.name);
  text("p", state.bundle.shop.address);
  text(
    "p",
    `Phone ${state.bundle.shop.phone} · Licence ${state.bundle.shop.drugLicenseNo}`,
  );
  if (state.bundle.shop.practice) text("h2", "PRACTICE — NOT A REAL SALE");
  text("h2", bill.invoiceNo ?? "PROVISIONAL — AWAITING SYNC");
  text(
    "p",
    `${bill.operationId} · ${new Date(bill.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
  );
  for (const l of bill.lines) {
    const i = state.bundle.items.find((i) => i.batchId === l.batchId)!;
    text(
      "p",
      `${i.name} / ${i.batchNo} / Exp ${i.expiryDate} · ${l.quantity} × ${formatMoney(i.unitPricePaise)}`,
    );
  }
  const totals = price(bill.lines, state.bundle, bill.billDiscountPaise ?? 0);
  text("p", `Discount ${formatMoney(totals.discountPaise)}`);
  text(
    "p",
    `CGST ${formatMoney(totals.cgstPaise)} · SGST ${formatMoney(totals.sgstPaise)} · Round-off ${formatMoney(totals.roundOffPaise)}`,
  );
  text("h2", `Total ${formatMoney(bill.totalPaise)}`);
  for (const payment of bill.payments ?? [
    { method: "CASH", amountPaise: bill.totalPaise },
  ])
    text(
      "p",
      `${payment.method}: ${formatMoney(payment.amountPaise)}${payment.reference ? ` · ${payment.reference}` : ""}`,
    );
  window.print();
}
el("add").onclick = () => {
  try {
    if (!state || state.closed || state.closing)
      throw new Error("No active counter.");
    if (shopDate() !== state.bundle.day)
      throw new Error(
        "Sync and close yesterday's counter before preparing a new day.",
      );
    const batchId = el<HTMLSelectElement>("medicine").value,
      quantity = Number(el<HTMLInputElement>("quantity").value);
    const discountBasisPoints = Math.round(
      Number(el<HTMLInputElement>("line-discount").value || "0") * 100,
    );
    if (
      !Number.isSafeInteger(discountBasisPoints) ||
      discountBasisPoints < 0 ||
      discountBasisPoints > 10000
    )
      throw new Error("Discount must be between 0 and 100%.");
    const item = state.bundle.items.find((i) => i.batchId === batchId);
    const already = cart.find((l) => l.batchId === batchId);
    if (
      !item ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity + (already?.quantity ?? 0) > left(item, state)
    )
      throw new Error("Enter a quantity within the remaining reserved stock.");
    if (item.expiryDate < shopDate())
      throw new Error("This batch has expired.");
    if (already && (already.discountBasisPoints ?? 0) !== discountBasisPoints)
      throw new Error("Remove this medicine before changing its discount.");
    if (already) already.quantity += quantity;
    else cart.push({ batchId, quantity, discountBasisPoints });
    render();
  } catch (e) {
    message(e instanceof Error ? e.message : "Check quantity.");
  }
};
el("clear").onclick = () => {
  cart = [];
  render();
};
el("bill-discount").oninput = () => render();
el("bill-form").onsubmit = async (event) => {
  event.preventDefault();
  if (busy || !cart.length) return;
  busy = true;
  try {
    const lines = cart.map((l) => ({ ...l })),
      operationId = crypto.randomUUID(),
      cash = el<HTMLInputElement>("cash").value,
      billDiscountPaise = parseMoney(
        el<HTMLInputElement>("bill-discount").value || "0",
      );
    const electronic: Payment[] = [];
    for (const method of ["UPI", "CARD"] as const) {
      const key = method.toLowerCase(),
        amountPaise = parseMoney(el<HTMLInputElement>(key).value || "0");
      if (amountPaise) {
        const reference = el<HTMLInputElement>(`${key}-reference`).value.trim();
        if (!reference)
          throw new Error(`Enter the confirmed ${method} reference.`);
        electronic.push({ method, amountPaise, reference });
      }
    }
    if (electronic.length && !el<HTMLInputElement>("payment-confirmed").checked)
      throw new Error(
        "Confirm the UPI/card payment on your payment device first.",
      );
    let changePaise = 0;
    state = await change((current) => {
      if (
        !current ||
        current.closed ||
        current.closing ||
        shopDate() !== current.bundle.day
      )
        throw new Error("This counter is closed or belongs to a previous day.");
      for (const line of lines) {
        const item = current.bundle.items.find(
          (i) => i.batchId === line.batchId,
        );
        if (!item || line.quantity > left(item, current))
          throw new Error("Another tab used this stock. Refresh the counter.");
      }
      const totalPaise = price(
        lines,
        current.bundle,
        billDiscountPaise,
      ).totalPaise;
      const cashDue =
        totalPaise - electronic.reduce((sum, p) => sum + p.amountPaise, 0);
      if (cashDue < 0)
        throw new Error("UPI and card payments exceed the bill total.");
      if (cash && parseMoney(cash) < cashDue)
        throw new Error("Cash received is less than the remaining amount.");
      changePaise = cash ? parseMoney(cash) - cashDue : 0;
      const payments: Payment[] = [...electronic];
      if (cashDue || !payments.length)
        payments.push({ method: "CASH", amountPaise: cashDue });
      return {
        ...current,
        bills: [
          ...current.bills,
          {
            operationId,
            lines,
            totalPaise,
            billDiscountPaise,
            payments,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    });
    cart = [];
    el<HTMLInputElement>("cash").value = "";
    for (const id of [
      "upi",
      "card",
      "upi-reference",
      "card-reference",
      "bill-discount",
      "line-discount",
    ])
      el<HTMLInputElement>(id).value = "";
    el<HTMLInputElement>("payment-confirmed").checked = false;
    message(
      `Provisional bill saved on this device. ${changePaise ? `Return ${formatMoney(changePaise)} cash change. ` : ""}Sync when connected.`,
    );
  } catch (e) {
    message(
      e instanceof Error
        ? e.message
        : "Could not save. Do not clear browser data.",
    );
  } finally {
    busy = false;
    render();
  }
};
async function post(body: unknown) {
  const response = await fetch("/api/offline/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ??
        "Sign in as the staff member who prepared this counter, then retry.",
    );
  return result as { saleId: string; invoiceNo: string; closed?: boolean };
}
el("sync").onclick = async () => {
  if (busy) return;
  busy = true;
  render();
  try {
    state = await read();
    if (!state) throw new Error("Counter not found.");
    for (const bill of state.bills.filter((b) => !b.saleId)) {
      const bundle = state.bundle;
      const result = await post({
        identity: { deviceId: bundle.deviceId, secret: bundle.secret },
        bill: {
          operationId: bill.operationId,
          items: bill.lines.map((l) => ({
            medicineId: bundle.items.find((i) => i.batchId === l.batchId)!
              .medicineId,
            batchId: l.batchId,
            quantity: l.quantity,
            discountBasisPoints: l.discountBasisPoints ?? 0,
          })),
          billDiscountPaise: bill.billDiscountPaise ?? 0,
          payments: bill.payments ?? [
            { method: "CASH", amountPaise: bill.totalPaise },
          ],
        },
      });
      state = await change((current) => {
        if (!current || current.bundle.deviceId !== bundle.deviceId)
          throw new Error("Counter changed during sync.");
        return {
          ...current,
          bills: current.bills.map((b) =>
            b.operationId === bill.operationId
              ? { ...b, saleId: result.saleId, invoiceNo: result.invoiceNo }
              : b,
          ),
        };
      });
    }
    message(
      "All saved bills are synced. Final invoice numbers are shown below.",
    );
  } catch (e) {
    message(
      e instanceof Error
        ? e.message
        : "Connection unavailable. Saved bills remain on this device; retry later.",
    );
  } finally {
    busy = false;
    render();
  }
};
el("close").onclick = async () => {
  if (busy || !state) return;
  if (
    !window.confirm(
      "Have all saved bills synced and all unsold reserved units been counted? Close this counter and release its remaining stock?",
    )
  )
    return;
  busy = true;
  render();
  try {
    state = await change((current) => {
      if (!current || current.bills.some((b) => !b.saleId))
        throw new Error("Sync every saved bill first.");
      return { ...current, closing: true };
    });
    const bundle = state.bundle;
    await post({
      identity: { deviceId: bundle.deviceId, secret: bundle.secret },
      close: true,
    });
    state = await change((current) => ({
      ...current!,
      closed: true,
      closing: false,
    }));
    localStorage.removeItem("medishop.offline.active");
    message(
      "Counter closed. Remaining reserved stock is available online again.",
    );
  } catch (e) {
    message(
      e instanceof Error ? e.message : "Could not close. Reconnect and retry.",
    );
  } finally {
    busy = false;
    render();
  }
};
async function start() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("./sw.js", {
      scope: "/offline-shell/",
    });
    await navigator.serviceWorker.ready;
  }
  const handoff = localStorage.getItem("medishop.offline.handoff");
  if (handoff) {
    const bundle = JSON.parse(handoff) as Bundle;
    state = await change((current) => {
      if (
        current &&
        !current.closed &&
        current.bundle.deviceId !== bundle.deviceId
      )
        throw new Error("An existing counter must be synced and closed first.");
      return current?.bundle.deviceId === bundle.deviceId
        ? current
        : { bundle, bills: [] };
    });
    localStorage.removeItem("medishop.offline.handoff");
  } else state = await read();
  render();
  if (state)
    message(
      state.closed
        ? "This counter is closed."
        : `${navigator.onLine ? "Connected" : "Offline"}. Bills stay on this device until synced.`,
    );
}
void start().catch((e) =>
  message(
    e instanceof Error
      ? e.message
      : "Could not open local storage. Use a normal browser window and allow storage.",
  ),
);
