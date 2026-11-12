// Redirects anonymous visitors to the login page before a protected page
// renders. Pages and API routes still check the session themselves.
export { default as proxy } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/subjects/:path*"],
};
