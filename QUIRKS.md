# Quirks registry

Every rendering rule this tool applies, with where it came from. A rule is only
as good as its evidence, so each row says how it was established and what would
change it. When you find a mismatch against real X, add a row or fix one, and
add the post to `fixtures/posts/` (`node scripts/fetch-fixture.mjs <url>`) so
`npm test` keeps it honest.

Status key: **Measured** = read off x.com's DOM or X's own JSON · **Verified** =
checked against a specific live post · **Inferred** = derived from a screenshot
or a single sample · **Assumed** = not yet checked against anything real.

## Text and length

| Rule | Status | Evidence | Code |
|---|---|---|---|
| Every URL counts 23 regardless of its length | Verified | X rewrites every link to a t.co link; in X's own text for all 11 fixture posts each URL occupies exactly 23 code points (`entities.urls[].indices`). twitter-text v3 `transformedURLLength: 23` | `URL_WEIGHT` |
| Every emoji counts 2, however many code points it has (👨‍👩‍👧‍👦 is 2, not 11) | Verified (config) | twitter-text v3: emoji parsed as one unit at weight 200; characters outside Latin/basic-punctuation ranges (✨ ↓ 💚 CJK) also weigh 2. A post on x.com near the limit would confirm the counter; none of the fixtures sits at exactly 280 | `weightedLength()` |
| Latin letters, digits, basic punctuation weigh 1; budget 280 | Verified | twitter-text v3 ranges; all 11 fixture posts ≤ 280 under these rules, the one long post is exactly the cut prefix | `weightedLength()` |
| Long post cut: last word boundary within 280 (a word ending exactly at 280 stays), then inline blue "Show more" | Verified | Post 2085516290941472896 on x.com: visible text ends "…1-10, in" (test); 2089427094224974124 and 2087554813450203482 end exactly at 280 on a whole word (test, verify) | `showMoreCut()` |
| Weights confirmed at the limit: 280 Latin characters, 140 CJK characters (weight 2) and ZWJ family / flag / skin-tone emoji (weight 2 each) all post as ordinary posts, not long posts | Verified | @postcheck_test test posts 01, 03, 04 (2100298548843872339, 2100298643605709117, 2100298868282077295): `note_tweet` absent, display range ends at the text's end | `weightedLength()` |
| Show more cut on long posts: a word ending exactly on 280 stays; a word straddling 280 is dropped; an emoji straddling 280 is dropped | Verified | @postcheck_test test posts 05, 06, 08: X's display range ends on the same character as `showMoreCut()` | `showMoreCut()` |
| X collapses stacked blank lines to one on posting ("a\n\n\n\nb" is stored as "a\n\nb"), keeps repeated spaces inside a line, trims trailing space | Verified | @postcheck_test test posts 14, 17 (2100300298313183628, 2100300746269008191): stored text | `trimDraft()` |
| Web and the iOS app both wrap at hyphens inside a word ("quantum-" / "resistant", "…-and-then-" / "some-more-letters") | Verified (web + iPhone) | @postcheck_test tests 15 and 16 (2100300464600633836, 2100300597098688990) captured on both on 2026-09-17; the earlier "app never breaks at hyphens" rule came from posts whose hyphenated words never reached a line end | `post-body.tsx` (no special casing) |
| Outer whitespace trimmed | Assumed | Never seen a post keep a leading blank line | `post = text.trim()` |
| Display URL: strip scheme + `www.`, keep host + 15 path chars + `…` | Verified | 11 fixture posts, every `display_url` matches (test) | `displayUrl()` |
| Bare domains link only with a real TLD; scheme'd URLs link with any TLD | Verified | @postcheck_test test 30: `vibewatch.io`, `example.ai` and `file.zip` all link on x.com (`.zip` is a real TLD). Trailing `)`, `.`, `,` and quotes are excluded from the link (test 31) | `BARE_URL_RE` |
| `user@example.com` does not link the domain or mention anyone | Verified | @postcheck_test test 32 (2100652733972074764): plain text on x.com | `URL_LEAD` |
| A post starting with @handle is stored as a reply to that account (`in_reply_to_screen_name`, no status) but renders as an ordinary post: in the profile's Posts tab, no "Replying to" line, identical to the `.@handle` form | Observed (web + X data) | @postcheck_test tests 48 and 49 (2100663568354144336, 2100663799900721554); FxTwitter `replying_to: Vibewatch_io`. Reach effect not measured | advice keeps the leading-mention tip |
| A reply shown under its parent has a thread connector and no "Replying to" line; shown alone (Replies tab, parent not adjacent) it gets "Replying to @handle" | Observed (web) | @postcheck_test tests 47, 47a–c | not drawn |
| Mentions ≤ 15 chars, hashtags need a letter, cashtags 1–6 letters | Assumed | twitter-text rules | `MENTION_RE` etc |

