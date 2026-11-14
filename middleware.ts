import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminTokenWithSecret } from "./lib/auth/admin-token";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");
  if ((!isAdminPage && !isAdminApi) || pathname === "/admin/login") return NextResponse.next();

  const isAdmin = await verifyAdminTokenWithSecret(
    request.cookies.get(ADMIN_COOKIE)?.value,
    process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET
  );
  if (isAdmin) return NextResponse.next();
  if (isAdminApi) return NextResponse.json({ ok: false }, { status: 401 });

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
