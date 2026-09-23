# Postcheck

**We've seen a lot of bad posts. Here's how to fix yours.**

Postcheck shows you how an X post will look once it's published, on the web timeline, the post page and on phones, and flags the formatting X quietly punishes. Look up your username, draft on the left, see the render on the right, export a PNG.

Live at [postcheck.vibewatch.io](https://postcheck.vibewatch.io). Created by [Vibewatch](https://vibewatch.io) and released under the MIT licence.

## Why it's accurate

Every rendering rule in this tool is checked against X itself, not guessed. The repo carries the evidence and the rigs that produced it, so you can rerun the comparison yourself:

- **x.com**: a Playwright script opens the real timeline in a logged-in browser, reads which words landed on which line out of the DOM, and saves it (`fixtures/web`).
- **The iOS app**: the same posts captured from an iPhone through macOS iPhone Mirroring, then reproduced with Apple's CoreText and the app's own font files to find the exact column and tracking (`fixtures/app`, `scripts/ios`).
- **X's own data**: each post's entities, display ranges and card as X's syndication API reports them (`fixtures/posts`).

`npm run verify` types every one of those posts into the composer in headless Chromium and diffs line breaks, the Show more cut and the app fold against what x.com and the app actually rendered. The run has to end with `0 failed`. [QUIRKS.md](QUIRKS.md) is the ledger: every rule, its status (measured, verified, inferred, assumed) and the capture behind it.

If a post doesn't render 1:1 in the preview, that's a bug we want. [Open an issue](../../issues/new/choose) with the post URL and a screenshot, or send a PR. See [CONTRIBUTING.md](CONTRIBUTING.md).

## What it gets right

Everything below was read off x.com in September 2026.

| Thing | What X does | Where it lives |
|---|---|---|
| Typeface | Chirp, loaded from X's own CDN the same way x.com loads it, with X's declared fallback stack behind it | `src/app/globals.css`, `src/lib/theme.ts` |
| Column | 600px column, 16px padding, 40px avatar, 8px gap. Timeline body is 518px wide at 15px/20px; the post page runs 566px | `src/lib/devices.ts` |
| Colors | Light and dark palettes (X retired Dim in 2025). The previews follow your system setting; the switch in the header overrides it | `src/lib/theme.ts` |
| Length | twitter-text weighting: most Latin characters 1, CJK and symbols 2, emoji 2, every URL a flat 23. Budget 280 | `src/lib/entities.ts` |
| Show more | Past 280 the timeline cuts at the last word that fits and appends an inline blue "Show more". A word ending exactly at 280 stays | `showMoreCut()` |
| Link text | Scheme and `www.` stripped, path truncated at 15 characters with an ellipsis | `displayUrl()` |
| Cards | Small card: 1px border, 16px radius, square thumbnail. Large card: image with the title in a dark pill bottom-left and "From domain" beneath | `src/components/link-card.tsx` |
| Hidden URL | When the card's link is the last thing in the post, the URL text disappears and only the card shows | `cardUrl()`, `isTrailing()` |
| Entities | @mentions (15 chars max), #hashtags (need a letter), $cashtags, bare domains with a real TLD | `extractEntities()` |

What was inferred rather than read off a DOM, and how it was checked:

- **Phone layout**: 12px inset, 44px avatar, 8px gap, body at 15px/20px in a column of screen width minus 77, with X's −0.2pt tracking. Derived with CoreText and the app's own font files, then checked against captures of real posts on an iPhone 15 Pro (`scripts/ios/README.md`).
- **App line fold**: the app folds a post behind Show more past 9 rendered lines, even under 280 characters and even for long posts (it ignores the web's 280 cut).
- **Post page**: 17px/24px on web (566px) and in the app (screen width minus 32); never folds.
- **Italic**: a slant on the web, upright bold in the iOS app.

## The checks

Suggestions come from `src/lib/advice.ts`. Each one is a rule with a mechanism behind it, not a style opinion, and reach advice must not contradict X's published ranker, [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm). The code has no link penalty, so "links cost reach" is gone. "The ranker doesn't penalize it" is still not the same as "do it".

- Opens with a handle (X treats it as a reply; it mostly reaches people who follow both accounts)
- Over 280 (where the cut lands, and that non-Premium accounts can't post it)
- A single word dangling on the last line of a paragraph, per device, measured from the rendered DOM
- Link mid-text vs link last (visible URL text vs card only), several links, links to X posts
- Pages with no Open Graph tags (no card, URL stays visible)
- Hashtag piles (X's spam classifier has a hashtag-abuse category), handles too long to link, walls of text, stacked blank lines, outer whitespace

Line breaks are measured, not estimated: every word is wrapped in a span, the body is rendered invisibly at each device width, and the span positions say which words share a line.

## Privacy

The post you type never leaves your browser. Three things do:

- **Links** in your post go to `/api/unfurl` on the server so it can fetch the page's Open Graph tags for the card preview. The server fetches the page, not your browser.
- **A username** you look up goes to `/api/profile`, which asks FxTwitter's public API (`api.fxtwitter.com`) for the name, avatar and badge.
- **Font requests** go to X's CDN (`abs.twimg.com`), because the previews render in Chirp loaded exactly the way x.com loads it. X sees the same request it would see from any page that embeds a post.

The only analytics is Vercel Web Analytics, a cookieless page-view counter with no cross-site tracking. It is there because the fallback font's licence requires a monthly unique-visitor count (see Fonts), and it does nothing outside Vercel.

## Fonts

Previews render in Chirp from X's CDN, never bundled. If that fails, the page degrades to GT America, the typeface Chirp was derived from. GT America is licensed to Vibewatch from Grilli Type under a web licence: self-hosted, `@font-face` only, served only to the licensee's own sites, and never uploaded to a public repository. So:

- The files are not in this repo. `/fonts/[file]` serves them from `.fonts/gt-america/` locally or from a private Vercel Blob store linked to the project in production, refuses cross-origin requests, and 404s otherwise.
- A fork without the files gets the system font. A banner says which tier is active, and `npm run verify -- --no-chirp` tests the degraded path.
- PNG export is disabled while GT America is active, because the licence forbids saving the font into images.

The UI chrome uses Geist (Vercel, SIL Open Font License; text in `src/app/GeistVF.LICENSE.txt`) and Syne, both self-hosted by Next.js at build time. No font request goes to Google.

## Card and profile lookups

`/api/unfurl` accepts http(s) only, resolves the host and refuses private, loopback and link-local addresses on every redirect hop, caps the HTML at 2MB and the image at 2MB, times out at 6s, and inlines the image as a data URL so the PNG export can draw it. `/api/profile` proxies FxTwitter and inlines the avatar the same way. Both are public endpoints once deployed, so put a rate limit in front of them (see Deploying).

## Run it

```bash
npm install
npm run dev
```

Node 20+. `npm run build` and `npm run lint` are the gate.

## Deploying

Deploys anywhere Next.js runs; the API routes run as Node functions. Set:

- `NEXT_PUBLIC_SITE_URL` if the site lives somewhere other than `postcheck.vibewatch.io`, so Open Graph URLs resolve.
- A linked **private Vercel Blob store** holding `GT-America-Standard-Regular.woff2` and `GT-America-Standard-Bold.woff2` at its root (or under the folder named by `FONT_BLOB_PREFIX`), only if you hold your own GT America web licence. Without it the fallback is the system font, which is fine.
- **Rate limits** on `/api/unfurl` and `/api/profile` (on Vercel, a WAF rate-limit rule per IP). The routes are SSRF-guarded but they are still a fetch proxy.

## Working on it

```bash
npm run dev                      # local dev
npm run build                    # production build (verify needs it)
npm test                         # rule tests over fixtures/posts
npm run start                    # serve the build; verify drives it
npm run verify                   # render every corpus post headless, diff against x.com and iPhone captures
npm run verify -- --no-chirp     # same with X's CDN blocked (fallback font path)
npm run capture:web              # re-capture x.com timeline cells (--login once)
node scripts/fetch-fixture.mjs   # refresh X's entities and display ranges for the corpus
```

Where truth lives: `fixtures/corpus.json` and `fixtures/CORPUS.md` (the canonical posts), `fixtures/TEST-POSTS.md` (the edge-case posts on @postcheck_test, one rule per post), `fixtures/web` (x.com DOM captures), `fixtures/app` (iPhone captures), `fixtures/posts` (X's per-post data), `scripts/ios` (CoreText oracle, needs the app fonts locally), `scripts/phone` (iPhone Mirroring capture), and `QUIRKS.md` (every rule and its evidence; update it in the same commit as a rule change).

The capture rigs run against your own logged-in X session, on your own machine, and only read. They never post, like, repost, reply or follow, and the code stays that way. Automating a browser against x.com is something you do under X's terms, at your own risk.

Ground rules: a constant counts as measured only if it came from x.com's DOM, X's JSON, the oracle or a device capture; label everything else as inferred. Never commit fonts. When `verify` fails with unchanged code, X changed something: check the font line first. Lint, typecheck, tests and `verify` (0 failed) before a push.

## Licence

MIT, copyright Vibewatch. Use it, fork it, ship it; keep the copyright notice. If you build on it, a link back is appreciated but not required.
