## What changed

## Where the value was measured

x.com DOM, X's JSON, the CoreText oracle or a device capture count as measured. Say which, and for which post ids. Anything else is inferred and the QUIRKS.md row must say so.

## Checklist

- [ ] Fixture added or refreshed (`node scripts/fetch-fixture.mjs <url>`, id in `fixtures/corpus.json`)
- [ ] `QUIRKS.md` row added or updated in this PR
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` pass
- [ ] `npm run verify` ends with `0 failed` (say if you couldn't run it)
- [ ] No font files, no credentials, nothing that writes to an X account
