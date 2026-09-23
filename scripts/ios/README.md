# iOS text-layout oracle

The iOS app has no DOM, but its line breaks come from CoreText, which macOS
also ships. With the app's own font files, `layout.swift` lays the corpus text
out the way the app does and `fit.mjs` finds the font/size/column combination
that reproduces the phone captures.

## Getting the app's fonts (not redistributed; `.fonts/` is gitignored)

The fonts are X's. They are used here only to measure how the app breaks
lines on your own machine; never commit them, never serve them, never share
the extracted files.

1. Install Apple Configurator, connect the iPhone, Actions → Add → Apps… → X.
   While it downloads, copy the IPA out of
   `~/Library/Group Containers/K36BKF7T3D.group.com.apple.configurator/…/*.ipa`
   (ipatool can't sign in to accounts with Advanced Data Protection).
2. `unzip -j x.ipa 'Payload/Twitter.app/TwitterSharedResources_TFNUIAppResources.bundle/Chirp*' -d .fonts/app`

The app bundles static Chirp (Regular/Medium/Bold/Heavy .otf, identical in
metrics to x.com's `fonts/v2` web files) and `Chirp-UI-VF*.ttf`, a variable
font with Weight (300–800, default 300) and Optical size (11–31, default 31)
axes. Its 2026-01 build is the newest file.

## Running

    swiftc -O scripts/ios/layout.swift -o scripts/ios/layout
    node scripts/ios/fit.mjs                       # fonts × widths vs fixtures/app
    FONTS=Chirp-UI-VF-With-Overriden-Emoji-202601.ttf AXES="2003265652=400,1869640570=15" WIDTHS=320,336,0.5 DIFF=1 node scripts/ios/fit.mjs

`fit.mjs` draws text the way the app does: links as their display text, media
links dropped, a hidden trailing card link removed, mentions and links as
separate attribute runs (CoreText does not kern across runs), and a word joiner
after in-word hyphens because the app never breaks "quantum-resistant" at the
hyphen.

## Findings (2026-09-15, iPhone 15 Pro, 393pt)

- All 14 captured timeline cells reproduce line-for-line with the variable
  Chirp at 15pt in a 329.5–330px column (opsz 15, wght 400), or equivalently
  at opsz 31 in a 309.5px column. Line breaks only depend on the ratio of glyph
  widths to column width, so these are the same model.
- Absolute geometry, resolved: both text-size settings were at default. The
  widest captured line spans ~317pt starting 63.5pt in, the avatar measures
  43.7pt at an 10.9pt inset, and the app applies −0.2pt tracking to Chirp.
  With wght 300 / opsz 15 / kern −0.2 the oracle reproduces 14/14 at a
  316–317pt column = 12 inset + 44 avatar + 8 gap, ~13 right.
- Browser rendering: neither web Chirp build is the app's variable font, so
  the tool calibrates. Least squares over 77 captured lines: x.com's current
  web Chirp needs −0.320px tracking (residual sd 0.47px, max 1.47px); the old
  fonts/v2 build would need −0.146px but is three times worse (sd 1.56px).
- The post screen at 17pt reproduces the one captured post at any column
  width from 358 to 370px; 361 (screen − 32) fits.

## Also here

- `measure.swift`: typographic width of lines in a given font/size/axes (`KERN` env for tracking).
  Build with `swiftc -O scripts/ios/measure.swift -o scripts/ios/measure`.
- `scripts/phone/png.py`: minimal PNG reader used to measure pixel extents in captures.
- Raw captures behind `fixtures/app` are kept in `.captures/` (gitignored).
