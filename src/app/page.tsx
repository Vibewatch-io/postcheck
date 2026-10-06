import { Postcheck } from "@/components/postcheck";
import { DESCRIPTION, SITE_URL, TAGLINE, TITLE } from "@/lib/site";

const REPO = "https://github.com/Vibewatch-io/postcheck";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: TITLE,
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any (web browser)",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: "Vibewatch", url: "https://vibewatch.io" },
  sameAs: [REPO],
};

export default function Page() {
  return (
    // Wide windows lock the page to the window so everything fits without scrolling; narrower ones
    // stack the preview under the composer (postcheck.tsx) and scroll.
    <>
    {/* Structured data: tells search engines this is a free web app, and who makes it. */}
    <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
    <div className="mx-auto flex min-h-screen max-w-[1640px] flex-col px-4 py-3 sm:px-5 min-[1224px]:h-screen min-[1224px]:overflow-hidden">
      <header className="mb-3 flex flex-none flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0">
          <h1 className="font-syne text-2xl font-bold tracking-tight text-brand-warm-dark">
            Post<span className="text-brand-teal">check</span>
          </h1>
          <p className="text-sm text-brand-warm-gray">{TAGLINE}</p>
        </div>
        {/* The preview's controls live up here so the phone gets the full height of the window. */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div id="preview-controls" className="contents" />
          <div id="theme-slot" className="contents" />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <Postcheck />
      </main>

      <footer className="mt-3 flex flex-none flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-brand-warm-border pt-2 text-xs text-brand-warm-secondary">
        <span>
          A free tool from the team at{" "}
          <a href="https://vibewatch.io?utm_source=postcheck" className="font-medium text-brand-teal-dark hover:underline">
            Vibewatch
          </a>
          .
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Previews are made in your browser. We never store what you write.</span>
          <a href={REPO} className="hover:text-brand-warm-dark hover:underline" rel="noopener noreferrer" target="_blank">
            Open source on GitHub
          </a>
        </span>
      </footer>
    </div>
    </>
  );
}
