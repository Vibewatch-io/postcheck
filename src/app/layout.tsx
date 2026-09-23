import type { Metadata, Viewport } from "next";
import { Syne } from "next/font/google";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne", display: "swap", weight: ["600", "700"] });
const geist = localFont({ src: "./GeistVF.woff", variable: "--font-geist", weight: "100 900", display: "swap" });

const TITLE = "Postcheck";
const DESCRIPTION = "See how your X post will look on the web and on phones before you post it, and fix the formatting X quietly punishes.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://postcheck.vibewatch.io"),
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION, site: "@vibewatch_io" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F9F8F5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://abs.twimg.com" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="https://abs.twimg.com/fonts/v2/chirp-regular-web.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="https://abs.twimg.com/fonts/v2/chirp-bold-web.woff2" crossOrigin="anonymous" />
      </head>
      <body className={`${syne.variable} ${geist.variable} font-sans`}>
        {children}
        {/* Vercel Web Analytics: cookieless page-view counts. The GT America web licence requires a
            monthly unique-visitor count; this is the whole reason it is here. No-op outside Vercel. */}
        <Analytics />
      </body>
    </html>
  );
}
