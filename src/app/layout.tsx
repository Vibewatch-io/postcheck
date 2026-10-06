import type { Metadata, Viewport } from "next";
import { Syne } from "next/font/google";
import localFont from "next/font/local";
import { Analytics } from "@/components/analytics";
import { DESCRIPTION, SITE_URL, TAGLINE, TITLE, X_HANDLE } from "@/lib/site";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne", display: "swap", weight: ["600", "700"] });
const geist = localFont({ src: "./GeistVF.woff", variable: "--font-geist", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  // Search results and the browser tab carry the tagline; social cards keep the short name, which
  // X prints in the pill over the image.
  title: `${TITLE}: ${TAGLINE}`,
  description: DESCRIPTION,
  applicationName: TITLE,
  alternates: { canonical: "/" },
  metadataBase: new URL(SITE_URL),
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/", siteName: TITLE, locale: "en_US" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, site: X_HANDLE, creator: X_HANDLE },
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
