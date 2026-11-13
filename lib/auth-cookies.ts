/**
 * Which name the login cookie gets: "__Secure-next-auth.session-token" on
 * HTTPS sites, "next-auth.session-token" on plain HTTP.
 *
 * Two parts of the app have to agree on this name: the pages and API routes
 * that create and read the session (next-auth), and the proxy that guards
 * /dashboard and friends. next-auth works the answer out separately for each,
 * from NEXTAUTH_URL, and the two disagree when NEXTAUTH_URL has no "https://"
 * in front (for example "studyspark-silk.vercel.app"). The pages then accept
 * the login while the proxy rejects it, and the browser bounces between
 * /login and /dashboard forever.
 *
 * So the app decides once, here, and gives the same answer to both.
 */
export function shouldUseSecureCookies(
  env: Record<string, string | undefined> = process.env
): boolean {
  const configured = env.NEXTAUTH_URL?.trim();
  if (configured) {
    // next-auth treats an address without a scheme as https, so do the same.
    return !/^http:\/\//i.test(configured);
  }
  // Without NEXTAUTH_URL, Vercel serves the site over https.
  return Boolean(env.VERCEL);
}

export function sessionCookieName(secure: boolean): string {
  return secure
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}