## Attachments

| Rule | Status | Evidence | Code |
|---|---|---|---|
| Trailing link: URL text hidden only when it is the link the card was built from; a trailing link without a card stays visible | Verified | Post 2084312564763439379 (hidden behind its card); @postcheck_test tests 20, 22, 24, 29 (hidden), 23 (`example.com`, no card, shown), 25–28, 30, 31 (trailing links after the first-link card stay visible) | `hiddenUrlStart` |
| Photo attached: no card, link text stays visible even when last | Verified | Post 2097746764560552262, both web and phone screenshots | `media` in `postcheck.tsx` |
| Several links: the first one gets the card; if that page has no card there is no card at all, X does not try the next link | Verified | @postcheck_test tests 25, 26 (both orders card the first link), 27, 30 (first link carded, later plain links visible), 28 (three links, first has no card → no card even though the second would) | `cardUrl()` |
| A link to an X post becomes a quote embed wherever it sits; its URL text is hidden only when it is last; a quote replaces any link card; a native Quote and a post URL at the end are stored the same way (`quoted_status`) | Verified (web) | @postcheck_test tests 40 (trailing, hidden), 41 (mid, text stays, quote shown), 45 (quote + vibewatch.io link: quote, no card, link text visible), 42/43 | `quoteUrl()`, `QuoteStub` |
| A quoted post's own card is not shown inside the quote embed on the web (the quoted text shows its link as text); a quoted post's photo is shown, full embed width, under the quoted text | Observed (web) | @postcheck_test test 43 (quote of the card post 20), test 44 (quote of the photo post 50: photo inside the embed) | `QuoteStub` |
| Web media, one item: 516px wide at its own aspect ratio (16:9 → 516×290); a tall item is capped at 510px (9:16 → 287×510) | Measured (web) | @postcheck_test tests 50, 51, 55, 56, 58 (2026-09-23 capture, 600px column) | not drawn to size |
| Web media, several items: two photos sit side by side as 255×255 squares; three or four photos, and any mix of photo/GIF/video, sit in a sideways ScrollSnap carousel at 350px tall (squares 350, 16:9 items 412 wide), 6–7px apart, the next item peeking. No 2×2 grid. At most 4 items per post (composer: "Please choose up to 4 photos, videos, or GIFs.") | Measured (web) | @postcheck_test tests 52, 53, 54, 59b, 59c; `fixtures/web/postcheck_test.json` `media.items` | not drawn (tool shows one image) |
| Web media badges: a GIF shows "GIF"; a video shows its duration ("0:06"), which counts down and then disappears once autoplay starts; a photo with alt text shows a 23×15 "ALT" badge | Observed (web) | @postcheck_test tests 55, 56, 58, 59c | not drawn |
| Polls: a text poll with 4 choices is a 518×172 card ("0 votes · 23 hours left" under the choices); an image poll (`<id>:poll_choice_images` card) puts a 48×48 thumbnail beside each choice on a 60px pitch, 518×268. FxTwitter returns no poll for image polls; the syndication JSON has it | Measured (web) | @postcheck_test tests 57, 57b | not drawn |
| App media: one item fills the 322pt media column (x 70–392 on a 393pt screen) at its own aspect ratio (16:9 → 322×182); a 9:16 portrait shows whole at 226×402, no cap reached. Two photos: 158×157 squares side by side, 6pt apart, both whole. Three or four photos, any photo/GIF/video mix, and image-poll choices: a carousel about 220pt tall showing the first item whole and the next one peeking 3–4pt after it (59b's photo is cropped to 259×220). No 2×2 grid | Measured (iPhone) | @postcheck_test tests 50–56, 58, 59b, 59c, 57b; `fixtures/app/iphone-16.json` `media.items` | not drawn |
| App badges: GIF shows a "GIF" pill bottom-left; a video shows only a mute icon (no duration); a photo with alt text shows no ALT badge in the timeline | Observed (iPhone) | @postcheck_test tests 55, 56, 58, 59c | not drawn |
| App polls: text choices are 302×34 outlined pills on a 34pt pitch, footer "0 votes · 22 hours 10 minutes left"; an image poll is a carousel of 213pt square images with the choice pill under each, footer "0 votes · 23h left" | Measured (iPhone) | @postcheck_test tests 57, 57b | not drawn |
| App: a quoted post's photo shows inside the quote embed, flush with its sides and bottom (321×171 in a 322pt embed) | Observed (iPhone) | @postcheck_test test 44 | `QuoteStub` |
| A typed link to an X article is a plain link: no card, no embed. Native X Article posts are different: X appends and hides a link to the article itself | Verified (web) | @postcheck_test test 46 (2100662935148536159, someone else's article) vs Vibewatch_io 2094476199401775577 (`twitterArticleReadView`) | `quoteUrl()` ignores articles; verify strips the self-link of `x-article-post` corpus posts |
| App: a trailing card link is hidden entirely (no "…"); Open Graph-only pages get a small card with X's placeholder thumbnail; a long post's card still shows when the link sits past the web's 280 cut, and the app does not fold it under 10 lines | Verified (iPhone) | @postcheck_test tests 20, 22, 24, 29, 07 captured 2026-09-17 | `x-post.tsx` |
| Small card: 1px border, 16px radius, square thumb 130/110/90px by viewport, domain/title/desc at 15px, 12px inset, 2px gaps | Measured | x.com DOM, post 2084312564763439379 | `link-card.tsx` |
| Large card: image, title in dark pill bottom-left, "From host" below, no border | Verified (app) | iPhone screenshots of 2095156793769120151 and 2098487491007496481 show exactly this. Web pixel metrics still unmeasured | `link-card.tsx` |
| A page with only a `<title>` (no Twitter Card or Open Graph tags): no card, link stays text. Open Graph without `twitter:card`: small card | Verified | @postcheck_test test 23 (`example.com`, no card), test 24 (Wikipedia, OG only → `card.layoutSmall`), test 22 (`twitter:card=summary` → small) | `unfurl` |

## Layout: web

| Rule | Status | Evidence | Code |
|---|---|---|---|
| Font stack: TwitterChirp then X's declared fallbacks | Measured | x.com computed `font-family` | `X_FONT_STACK` |
| Timeline: 600px column, 16px padding, 40px avatar, 8px gap → 518px body at 15px/20px | Measured | x.com DOM, reply cells on a status page | `devices.ts` |
| Post page body 17px/24px at 566px | Assumed | Classic client value. The logged-out client measured 15px/20px | `devices.ts` |
| Name row: name 700, badge 15px, handle + "·" + time in secondary, `ss01` on the handle | Measured | x.com DOM | `x-post.tsx` |
| Action icons 20px, counts 13px | Measured | x.com DOM | `x-post.tsx` |
| Dark colors: text #E6E9EA, secondary #71757A, row border #2B2E31, card border #323639, card bg #16181D, link #1D9BF0 | Measured | x.com computed colors | `theme.ts` |
| Light colors | Assumed | Classic palette from memory; no logged-in light measurement yet. Dim is gone: X retired it in 2025, so only Light and Dark are offered | `theme.ts` |
| Emoji rendered with the platform emoji font (no Twemoji images) | Measured | x.com body HTML for a post with 🛣️ | `X_FONT_STACK` |

## Layout: app

Ground truth for the app comes from two places: iPhone Mirroring captures of real posts (`fixtures/app`), and a CoreText oracle (`scripts/ios`) that lays text out with the font files from the X IPA. The oracle reproduces all 14 captured cells with Chirp-UI-VF at wght 300 / opsz 15 / tracking −0.2 in a 316–317pt column. The tool renders that in the browser with x.com's current web Chirp plus −0.32px tracking, which matches the app font's line widths to ±0.5px over 77 lines.


| Rule | Status | Evidence | Code |
|---|---|---|---|
| Timeline cell: 12px inset, 44px avatar, 8px gap, ~13px right; body 15px/20px in a column of screen width − 77 (316–317 on a 393pt iPhone 15 Pro); tracking −0.2 | Verified (oracle + iPhone) | Avatar and insets measured on captures (43.7pt, 10.9pt); column and tracking from the CoreText oracle fit (14/14 posts); `npm run verify` 47 exact, 2 within tolerance | `devices.ts`, `scripts/ios` |
| App folds the body when it runs past 9 rendered lines. Tail truncation on the last text line at or above line 9: keep the text through that line, drop at least one character, then drop whole words until " Show more" fits beside what's left | Verified (iPhone, 5 posts) | Captured through iPhone Mirroring on 2026-09-11, Vibewatch_io profile: 2097746764560552262 (10 lines → "See the list live ↓" shown as "live"); 2098487491007496481 (12 lines → "token price." → "token price"); 2092648171961041203 (10 lines, line 9 blank → line 8 "…saying on socials." shown as "…saying on", the token didn't fit after "socials"); 2096976856780329081 (**exactly 9 lines, no fold**, so the limit is "more than 9"); 2095156793769120151 (8 lines, no fold). The tool's iPhone 16 line counts matched every one. Untested: Android | `APP_MAX_LINES`, `appFoldCut()` |
| Exactly 9 rendered lines do not fold; 10 fold after line 9. The folded line loses its last character even when the whole line would fit beside the token ("nine" → "nin Show more"; a lone "a" → " Show more") | Verified (iPhone) | @postcheck_test tests 10, 11, 12, 13 (2100299700960370848, 2100299835433988437, 2100299967806263515, 2100300134030746111) captured 2026-09-17 | `APP_MAX_LINES`, `appFoldCut()` |
| A long post (over 280) under 10 rendered lines shows whole in the app, with no Show more; only the line fold applies | Verified (iPhone) | @postcheck_test tests 05, 06, 08 (372–381 characters, 8–9 lines): full text, no token | `renderFor()` phone branch |
| The app auto-translates non-English posts in the timeline (banner "Translated from Japanese", tap "Show translation" to see the original); x.com does the same with a "Show original" button | Observed | @postcheck_test test 03 on both clients, 2026-09-17. Captures must read the original | capture scripts |
| App post screen: stacked name/handle, body 16.5px/23px across width − 32, never folds, numeric date line ("9:19 AM · 8/26/26 · 518 Views") | Verified (iPhone) | Mirroring capture of 2092648171961041203's post screen; line pitch and the measured 356.6pt line width fit 16.5px, and all six line breaks match | `phonePost()` |
| Profile feed and home timeline render the same cell | Verified (iPhone) | 2095156793769120151 captured in the Following tab and on the profile: identical wraps and no fold | |
| Premium bold = Chirp Bold (weight 700) on web and app; italic = synthesized slant on web, upright bold in the iOS app | Verified (web) / Observed once (app) | x.com post page of Write/status/1646674962055565319: `bold` span weight 700, `italic` span font-style italic, both TwitterChirp. iPhone 15 Pro capture of the same post: both words bold and upright, and the app also bolded "formatting." which the web shows regular. The syndication feed carries no style ranges, so the harness composes this post with markers instead of importing it | `post-body.tsx` |
| Status bar, header, tabs, bottom bar chrome | Assumed | Drawn from memory for context, not measured | `phone-frame.tsx` |

## Fonts: two Chirp builds (measured 2026-09-11)

x.com's web client now ships a newer Chirp cut (`abs.twimg.com/responsive-web/client-web/Chirp-*.woff2`) that lays text out ~2.3% wider than the long-stable `abs.twimg.com/fonts/v2/chirp-*-web.woff2` files: the reference line "Every week, the 10 most active public voices in" measures 320.3px in the new build and 313.0px in v2 at 15px. Every one of 13 captured x.com timeline cells wraps exactly with the new build and not with v2. The iOS app's wraps, by contrast, match v2 to within a pixel (14 posts, all lines), so the tool renders web previews in the new build and phone previews in v2 (`TwitterChirpWeb` and `TwitterChirp` in `globals.css`). `npm run verify` measures the reference line in both and aborts if either drifts, which is how the next font change will be caught.

Even with the right build, iOS text layout is not Chrome's: across the 14 app posts, four lines wrap one word differently, and in every case the line is within 1px of the 322px body. Treat any line within a few pixels of the edge as a coin flip on device; the harness classes those as "within font tolerance" rather than failures.

### Fallback when X blocks its CDN

Chirp is proprietary and only ever loaded from X's CDN. GT America Standard Regular and Bold (Grilli Type, licensed for this site's domain, served by `/fonts/[file]`, never committed) sit behind it in every font stack. `font-tier.tsx` measures which font actually loaded and stamps `<html data-font>`; `globals.css` applies the tracking calibrated for that font (GT America: +0.128px against x.com, −0.196px against the app; residual sd ~1.6–2px over 77–120 lines) and the page shows a banner. `npm run verify -- --no-chirp` blocks the CDN and checks the degraded path: 44 exact, 5 within tolerance, 0 failed.

