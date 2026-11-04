import { About, FAQ } from "@/components/about";
import { Postcheck } from "@/components/postcheck";
import { DESCRIPTION, REPO_URL, SITE_URL, TAGLINE, TITLE } from "@/lib/site";

const APP = {
  "@type": "WebApplication",
  name: TITLE,
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any (web browser)",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: "Vibewatch", url: "https://vibewatch.io" },
  sameAs: [REPO_URL],
};

/** The FAQ the page prints under the tool (about.tsx), as structured data. */
const FAQ_PAGE = {
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

const JSON_LD = { "@context": "https://schema.org", "@graph": [APP, FAQ_PAGE] };

export default function Page() {
  return (
    // Wide windows lock the tool to the window so it all fits on the first screen; narrower ones stack
    // the preview under the composer (postcheck.tsx) and scroll. The About section sits below the fold.
    <>
    {/* Structured data: tells search engines this is a free web app, who makes it, and its FAQ. */}
    <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
    <div className="mx-auto flex min-h-screen max-w-[1640px] flex-col px-4 py-3 sm:px-5 min-[1224px]:h-screen min-[1224px]:overflow-hidden">
      <header className="mb-3 flex flex-none flex-wrap items-center justify-between gap-x-6 gap-y-1">
        {/* The tagline sits inside the h1 so the page's main heading says what the tool does. */}
        <h1 className="flex flex-wrap items-baseline gap-x-4 gap-y-0">
          <span className="font-syne text-2xl font-bold tracking-tight text-brand-warm-dark">
            Post<span className="text-brand-teal">check</span>
          </span>
          <span className="sr-only">: </span>
          <span className="text-sm font-normal text-brand-warm-gray">{TAGLINE}</span>
        </h1>
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
          <a href="https://vibewatch.io/?utm_source=postcheck&utm_medium=microsite&utm_campaign=ecosystem-index&utm_content=postcheck-footer-cta" className="font-medium text-brand-teal-dark hover:underline">
            Vibewatch
          </a>
          .
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Previews are made in your browser. We never store what you write.</span>
          <a href={REPO_URL} className="hover:text-brand-warm-dark hover:underline" rel="noopener noreferrer" target="_blank">
            Open source on GitHub
          </a>
        </span>
      </footer>
    </div>
    <About />
    </>
  );
}
