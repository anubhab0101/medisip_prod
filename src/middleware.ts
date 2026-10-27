import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getSecret } from "@/lib/secret-manager";
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/booking/") || path.startsWith("/offline-shell/") || path === "/robots.txt" || path === "/sitemap.xml" ||
    path === "/" ||
    path === "/login" ||
    path.startsWith("/api/auth/")
  )
    return NextResponse.next();
  const secret = await getSecret("AUTH_SECRET");
  const token = await getToken({
    req: request,
    secret,
    secureCookie:
      process.env.AUTH_URL?.startsWith("https://") ??
      request.nextUrl.protocol === "https:",
  });
  if (!token?.sub) {
    if (path.startsWith("/api/"))
      return NextResponse.json(
        { error: "Staff sign-in required." },
        { status: 401 },
      );
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (token.mustChangePassword && path !== "/password/change" && !path.startsWith("/api/auth/")) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Password change required." }, { status: 403 });
    return NextResponse.redirect(new URL("/password/change", request.url));
  }
  // Pages and actions still reload active membership and role from the database.
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
