# Contributing

The most useful contribution is a post that Postcheck gets wrong. X changes things without notice, and every mismatch we hear about becomes a fixture that keeps the tool honest from then on.

## Reporting a post that didn't render 1:1

[Open a "Post rendered differently" issue](../../issues/new/choose) with:

1. The post URL (it must be public; that's the only kind X has).
2. Where you saw it: x.com timeline or post page, the iOS app, or the Android app, plus the device or window width if you know it.
3. A screenshot of the real thing.
4. What Postcheck showed instead (a screenshot or the PNG export), and which words or lines differ.

Line breaks depend on the font that loaded. If the banner above the preview says GT America or the system font is in use, say so; those tiers are calibrated but not exact.

If an author asks for their post to be removed from the fixtures, we remove it.

## Fixing it yourself

Most fixes are one constant in `src/lib/devices.ts` or `src/lib/theme.ts`, or one rule in `src/lib/advice.ts`. A PR that changes a rendering rule needs three things:

- **Where you measured the new value.** x.com's DOM, X's JSON, the CoreText oracle or a device capture count as measured. Anything else is inferred, and the QUIRKS.md row should say so.
- **The post as a fixture.** `node scripts/fetch-fixture.mjs <url>` snapshots X's own data for it into `fixtures/posts/`. Add its id to `fixtures/corpus.json` under the account, and its captured lines to `fixtures/web/<handle>.json` or `fixtures/app/<device>.json` if you captured them.
- **QUIRKS.md updated in the same commit.** Add a row or change the status of one.

Then run the gate:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run start &
npm run verify        # must end with 0 failed
```

`verify` needs a build, the server running, Chromium (installed by Playwright on `npm install`) and access to X's CDN for Chirp.

## Ground rules

- Test accounts are read-only. Nothing in this repo may post, like, repost, reply or follow, and the capture scripts must stay that way.
- Never commit font files. Chirp is X's and GT America is licensed; both are gitignored under `.fonts/`.
- Reach advice must not contradict [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm). If the ranker's source doesn't support a claim, the tool doesn't make it.
- Keep the UI copy short. Every tip states a mechanism, not a style preference.
