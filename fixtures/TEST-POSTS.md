# Test posts for a dedicated account

The corpus in `corpus.json` is real posts from real accounts, which means it only covers what those
accounts happened to post. This is the other half: a throwaway account that posts one edge case per post,
on purpose, so every rendering rule has a post that proves it on the web, on iPhone and on Android.

Each post below has exact text (copy it verbatim; the length tests are counted to the character with
the tool's own counter), what it tests, and which QUIRKS.md row or open question it settles.

## Before posting

- **Account.** A fresh X account used for nothing else. Turn on X Premium for one month: posts over 280
  characters, bold/italic and the edit window need it (tests marked **P**).
- **Pace.** A new account posting links, hashtags and mentions in bulk gets rate-limited or labelled as
  spam, and a labelled account renders differently. Spread the posts over several days, a handful at a
  time, and don't follow, like or reply to anyone else.
- **Mentions.** Only mention accounts you control (`@Vibewatch_io`, `@marshallmixing`) so no one else
  is notified. The test account is **@postcheck_test**.
- **Order matters.** Quote and link-to-post tests reference earlier posts (`<ID 01>` means the URL of
  post 01). Post in number order and record each post's URL as you go.
- **Record.** Add every post id to `corpus.json` under the new account, with the test number as a tag.

## Capturing each post

For every post, capture:

| Code | Where | How |
|---|---|---|
| W | x.com profile timeline, 600px column | `npm run capture:web` |
| F | x.com post page (focal view) | open the post, same script with the post URL |
| I | iPhone app timeline | iPhone Mirroring, `scripts/phone/README.md` |
| IP | iPhone app post screen | tap into the post |
| A | Android app timeline, 360 and 412 dp | Android Studio emulator (next phase) |

Light and dark theme only matter for the colour tests (**C1–C2**); everything else is theme-independent.

---

## 1. Length and the 280 cut

| # | Text | Tests |
|---|---|---|
| 01 | see block | Exactly 280 weighted characters, ends on a whole word: no Show more anywhere. |
| 02 | see block | 257 characters + a trailing link = 280: every URL counts 23, link hidden, card shown. |
| 03 | see block | 140 CJK characters = 280 (weight 2 each). Also CJK line breaking with no spaces. |
| 04 | see block | Family ZWJ emoji, flag and skin-tone emoji each weigh 2; the tool counts this as 279. If X lets you type one more character, the emoji rule is wrong. |
| 05 **P** | 281+ characters where the 280th character ends a word | A word ending exactly on 280 stays visible (the fix from 2026-09-15). |
| 06 **P** | 281+ characters where character 280 falls mid-word | The cut backs up to the previous space. |
| 07 **P** | 281+ characters where a link straddles 280 | Does the cut land before the link, or keep it? |
| 08 **P** | 281+ characters with an emoji straddling 280 | Emoji weight at the cut. |

```text
01
Length test A: this post is exactly 280 weighted characters and ends on a whole word. the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps.
```

```text
02
Length test B: text plus one link, where every link counts as 23 characters no matter how long it is. and so on and so on and so on and so on and so on and so on and so on and so on and so on and so on and so on and so on and so on and so on and so on and. https://vibewatch.io
```

```text
03
CJK test: 日本語のテキストは一文字が二文字分として数えられます。日本語のテキストは一文字が二文字分として数えられます。日本語のテキストは一文字が二文字分として数えられます。日本語のテキストは一文字が二文字分として数えられます。日本語のテキストは一文字が二文字分として数えられます。
```

```text
04
Emoji test: family emoji count as two 👨‍👩‍👧‍👦 flags too 🇺🇸 skin tones 👍🏽 and this line runs right up to the limit ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok 🚀
```

```text
05  (the word "dog" ends exactly on character 280)
Long test 05: the word before Show more ends exactly on character 280. the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog and this sentence keeps going past the cut so the post needs Show more on the web timeline.
```

```text
06  (character 280 falls inside "extraordinarily")
Long test 06: character 280 falls in the middle of a long word here. the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a extraordinarily and this sentence keeps going past the cut so the post needs Show more on the web timeline.
```

```text
07  (the link covers characters 270–292)
Long test 07: a link starts before character 280 and ends after it. the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a https://vibewatch.io and this sentence keeps going past the cut so the post needs Show more on the web timeline.
```

```text
08  (the 🚀 is characters 280–281)
Long test 08: an emoji starts on character 280 and ends on 281. the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the quick brown fox jumps over a lazy dog the..🚀 and this sentence keeps going past the cut so the post needs Show more on the web timeline.
```

## 2. Line breaks and the app's 9-line fold

| # | Text | Tests |
|---|---|---|
| 10 | 8 short lines (`one` … `eight`, one per line) | App: no fold. |
| 11 | 9 short lines | App: exactly 9, fold or not? (corpus has one natural case; this isolates it) |
| 12 | 10 short lines | App: folds after line 9. |
| 13 | 30 lines of `a` | Open question 2: does the **web** ever fold by line count? |
| 14 | Paragraph, blank line, paragraph, 3 blank lines, paragraph | Does X keep or collapse repeated blank lines? |
| 15 | A 60-character unbroken word: `Supercalifragilisticexpialidocious-and-then-some-more-letters` mid-sentence | Where an unbreakable token wraps; app never breaks at hyphens. |
| 16 | Several hyphenated words positioned to land at a line end on 393pt (`state-of-the-art`, `quantum-resistant`) | Web breaks at the hyphen, app doesn't. |
| 17 | `word  word   word` (double and triple spaces), a tab, and leading/trailing spaces | Whitespace collapsing and trimming. |

## 3. Links and cards

| # | Text | Tests |
|---|---|---|
| 20 | `Large card, link at the end https://github.com/vercel/next.js` | Trailing link hidden, `summary_large_image` card. |
| 21 | `Large card, link https://github.com/vercel/next.js in the middle of the sentence` | Link text stays visible and card shows. |
| 22 | `Small card https://developer.mozilla.org/en-US/docs/Web/HTML` | `twitter:card=summary` layout (square thumbnail). Corpus gap. |
| 23 | `No card tags https://example.com` | Plain link, no card, URL visible even when last. |
| 24 | `OG image but no twitter:card https://en.wikipedia.org/wiki/Twitter` | What X falls back to when only Open Graph is present. |
| 25 | `Two cards https://github.com/vercel/next.js and https://vibewatch.io` | Open question 4: which link gets the card? |
| 26 | `Two cards, reversed https://vibewatch.io and https://github.com/vercel/next.js` | Same, order swapped: last wins, or first card-capable? |
| 27 | `Card then no card https://vibewatch.io and https://example.com` | Card-capable link first, plain link last. |
| 28 | `Three links https://example.com https://vibewatch.io https://news.ycombinator.com` | Three links, card from the middle one? |
| 29 | `Long link https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/router-utils/resolve-routes.ts?plain=1#L10` | Display truncation: 15 path characters + `…`. |
| 30 | `Bare domain vibewatch.io and example.ai and file.zip` | Which bare domains X links. |
| 31 | `Punctuation (https://vibewatch.io). And https://vibewatch.io, then "https://example.com"` | Trailing `)`, `.`, `,` and quotes excluded from links. |
| 32 | `Email user@vibewatch.io is not a mention or a link` | `@` inside a word; domain after `@`. |

## 4. Posts, quotes and articles

| # | Text | Tests |
|---|---|---|
| 40 | `Link to a post at the end <ID 01>` | Post link becomes a quote card; URL hidden. |
| 41 | `Link to a post <ID 01> in the middle` | Quote card plus visible link text? |
| 42 | Quote of post 01: `Native quote of a text post <ID 01>` (a post URL at the end is stored exactly like the Quote button's result; the Quote button in the browser pane produced replies on 2026-09-17, kept as 47a–c) | Quote card layout. Corpus gap; the tool currently draws a stub. |
| 43 | Native quote of post 20 (the card post) | Quoted post with a card: is the card shown inside the quote? |
| 44 | Quote of post 50 (the photo post), after group 5 | Quoted post with media. |
| 45 | Native quote with text + an external link `https://vibewatch.io` | Quote vs link card: which wins? |
| 46 | `Link to an X article <an x.com/i/article URL>` | Article card. |
| 47 | Reply to post 01 from the same account | "Replying to" line, thread connector, and whether replies render differently in the profile. |
| 48 | Post starting with a mention `@Vibewatch_io this starts with a handle` | Leading mention: shown as a reply? who sees it? (settles the leading-mention tip) |
| 49 | `.@Vibewatch_io this starts with a dot` | The old workaround, for comparison with 48. |

## 5. Media

| # | Content | Tests |
|---|---|---|
| 50 | One landscape photo + `https://vibewatch.io` at the end | Photo beats card; link text stays visible. (Corpus has one; this is a controlled copy.) |
| 51 | One tall portrait photo | Crop/aspect ratio cap in the timeline. |
| 52 | Two photos | Layout. Corpus gap; the tool shows one image only. (Web: side by side, no grid.) |
| 53 | Three photos | Layout. (Web: sideways carousel.) |
| 54 | Four photos | Layout. (Web: sideways carousel, no 2x2 grid.) |
| 55 | A GIF | GIF badge and layout. Corpus gap. |
| 56 | A short video | Video poster and duration badge. |
| 57 | Poll with 4 options | Poll layout. Corpus gap; the tool doesn't draw polls. |
| 58 | Photo with alt text | ALT badge. |
| 57b | Poll with 4 options, an image on each choice (tiles 1–4) | Image poll layout (`poll_choice_images` card). The first web attempt never uploaded the choice images; it worked after a page refresh. |
| 59b | A photo and a video | Mixed media in one post. |
| 59c | Photo, GIF, video, photo | Mixed media with badges. |

Files for this group are generated, with known sizes, in `fixtures/media/` (tiles 5–12 are spares). The web
composer takes at most 4 items ("Please choose up to 4 photos, videos, or GIFs."), so the planned 5+ photo
tests (59a, 59d) were dropped. Posted 2026-09-23.

## 6. Entities

| # | Text | Tests |
|---|---|---|
| 60 | `Hashtags #postcheck #test_underscore #123 #日本語 #émoji and #end.` | Which hashtags link (numbers-only doesn't), CJK and accented tags, trailing punctuation. |
| 61 | `Cashtags $BTC $STX $ABCDEFG $1 and $btc` | 1–6 letters link, 7 don't, digits don't, lowercase? |
| 62 | `Mentions @Vibewatch_io, @marshallmixing's and @Vibewatch_io.` | Trailing comma, possessive, period. |
| 63 | `A 16-character handle @abcdefghijklmnop does not link` | 15-character limit. |
| 64 | `Mention of an account that doesn't exist @zz_no_such_q9` | Does X link non-existent handles? |
| 65 | `a@Vibewatch_io and hi@Vibewatch_io` | `@` preceded by a letter. |

## 7. Text and formatting

| # | Text | Tests |
|---|---|---|
| 70 **P** | `This has **bold** and __italic__ and **__both__**` (typed with the X composer's own B / I buttons) | Premium bold/italic: weight 700 on web and app, iOS italic shown as upright bold (seen once; confirm). |
| 71 | Lines starting `• `, `- ` and `1. ` | Bullet characters render as typed; no list styling. |
| 72 | `مرحبا بالعالم Hello world שלום` | Mixed right-to-left text. Corpus gap. |
| 73 | `ภาษาไทยไม่มีช่องว่างระหว่างคำ` repeated to 3 lines | Thai (no spaces) line breaking. |
| 74 | `Unicode "bold" 𝐭𝐞𝐱𝐭 counts double` | Mathematical alphanumerics: weight 2 each (the tool must never generate these, but should count them right). |

## 8. Identity and chrome

| # | Change | Tests |
|---|---|---|
| 80 | Display name at 50 characters, with an emoji | Name truncation next to handle and timestamp, web and app. |
| 81 | Display name of one character | Minimum. |
| C1 | Any text post, captured in light theme | Light colours on the logged-in client (open question 5). |
| C2 | Same post, dark theme | Dark colours, already measured; re-confirm. |

---

## What the tool can't draw yet

Posts 42–45 (native quotes), 52–55 (multiple photos, GIF), 56 (video badge) and 57 (polls) test layouts
the tool doesn't render today. Capture them anyway: they are the spec for building those features, and the
harness can check line breaks around them before the media itself is drawn.

## After capturing

1. `node scripts/fetch-fixture.mjs` for the new ids.
2. Transcribe app captures into `fixtures/app/<device>.json`.
3. `npm run verify`. Every failure is either a rule to fix or a gap to build; log it in QUIRKS.md.
4. Move each open question in QUIRKS.md to a verified row, citing the test number.
