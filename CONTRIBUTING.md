# Contributing

The most useful contribution is a post that Postcheck gets wrong. X changes things without notice, and every mismatch we hear about becomes a fixture that keeps the tool honest from then on.

## Reporting a post that didn't render 1:1

Use the "Tell us" link under the preview, which fills in the view, theme and font you had, or [open a "Looks different on X" issue](../../issues/new?template=render-mismatch.yml) directly. It asks for:

1. The post URL (it must be public; that's the only kind X has).
2. Where you saw it: the iPhone app, the Android app or x.com.
3. A screenshot of the real thing.
4. A screenshot of what Postcheck showed, with any note above the preview (a font notice appears there when X's font didn't load): line breaks depend on the font that loaded, and the GT America and system-font tiers are calibrated but not exact.

Which words or lines differ, and which phone or computer you used, help but are optional.

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
