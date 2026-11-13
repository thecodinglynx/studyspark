// Redirects anonymous visitors to the login page before a protected page
// renders. Pages and API routes still check the session themselves.
import { withAuth } from "next-auth/middleware";

// Without `pages.signIn` the visitor is first sent to /api/auth/signin, which
// bounces to /login with an absolute callbackUrl built from NEXTAUTH_URL. Go
// straight to /login and keep the callbackUrl relative to this site.
export const proxy = withAuth({ pages: { signIn: "/login" } });

export const config = {
  matcher: ["/dashboard/:path*", "/subjects/:path*", "/admin/:path*"],
};