## Verifying: `npm run verify`

`scripts/verify.mjs` builds nothing and posts nothing. It starts the built tool in headless Chromium, types every post listed in `fixtures/web/*.json` (line breaks captured from x.com's DOM, logged in, 600px column) and `fixtures/app/*.json` (lines transcribed from iPhone Mirroring captures), and diffs the tool's rendered lines and Show more against them. Each post's text comes from X's saved JSON in `fixtures/posts`; a long post carries its whole text (`full_text`, from FxTwitter, saved by `fetch-fixture.mjs`) so the tool has to find X's cut itself. Current state: 126 exact, 5 within font tolerance, 0 failures. Add a post by capturing it, appending it to the fixture, and rerunning.

Capture gotcha: the logged-in timeline auto-translates non-English posts (the Japanese test 03 rendered as English with a spurious Show more, `lang="en"`). The capture reads the original only after clicking the post's "Show original" button; `capture-web.mjs` does that before extracting. Recorded 2026-09-17.

## Verifying against the app

`scripts/phone/README.md` describes the iPhone Mirroring capture setup used for every "Verified (iPhone)" row above.

## How Typefully's preview compares (measured 2026-09-11, in the Vibewatch workspace)

Typefully's preview is a useful sanity check but not ground truth; where it and X disagree, this tool follows X.

| What Typefully does | What X does | This tool |
|---|---|---|
| Visible "Characters" stat is raw UTF-16 length (336 for a 236-weight post; a 128-char URL costs 128, 👨‍👩‍👧‍👦 costs 11) | Weighted: link 23, emoji 2 | Weighted, like X. Typefully does apply the real weighting internally: its "Split automatically" button appears exactly when the weighted length passes 280 |
| Truncation is character-based and identical at every preview width; no line-based fold | The app folds after 9 rendered lines, so the cut depends on device width | Per-device line fold plus the 280 cut |
| Body 16px/20px on desktop, 15.3px/19.125px on the phone preview; font stack GT America / Helvetica Neue | 15px/20px TwitterChirp in both timelines | 15px/20px Chirp |
| Phone avatar 44px, 10px left inset, 323px text column at 393 wide | 40px avatar, 16px inset, 313px column (line breaks confirmed on three iPhone screenshots) | 313px |
| Link color #199AF5 | #1D9BF0 | #1D9BF0 |
| Card radius 14px, caption pill 13px on rgba(0,0,0,.7) | 16px radius, pill on the image bottom-left, "From host" below | As X |
| Shows the raw URL as text when the post is truncated, hides it when expanded | Unverified either way | Hides a trailing card URL whether or not the post is cut |
| Device list: iPhone SE 375×667, iPhone 16 393×852, iPhone 17 / Pro 402×874, iPhone Air 420×912, iPhone 17 Pro Max 440×956, Galaxy S25 360×780, Pixel 10 412×923 | | Same list adopted |

## Open questions (send screenshots)

1. Is the fold limit the same on Android?
6. ~~Test 07: does the app show the card when the link sits behind the web cut?~~ Yes (iPhone capture 2026-09-17), and the web shows the card too.
2. ~~Does the web client ever fold by line count?~~ No: a 30-line post shows in full with no Show more (@postcheck_test test 13, 2100300134030746111).
3. Large card on x.com today: title pill or plain? "From host" line present?
4. ~~Two links, both with cards: which one renders?~~ The first (@postcheck_test tests 25–28).
5. Light-theme colors on the logged-in client.
