// Redirects anonymous visitors to the login page before a protected page
// renders. Pages and API routes still check the session themselves.
import { withAuth } from "next-auth/middleware";
import { sessionCookieName, shouldUseSecureCookies } from "@/lib/auth-cookies";

// Without `pages.signIn` the visitor is first sent to /api/auth/signin, which
// bounces to /login with an absolute callbackUrl built from NEXTAUTH_URL. Go
// straight to /login and keep the callbackUrl relative to this site.
//
// The cookie name is passed in explicitly so it always matches the one the
// login created (see lib/auth-cookies.ts).
export const proxy = withAuth({
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: { name: sessionCookieName(shouldUseSecureCookies()) },
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/subjects/:path*", "/admin/:path*", "/group/:path*"],
};
