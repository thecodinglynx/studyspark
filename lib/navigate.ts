/**
 * Moves the browser to another page with a full page load.
 *
 * Used right after logging in or out. The in-app router keeps a cache of pages
 * it has already fetched, including "this page redirects to the login page"
 * answers picked up while the visitor was logged out. Reusing one of those
 * after login sends the visitor round in circles between /login and
 * /dashboard. A full load starts from a clean slate with the new cookies.
 */
export function hardNavigate(path: string): void {
  window.location.assign(path);
}
