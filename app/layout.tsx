import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import { Inter } from "next/font/google";
import { AuthSessionProvider } from "@/components/providers/session-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StudySpark",
  description:
    "Modern flashcard study companion with collaborative sharing and progress tracking.",
  metadataBase: new URL("https://studyspark-silk.vercel.app"),
  icons: {
    icon: "/favicon.svg",
  },
};

// The <html> element has no fixed height. With h-full the background gradient
// was sized to a single screen and visibly restarted further down long pages.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100`}
      >
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
