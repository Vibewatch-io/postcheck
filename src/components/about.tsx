import { REPO_URL } from "@/lib/site";

/**
 * What the page says to someone who scrolls past the tool, and to search engines: the tool itself
 * renders almost no text a crawler can read. Every claim here is one the README already makes; keep
 * them in step. The FAQ also feeds the page's FAQPage structured data (page.tsx), so the two can't drift.
 */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I preview a tweet before posting it?",
    a: "Yes. Type or paste your draft and Postcheck draws it the way X will: on x.com, on the post page, and in the X apps for iPhone and Android. Look up your username to see it with your own name, photo and check mark.",
  },
  {
    q: "Is Postcheck free?",
    a: "Yes. There is no sign-up and no paid tier, and the code is open source under the MIT licence.",
  },
  {
    q: "Does Postcheck store my post?",
    a: "No. Previews are made in your browser, and the text you type stays there unless you share it. Only the first link (to fetch its card), the number of a post you quote, and a username you look up go to our server, and none of them are stored.",
  },
  {
    q: "Does it show the link card X will attach?",
    a: "Yes. Paste a link and Postcheck reads the page's Open Graph tags and draws the small or large card X would show, or warns you when the page has none and the bare URL will show instead.",
  },
  {
    q: "Which phones can I preview on?",
    a: "iPhone screen sizes from the SE to the Pro Max, plus Android phones at 360 and 412 dp. Open Postcheck on your own phone and the preview runs at your screen's width.",
  },
];

const CHECKS = [
  "Character count, weighted the way X counts it: emoji and CJK characters count double and every link counts 23.",
  "Where “Show more” cuts in: at 280 characters on the web and on Android, and after nine lines in the phone apps.",
  "Link cards, quoted posts, photos, GIFs, videos and polls, laid out the way X lays them out.",
  "A single word stranded on the last line, on the phone or web view you pick.",
  "Opening with an @handle, which X treats as a reply.",
];

export function About() {
  return (
    <section aria-labelledby="about-heading" className="mx-auto max-w-[720px] px-4 pt-10 pb-14 text-sm leading-relaxed text-brand-warm-gray sm:px-5">
      <h2 id="about-heading" className="font-syne text-xl font-bold tracking-tight text-brand-warm-dark">
        Preview your X post before you post it
      </h2>
      <p className="mt-3">
        Postcheck is a free previewer for X (Twitter) posts. It draws your draft at true size, with the column widths and line breaks of
        x.com and the X apps, so you see where the lines fall and what gets cut before anyone else does. Its rendering rules come
        from real posts captured on x.com, an iPhone and an Android phone.
      </p>

      <h3 className="mt-8 font-syne text-base font-bold text-brand-warm-dark">What it checks</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {CHECKS.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>

      <h3 className="mt-8 font-syne text-base font-bold text-brand-warm-dark">Questions</h3>
      <dl className="mt-2 space-y-4">
        {FAQ.map(({ q, a }) => (
          <div key={q}>
            <dt className="font-medium text-brand-warm-dark">{q}</dt>
            <dd className="mt-1">{a}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8">
        Something doesn’t match what X shows?{" "}
        <a href={`${REPO_URL}/issues/new/choose`} className="font-medium text-brand-teal-dark hover:underline" rel="noopener noreferrer" target="_blank">
          Tell us on GitHub
        </a>
        .
      </p>
    </section>
  );
}
