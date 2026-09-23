import { Postcheck } from "@/components/postcheck";

const REPO = "https://github.com/Vibewatch-io/postcheck";

export default function Page() {
  return (
    // Wide windows lock the page to the window so everything fits without scrolling; narrower ones
    // stack the preview under the composer (postcheck.tsx) and scroll.
    <div className="mx-auto flex min-h-screen max-w-[1640px] flex-col px-4 py-3 sm:px-5 min-[1224px]:h-screen min-[1224px]:overflow-hidden">
      <header className="mb-3 flex flex-none flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0">
          <h1 className="font-syne text-2xl font-bold tracking-tight text-brand-warm-dark">
            Post<span className="text-brand-teal">check</span>
          </h1>
          <p className="text-sm text-brand-warm-gray">We&apos;ve seen a lot of bad posts. Here&apos;s how to fix yours.</p>
        </div>
        <div id="theme-slot" className="shrink-0" />
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
          <span>Previews never leave your browser.</span>
          <a href={REPO} className="hover:text-brand-warm-dark hover:underline" rel="noopener noreferrer" target="_blank">
            Open source on GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
