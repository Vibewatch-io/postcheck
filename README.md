# Postcheck

**See your post exactly as X will show it.**

Postcheck shows you how an X post will look once it's published, on the web timeline, the post page and on phones, and points out the formatting quirks and ranking rules that change how it performs. Look up your username and draft on the left, with tips under the draft. The true-size preview sits on the right, and a tip about a particular line puts a small dot beside it. Share a link or export a PNG.

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
| Media | Up to 4 photos, GIFs or videos. One item 516px wide at its own shape, a portrait one capped at 510px high; two photos share a row; more, or any GIF or video among several, go into a sideways carousel 350px tall with the next item peeking in. "GIF", the video's length and "ALT" badges. The iPhone app's own sizes (322pt column, a 219pt carousel, tall photos cropped to 186×402) | `src/lib/media.ts` |
| Hidden URL | When the card's link is the last thing in the post, the URL text disappears and only the card shows | `cardUrl()`, `isTrailing()` |
| Entities | @mentions (15 chars max), #hashtags (need a letter), $cashtags, bare domains with a real TLD | `extractEntities()` |

What was inferred rather than read off a DOM, and how it was checked:

- **Phone layout**: 12px inset, 44px avatar, 8px gap, body at 15px/20px in a column of screen width minus 77, with X's −0.2pt tracking. Derived with CoreText and the app's own font files, then checked against captures of real posts on an iPhone 15 Pro (`scripts/ios/README.md`).
- **Phone sizes**: one entry per screen width in points, since that is what moves a line break, each labelled with the iPhones that share it (402: iPhone 17 and the 16–18 Pro; 393: iPhone 15, 16, 14 Pro and 15 Pro; 390: iPhone 12, 13, 14 (and the 12 and 13 Pro), 16e and 17e, but not the minis or the 14 Plus; 440: the 16–18 Pro Max; 430: the 15 and 16 Plus and the 14 and 15 Pro Max; 420: Air; 375: SE and the 12 and 13 mini. The 14 Plus, at 428, isn't listed). Sizes come from Apple's published resolutions. Only the 393pt screen has been captured, so the same insets are assumed at the other widths. The default is 402, the width with the most iPhones in use (TelemetryDeck, September 2026). Open the site on a phone and the preview is your own screen instead: the post drawn edge to edge at your phone's width, with the iPhone or Android rules for it (default text size assumed).
- **App line fold**: the iOS app folds a post behind Show more past 9 rendered lines, even under 280 characters and even for long posts (it ignores the web's 280 cut). The Android app has no line fold: it cuts at 280 exactly like the web.
- **Post page**: 17px/24px on web (566px) and in the app (screen width minus 32); never folds.
- **Italic**: a slant on the web, upright bold in the iOS app.

## The checks

Suggestions come from `src/lib/advice.ts`. Each one is a rule with a mechanism behind it, not a style opinion, and reach advice must not contradict X's published ranker, [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm). The code has no link penalty, so "links cost reach" is gone. "The ranker doesn't penalize it" is still not the same as "do it".

Each tip's colour says how much it matters: red for something X will do to the post that you'll want to fix, amber for something worth changing, grey for something to know. When a tip is about a particular line (a handle, a link, a hashtag, a stranded word, the fold), a dot in the same colour sits beside that line in the preview.

- Opens with a handle (X treats it as a reply; it mostly reaches people who follow both accounts)
- Over 280 (where the cut lands, and that non-Premium accounts can't post it)
- A single word dangling on the last line of a paragraph, per device, measured from the rendered DOM
- Link mid-text vs link last (visible URL text vs card only), several links, links to X posts
- Pages with no Open Graph tags (no card, URL stays visible)
- Hashtag piles (X's spam classifier has a hashtag-abuse category), handles too long to link, walls of text, stacked blank lines, outer whitespace

Line breaks are measured, not estimated: every word is wrapped in a span, the body is rendered invisibly at each device width, and the span positions say which words share a line.

## Privacy

The post you type stays in your browser unless you share it. Four things do leave it:

- **The first link** in your post goes to `/api/unfurl` on the server so it can fetch the page's Open Graph tags for the card preview, the one card X would show. It isn't sent when the post has attached media or a link to an X post, since neither shows a card. The server fetches the page, not your browser; other links aren't sent.
- **A link to an X post** (the last one, if there are several; none when media is attached) sends only that post's number to `/api/quote`, which asks FxTwitter's public API for the post (author, text, date, photo) and fetches its avatar and first photo from X's image servers (`pbs.twimg.com`, `abs.twimg.com`), so the preview can draw the quote embed. The server makes those requests, not your browser; the rest of the link isn't sent.
- **A username** you look up goes to `/api/profile`, which asks FxTwitter's public API (`api.fxtwitter.com`) for the name, avatar and badge.
- **Font requests** go to X's CDN (`abs.twimg.com`), because the previews render in Chirp loaded exactly the way x.com loads it. X sees the same request it would see from any page that embeds a post.

Links, post numbers and usernames are never stored. Each travels in the body of the request, not its address, because addresses end up in request logs and caches. The responses are marked `no-store`, and the server keeps nothing. Your browser keeps the cards and quoted posts it has fetched for the rest of the visit, and only asks once a link looks finished. The sample post's own card (a link to this site) ships with the page, so an untouched page makes no lookups at all.

**Share** copies a link that holds the preview itself: the text, its styling, the name, handle and check, the device and theme, and JPEG copies of your photo and attached media shrunk in the browser (a GIF or video travels as its first frame; the media steps down in size until the link fits under 38,000 characters, or is left out). Attached videos are read in your browser for their size, length and first frame and never sent anywhere. It is all compressed into the part of the link after `#`, which browsers never send to a server, so nothing is uploaded or stored and there is nothing for us to delete. Anyone who has the link can see the preview. Opening a shared post that contains a link fetches its card through `/api/unfurl`, or its quoted post through `/api/quote`, the same as typing it would.

The only analytics is Vercel Web Analytics, a cookieless page-view counter with no cross-site tracking. It is there because the fallback font's licence requires a monthly unique-visitor count (see Fonts), and it does nothing outside Vercel. It records the page address without the `#` part, so a share link's contents never reach it.

## Fonts

Previews render in Chirp from X's CDN, never bundled. If that fails, the page degrades to GT America, the typeface Chirp was derived from. GT America is licensed to Vibewatch from Grilli Type under a web licence: self-hosted, `@font-face` only, served only to the licensee's own sites, and never uploaded to a public repository. So:

- The files are not in this repo. `/fonts/[file]` serves them from `.fonts/gt-america/` locally or from a private Vercel Blob store linked to the project in production, refuses cross-origin requests, and 404s otherwise.
- A fork without the files gets the system font. A banner says which tier is active, and `npm run verify -- --no-chirp` tests the degraded path.
- PNG export is disabled while GT America is active, because the licence forbids saving the font into images.

The UI chrome uses Geist (Vercel, SIL Open Font License; text in `src/app/GeistVF.LICENSE.txt`) and Syne, both self-hosted by Next.js at build time. No font request goes to Google.

## Card, quote and profile lookups

`/api/unfurl` accepts http(s) only and refuses private, loopback and link-local addresses (IPv4-mapped forms and the well-known NAT64, 6to4 and Teredo prefixes included) on every redirect hop, checked on the address the connection actually dials so a second DNS answer can't swap it, caps the HTML at 2MB and the image at 2MB, times out at 6s, and inlines the image as a data URL so the PNG export can draw it. `/api/quote` takes nothing but a status number of 1–20 digits, asks FxTwitter at a fixed address with redirects refused, reads at most 256KB of its answer, and inlines the avatar (up to 256KB) and the first photo in X's medium size (up to 1MB) only when they come from X's image servers over https, on every redirect hop. `/api/profile` asks FxTwitter for an account through the same guard, kept on FxTwitter's host on every hop with its answer capped at 256KB, and inlines the avatar under the same image-server rule. All three are public endpoints once deployed, so put a rate limit in front of them (see Deploying).

## Run it

```bash
npm install
npm run dev
```

Node 24+. `npm run build` and `npm run lint` are the gate.

## Deploying

Deploys anywhere Next.js runs; the API routes run as Node functions. Set:

- `NEXT_PUBLIC_SITE_URL` if the site lives somewhere other than `postcheck.vibewatch.io`, so Open Graph URLs resolve.
- A linked **private Vercel Blob store** holding `GT-America-Standard-Regular.woff2` and `GT-America-Standard-Bold.woff2` at its root (or under the folder named by `FONT_BLOB_PREFIX`), only if you hold your own GT America web licence. Without it the fallback is the system font, which is fine.
- **Rate limits** on `/api/unfurl`, `/api/quote` and `/api/profile` (on Vercel, a WAF rate-limit rule per IP). The routes are SSRF-guarded but they are still a fetch proxy.

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

Where truth lives: `fixtures/corpus.json` and `fixtures/CORPUS.md` (the canonical posts), `fixtures/TEST-POSTS.md` (the edge-case posts on @postcheck_test, one rule per post), `fixtures/web` (x.com DOM captures), `fixtures/app` (iPhone and Android captures), `fixtures/posts` (X's per-post data), `scripts/ios` (CoreText oracle, needs the app fonts locally), `scripts/phone` (iPhone Mirroring capture), `scripts/android` (Android app capture over adb), and `QUIRKS.md` (every rule and its evidence; update it in the same commit as a rule change).

The capture rigs run against your own logged-in X session, on your own machine, and only read. They never post, like, repost, reply or follow, and the code stays that way. Automating a browser against x.com is something you do under X's terms, at your own risk.

Ground rules: a constant counts as measured only if it came from x.com's DOM, X's JSON, the oracle or a device capture; label everything else as inferred. Never commit fonts. When `verify` fails with unchanged code, X changed something: check the font line first. Lint, typecheck, tests and `verify` (0 failed) before a push.

## Licence

MIT, copyright Vibewatch. Use it, fork it, ship it; keep the copyright notice. If you build on it, a link back is appreciated but not required.
