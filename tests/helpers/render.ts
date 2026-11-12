import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const decode = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * Renders the output of a server component to HTML, plus the visible text
 * with tags removed and whitespace collapsed, for simple assertions.
 */
export function renderPage(element: ReactElement) {
  const html = renderToStaticMarkup(element);
  const text = decode(
    html
      .replace(/<!--.*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();

  return {
    html,
    text,
    /** Data passed to a chart, as captured by the react-chartjs-2 mock. */
    chart<T = unknown>(kind: "pie" | "bar"): T | null {
      const match = html.match(
        new RegExp(`data-chart="${kind}" data-json="([^"]*)"`)
      );
      return match ? (JSON.parse(decode(match[1])) as T) : null;
    },
  };
}

/** Runs a page that is expected to redirect and returns the target path. */
export async function redirectTarget(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("NEXT_REDIRECT:")) {
      return message.slice("NEXT_REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("Expected the page to redirect, but it rendered.");
}
