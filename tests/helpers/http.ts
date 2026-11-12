const BASE = "http://localhost:3000";

/** Builds the Request object a route handler receives. */
export function request(
  method: string,
  path: string,
  body?: unknown
): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A request whose body is not valid JSON. */
export function rawRequest(method: string, path: string, body: string): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body,
  });
}

/**
 * Builds the second argument a dynamic route handler receives, which is also
 * the props object of a dynamic page. Next.js passes params as a promise.
 */
export function routeContext<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

export async function json<T = Record<string, unknown>>(
  response: Response
): Promise<T> {
  return (await response.json()) as T;
}
