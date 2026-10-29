"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import { transaction } from "@/server/transaction";
import { saveResult, text } from "@/server/forms";
import type { FormState } from "@/components/shared/action-form";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

function validFile(type: string, bytes: Uint8Array) {
  if (type === "application/pdf")
    return Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (type === "image/png")
    return Buffer.from(bytes.subarray(0, 8)).toString("hex") ===
      "89504e470d0a1a0a";
  return false;
}

export async function uploadPrescriptionAction(
  _state: FormState,
  form: FormData,
) {
  return saveResult(async () => {
    const ctx = await context(Permission.PRESCRIPTION);
    const doctorName = z.string().trim().min(1).max(150).parse(text(form, "doctorName"));
    const reference = z.string().trim().min(1).max(200).parse(text(form, "reference"));
    const customerId = z.string().min(1).max(191).parse(text(form, "customerId"));
    const rawFile = form.get("file");
    if (!(rawFile instanceof File) || rawFile.size < 1 || rawFile.size > MAX_FILE_BYTES)
      throw new BusinessError("Choose a prescription PDF or image up to 2 MB.");
    if (!allowedTypes.has(rawFile.type))
      throw new BusinessError("Only PDF, JPEG or PNG prescriptions are accepted.");
    const bytes = new Uint8Array(await rawFile.arrayBuffer());
    if (!validFile(rawFile.type, bytes))
      throw new BusinessError("The selected file does not match its file type.");
    if (!(await db().customer.findFirst({
      where: { id: customerId, branchId: ctx.branch.id, active: true },
      select: { id: true },
    }))) throw new BusinessError("Choose a customer from this shop.");
    const id = randomUUID();
    await transaction(async (tx) => {
      await tx.prescription.create({ data: {
        id,
        branchId: ctx.branch.id,
        customerId,
        doctorName,
        reference,
        fileName: rawFile.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 255) || "prescription",
        mimeType: rawFile.type,
        fileData: bytes,
        uploadedBy: ctx.user.id,
      } });
      await tx.auditLog.create({ data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: "PRESCRIPTION_UPLOADED",
        entity: "Prescription",
        entityId: id,
        after: { customerId, doctorName, reference, status: "PENDING" },
      } });
    });
    return id;
  }, ["/prescriptions"], "Prescription uploaded for pharmacist review.");
}

export async function reviewPrescriptionAction(
  _state: FormState,
  form: FormData,
) {
  return saveResult(async () => {
    const ctx = await context(Permission.PRESCRIPTION);
    const id = z.string().min(1).max(191).parse(text(form, "id"));
    const status = z.enum(["APPROVED", "REJECTED"]).parse(text(form, "status"));
    const reviewNote = z.string().trim().max(500).parse(text(form, "reviewNote"));
    await transaction(async (tx) => {
      const current = await tx.prescription.findFirst({ where: { id, branchId: ctx.branch.id } });
      if (!current || current.status !== "PENDING")
        throw new BusinessError("This prescription has already been reviewed or is unavailable.");
      await tx.prescription.update({
        where: { id },
        data: { status, reviewNote, reviewedBy: ctx.user.id, reviewedAt: new Date() },
      });
      await tx.auditLog.create({ data: {
        branchId: ctx.branch.id,
        userId: ctx.user.id,
        action: `PRESCRIPTION_${status}`,
        entity: "Prescription",
        entityId: id,
        before: { status: current.status },
        after: { status, reviewNote },
      } });
    });
    return id;
  }, ["/prescriptions"], "Prescription review saved.");
}
