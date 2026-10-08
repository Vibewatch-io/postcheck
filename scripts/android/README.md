# Capturing the X Android app on a USB phone

The Android counterpart of `scripts/phone/` (iPhone Mirroring). It drives a real phone over `adb`,
because X refuses to sign in on the Android emulator ("Please use official X apps to proceed or try
again later", with a password and with Google sign-in alike, on a Google Play image, October 2026).

## Setup (once)

```bash
brew install --cask android-platform-tools   # adb
brew install scrcpy                          # optional live mirror
```

On the phone: Settings → About phone → tap Build number 7 times; Settings → System → Developer
options → USB debugging on (and Stay awake on, so it doesn't lock while plugged in). Connect it with
a data cable, accept "Allow USB debugging?" (tick "Always allow from this computer"), sign in to X
on the phone. `adb devices` should list it. Set `ANDROID_SERIAL` if more than one device is attached.

## Matching the target widths

The rig phone is a Pixel 3 on Android 12 (1080×2160 px, 440 dpi = 392 dp wide). The two Android
devices in `src/lib/devices.ts` are both 1080 px wide, so a density override gives the exact layout
width the app sees:

| `android.sh dp` | Density | App layout | Stands in for |
|---|---|---|---|
| `360` | 480 | `sw360dp-w360dp-h679dp` | Galaxy S25 class, 360 dp |
| `412` | 420 | `sw411dp-w411dp-h776dp` | Pixel 10 class: a real 1080 px Pixel at 420 dpi lays out at 411.4 dp, the same as here |
| `reset` | 440 | `sw392dp-w392dp-h741dp` | the phone's own default |

Only the width matches; the Pixel 3 is shorter (2160 px), so fewer posts fit on a screen. Font scale
stays 1.0 and Display size is whatever the override sets. `dp` force-stops X so the next `open` lays it out fresh.
**Run `android.sh dp reset` at the end of every session**: the override survives reboots.

Captures are 3 px per dp at `dp 360` (density 480 / 160) and 2.625 px per dp at `dp 412`.

## Capturing

```bash
scripts/android/android.sh dp 360
scripts/android/android.sh open 'https://x.com/search?q=%22Fold%20test%2012%22%20from%3APostcheck_test&f=live'
scripts/android/android.sh cap t12-360          # → scripts/android/t12-360.png (gitignored)
scripts/android/android.sh dp reset
```

- `open <x.com URL>` hands the link to the X app. A search URL (`"<post's first words>" from:Postcheck_test`)
  lands on one timeline cell without scrolling a profile; a profile URL gives the profile timeline;
  `/<handle>/status/<id>` gives the post screen (a different layout, not a timeline cell).
- `tap x y`, `scroll x y dy` (positive = further down the page) and `back` take capture pixels.
- `adb shell uiautomator dump` works on the X app: each post body is one node whose `text` is the
  full post and whose `bounds` locate it, handy to find a post while scrolling a profile.
- `view` opens a live scrcpy mirror for watching.
- Transcribe lines into `fixtures/app/galaxy-s25.json` (360 dp) or `fixtures/app/pixel-10.json` (412); move the screenshots to `.captures/android-pixel3/` (gitignored), like the iPhone captures in
  `.captures/iphone-15-pro/`. Never commit screenshots.
- A search lists every post that matches, so lookalikes ("Native quote of a card post" with and without a link) share a
  screen: match the cell by its whole text, not its first words. Cut posts end their text node with " Show more".
- X shows "A new version is ready!" on most launches while an update waits: dismiss it with `back`, never "Install now"
  (a new X version would move the fixtures' baseline). It auto-translates test 03: tap "Show original" (a view toggle).

**Navigation only**: open links, scroll, go back. Never tap like, repost, reply, follow, bookmark or
compose, and never the floating + button.

## Each session needs the phone's owner for

- Plugging the phone in, unlocking it (PIN) if it locked, and approving the USB debugging prompt
  if this Mac isn't remembered.
- Signing in to X again if the session expired. Passwords are always typed by the owner, never by a script or an agent.

## Findings

Recorded in QUIRKS.md (Android rows) with `fixtures/app/galaxy-s25.json` and `fixtures/app/pixel-10.json`, which `npm run verify` checks:

- **No line fold.** The Android app shows a post under 280 whole however many lines it runs (tests 11,
  12 and 13: 9, 10 and 30 lines). The iPhone app folds test 12 after line 9.
- **The 280 cut, like x.com.** Long posts get Show more at the same character as the web (tests
  05–08).
- **Cell geometry.** The body runs from 60 dp to width − 12 dp (column = width − 72) at x.com's web
  tracking, 15/20 at 360 and 392 dp and 16/21.33 at 411.4 dp (the switch, between 392 and 411.4, is assumed at 400).
- **Wrapping.** No break after a hyphen (an over-long word breaks at the last character that fits); a link breaks
  after a "/"; the Show more token wraps like two words, so "Show" can end a line with "more" on the next (tests 05, 94, 116).
- **Links.** A trailing link to a post stays as text above the quote (x.com and the iPhone hide it).
- **Styling.** The timeline row shows no Premium bold or italic (tests 70, 70b), like the iPhone's.
