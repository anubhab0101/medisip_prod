"use server";
import { auth, signOut } from "@/auth";
import { hash, compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/server/db";
import { redirect } from "next/navigation";

export async function changeInitialPassword(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const parsed = z.object({
    current: z.string().min(1).max(72),
    next: z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
    confirm: z.string().min(1).max(72),
  }).safeParse({ current: form.get("current"), next: form.get("next"), confirm: form.get("confirm") });
  if (!parsed.success || parsed.data.next !== parsed.data.confirm) redirect("/password/change?error=details");
  const user = await db().user.findUnique({ where: { id: session.user.id } });
  if (!user?.active || user.sessionVersion !== session.user.sessionVersion || !(await compare(parsed.data.current, user.passwordHash))) redirect("/password/change?error=current");
  await db().user.update({ where: { id: user.id }, data: { passwordHash: await hash(parsed.data.next, 12), mustChangePassword: false, sessionVersion: { increment: 1 } } });
  await signOut({ redirectTo: "/login?passwordChanged=1" });
}
