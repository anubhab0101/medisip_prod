import { Role } from "@prisma/client";
export const Permission = {
  DASHBOARD: "dashboard",
  BILL: "bill",
  STOCK_READ: "stock.read",
  STOCK_WRITE: "stock.write",
  MEDICINE_WRITE: "medicine.write",
  CUSTOMER: "customer",
  APPOINTMENT: "appointment",
  REPORT: "report",
  SETTINGS: "settings",
  USERS: "users",
  MESSAGES: "messages",
  RETURN: "return",
  DOCTOR_OWN: "doctor.own",
  PRESCRIPTION: "prescription.review",
} as const;
export type PermissionName = (typeof Permission)[keyof typeof Permission];
const policies: Record<Role, readonly PermissionName[]> = {
  OWNER: Object.values(Permission),
  PHARMACIST: [
    Permission.DASHBOARD,
    Permission.BILL,
    Permission.STOCK_READ,
    Permission.STOCK_WRITE,
    Permission.MEDICINE_WRITE,
    Permission.CUSTOMER,
    Permission.APPOINTMENT,
    Permission.MESSAGES,
    Permission.RETURN,
    Permission.PRESCRIPTION,
  ],
  CASHIER: [
    Permission.DASHBOARD,
    Permission.BILL,
    Permission.STOCK_READ,
    Permission.CUSTOMER,
  ],
  DOCTOR: [Permission.DOCTOR_OWN],
};
export function can(role: Role, permission: PermissionName) {
  return policies[role].includes(permission);
}
