# The test corpus

`corpus.json` is the canonical list of real posts every rendering rule is checked against. It exists so
a formatting change on X's side (a new font build, a different fold rule, a card redesign) shows up as a
failing post id rather than a hunch. Keep ids stable; add posts, don't swap them.

## How a re-test works

1. `npm run capture:web` — logs into x.com from a saved browser profile (`--login` the first time, headed),
   opens each account's profile timeline at a 600px column, scrolls until every corpus id has been seen,
   and rewrites `fixtures/web/<handle>.json` with the rendered lines, Show more, card kind and media per post,
   plus the Chirp font URL x.com served and the reference-line width.
2. App captures: `scripts/phone/README.md` (iPhone Mirroring). Transcribe lines into `fixtures/app/<device>.json`.
   OCR of the captures is the next automation step.
3. `node scripts/fetch-fixture.mjs` (no args) refreshes `fixtures/posts/*.json` (X's own entities and
   display range) for every corpus id.
4. `npm run verify` renders every corpus post in the tool and diffs against the captures.

A diff in step 4 with unchanged tool code means X changed something. Check the font line the harness
prints first; a width shift there explains most line-break diffs at once.

## What the corpus covers

| Area | Posts (tags in corpus.json) |
|---|---|
| 280 cut / long posts, web Show more | 2085516290941472896, 2089427094224974124, 2087977514631381502, 2087554813450203482, 2098520148391190575, 2093440498879152216, 2090888939360203059 |
| App fold past 9 lines (char drop, blank line 9, mid-number) | 2097746764560552262, 2098487491007496481, 2092648171961041203, 2098520148391190575 |
| App no-fold boundaries (8 and exactly 9 lines) | 2095156793769120151, 2096976856780329081 |
| Large cards, YouTube cards, trailing URL hidden | 2098487491007496481, 2095156793769120151, 2097429649861325082, 2098520161620042133, 2093440511298384031, 2090888922197103072 |
| Photo with trailing URL kept visible | 2097746764560552262 |
| Media sizes and layouts: one photo (landscape, portrait), 2/3/4 photos, GIF, video, alt text, mixed-media carousel; text and image polls; quote of a photo post | @postcheck_test 44, 50–58, 57b, 59b, 59c |
| Video, self-captioned video card | most goodforbtc posts; 2098472217487212983, 2093398716619370983 |
| Native X Article posts (the trailing article link is X's, hidden) | 2094476199401775577, 2092329594993234037 |
| A typed link to an X article: plain link, no card | @postcheck_test 46 |
| Quotes: post link anywhere becomes the quote, hidden only when last, beats a link card; replies; leading @ | @postcheck_test 40–49 |
| Mentions with trailing punctuation / possessives | 2094822883201868125, 2095546954688380962, 2094118251437666695 |
| Emoji and arrows | 2097746764560552262, 2095156793769120151, 2094476199401775577, 2098520148391190575 |
| Cards: first link wins, no fallback, OG-only small, no-meta none; trailing link visible unless carded | @postcheck_test 20–32 (tags t20–t32) |
| App line fold boundaries (8, 9, 10, 30 lines), one character eaten | @postcheck_test 10–13 |
| Long posts under 10 app lines: no fold; link/emoji/word straddling 280 on the web | @postcheck_test 05–08 |
| Hyphen wrapping, unbreakable word, blank lines, spaces | @postcheck_test 14–17 |
| Exactly 280: Latin, CJK, emoji weights | @postcheck_test 01, 03, 04 |
| Lines within 1px of the body edge (font tolerance) | 2092648171961041203, 2097429649861325082, 2095546954688380962, 2094118251437666695 |

## Gaps (add a post when one exists)

`TEST-POSTS.md` is the plan for closing these on purpose: one post per edge case from a dedicated account.


Hashtags and cashtags · RTL text · Android captures · the app's post screen for more than one post
· x.com post page (focal) captures beyond the one measured by hand.
