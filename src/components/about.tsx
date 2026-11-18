import { REPO_URL, SITE_URL } from "@/lib/site";

/** The check API and MCP server (README: "Check a post from code"), at this deployment's own address. */
const CHECK_URL = `${SITE_URL}/api/check`;
const MCP_URL = `${SITE_URL}/api/mcp`;

/**
 * What the page says to someone who scrolls past the tool, and to search engines: the tool itself
 * renders almost no text a crawler can read. Every claim here is one the README or the code backs;
 * keep them in step. The FAQ also feeds the page's FAQPage structured data (page.tsx), so the two can't drift.
 */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I preview a tweet before posting it?",
    a: "Yes. Type or paste your draft and Postcheck draws it the way X will: on x.com, on the post page, and in the X apps for iPhone and Android. Look up your username to see it with your own name, photo and check mark.",
  },
  {
    q: "Is Postcheck free?",
    a: "Yes. There is no sign-up, and the code is open source under the MIT licence.",
  },
  {
    q: "Does Postcheck store my post?",
    a: "No. Previews are made in your browser, and the text you type stays there unless you share it. Only the first link, the number of a post you quote, and a username you look up go to our server, which fetches the link's card and asks FxTwitter for the post or profile. None of them are stored. The check API and MCP server receive the text a script or agent sends them, use it for that one answer, and never store or log it.",
  },
  {
    q: "Does it show the link card X will attach?",
    a: "Yes. Paste a link and Postcheck reads the page's Open Graph tags and draws the small or large card X would show, or warns you when the page has none and the bare URL will show instead.",
  },
  {
    q: "Which phones can I preview on?",
    a: "iPhone screen sizes from the SE to the Pro Max, plus Android phones at 360 and 412 dp. Open Postcheck on your own phone and the preview runs at your screen's width.",
  },
  {
    q: "Can an AI agent check a post before posting it?",
    a: `Yes. Add ${MCP_URL} to Claude or another agent as an MCP server, or have a script send the draft to ${CHECK_URL}. Either answers with the tips and line breaks this page shows. Both are free to use, with a per-IP rate limit.`,
  },
];

const CHECKS = [
  "Character count, weighted the way X counts it: emoji and CJK characters count double and every link counts 23.",
  "Where “Show more” cuts in: at 280 characters on the web and on Android, and after nine lines in the phone apps.",
  "Link cards, quoted posts, photos, GIFs, videos and polls, laid out the way X lays them out.",
  "A single word stranded on the last line, on the phone or web view you pick.",
  "Opening with an @handle, which X treats as a reply.",
];

/** A field name or value in running text. */
function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-brand-warm-surface px-1 py-px font-mono text-[0.85em] text-brand-warm-dark [overflow-wrap:anywhere]">{children}</code>;
}

/** A command to copy, in lines that fit a 360px phone. Anything wider scrolls inside the block, never the page. */
function Command({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-brand-warm-border bg-brand-warm-surface px-2.5 py-2.5 font-mono text-[11px] leading-relaxed text-brand-warm-dark sm:px-3 sm:text-xs">
      <code>{children}</code>
    </pre>
  );
}

export function About() {
  return (
    <section aria-labelledby="about-heading" className="mx-auto max-w-[720px] px-4 pt-10 pb-14 text-sm leading-relaxed text-brand-warm-gray sm:px-5">
      <h2 id="about-heading" className="font-syne text-xl font-bold tracking-tight text-brand-warm-dark">
        Preview your X post before you post it
      </h2>
      <p className="mt-3">
        Postcheck is a free previewer for X (Twitter) posts. It draws your draft at true size, using column widths and line-break rules
        measured on x.com and in the X apps, so you see where the lines fall and what gets cut before anyone else does. Its rendering rules come
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
            <dd className="mt-1 [overflow-wrap:anywhere]">{a}</dd>
          </div>
        ))}
      </dl>

      {/* README "Check a post from code" is the source for every field and promise below. */}
      <h3 id="api" className="mt-8 font-syne text-base font-bold text-brand-warm-dark">
        Check a post from code
      </h3>
      <p className="mt-2">
        A script or an AI agent can check a draft too. It gets back the tips on this page and the lines each phone and x.com show before
        Show more, worked out from X’s font metrics without a browser.
      </p>
      <Command>{`curl -s \\\n  ${CHECK_URL} \\\n  -H 'content-type: application/json' \\\n  -d '{"text": "Your post"}'`}</Command>
      <p className="mt-3">
        The body takes <C>text</C> (<C>**bold**</C> and <C>__italic__</C> mark Premium styling unless <C>plain</C> is <C>true</C>),{" "}
        <C>badge</C> (<C>none</C>, <C>blue</C>, <C>gold</C> or <C>gray</C>), <C>phone</C> and <C>web</C> (the views the tips cover),{" "}
        <C>devices</C> (which line breaks to return; every timeline by default), <C>media</C> (each item’s <C>kind</C>, <C>width</C> and{" "}
        <C>height</C>, no file needed) and <C>poll</C> (2 to 4 choices).
      </p>
      <p className="mt-3">
        The answer has <C>ok</C> (false when any tip is a fix), <C>advice</C>, and for each device the <C>lines</C> a reader sees before any
        tap, <C>showMore</C> and <C>dangling</C>. <C>fidelity</C> is <C>exact</C> when every line was measured in X’s font and every lookup
        answered. Otherwise it is <C>approximate</C> and <C>notes</C> say why, such as text X’s font doesn’t cover (emoji, Arabic, CJK,
        Thai), which each phone draws in its own fonts, or a link or quoted post that couldn’t be looked up. Long runs of one repeated letter
        can still break differently in the phone apps, even when <C>fidelity</C> is <C>exact</C>.
      </p>
      <p className="mt-3">
        For Claude or any other MCP client, add <C>{MCP_URL}</C> as a remote server. Its tools are <C>check_post</C>, which takes the same
        fields and answers with a readable report (or the JSON above when <C>format</C> is <C>json</C>), and <C>list_devices</C>, which
        lists the device ids.
      </p>
      <Command>{`claude mcp add --transport http postcheck \\\n  ${MCP_URL}`}</Command>
      <p className="mt-3">
        Both are open to anyone, with a per-IP rate limit. Unlike this page, they receive the post’s text, use it for that one answer, and
        never store or log it. They look up the post’s first link and any quoted post the same way this page does.
      </p>

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
