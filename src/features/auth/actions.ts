"use server";
import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import { cookies, headers } from "next/headers";
import { context } from "@/server/context";
import { redirect } from "next/navigation";
import { platformAdminEmails } from "@/lib/platform-admin";
async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
export async function loginAction(_state: { error: string }, form: FormData) {
  if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET)
    return {
      error:
        "Shop setup is not finished. Ask the owner to connect the database and configure sign-in.",
    };
  const ip = await getClientIp();
  const destination = platformAdminEmails().has(String(form.get("email") ?? "").trim().toLowerCase()) ? "/platform" : "/dashboard";
  try {
    await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      ip,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError)
      return {
        error:
          "Sign-in failed. Check your email and password, or try again in 15 minutes.",
      };
    throw error;
  }
  redirect(destination);
}
export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
export async function switchBranch(form: FormData) {
  const ctx = await context();
  const branchId = String(form.get("branchId") ?? "");
  if (!ctx.memberships.some((m) => m.branchId === branchId))
    throw new Error("Branch access denied");
  (await cookies()).set("medishop.branch", branchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/dashboard");
}
