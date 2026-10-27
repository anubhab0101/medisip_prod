import "server-only";
import { auth } from "@/auth";
import { db } from "@/server/db";
import { redirect } from "next/navigation";

export function platformAdminEmails(value = process.env.PLATFORM_ADMIN_EMAILS ?? "") {
  return new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export async function assertPlatformAdmin() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/login");
  const user = await db().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, active: true, sessionVersion: true, mustChangePassword: true },
  });
  if (!user?.active || user.sessionVersion !== session.user.sessionVersion) redirect("/login");
  if (!platformAdminEmails().has(user.email.toLowerCase()) || user.email.toLowerCase() !== session.user.email.toLowerCase()) throw new Error("Platform administrator access required.");
  if (user.mustChangePassword) redirect("/password/change");
  return { id: user.id, email: user.email };
}
