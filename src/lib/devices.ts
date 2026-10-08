export type ViewKind = "web" | "focal" | "phone";

export interface Device {
  id: string;
  label: string;
  kind: ViewKind;
  /** CSS px width of the column (web) or the screen (phone). */
  width: number;
  height?: number;
  /** Width available to the post body text. */
  textWidth: number;
  fontSize: number;
  lineHeight: number;
  /** Export pixel ratio (phones are 3x panels). */
  pixelRatio: number;
  /** Phone corner radius and Dynamic Island / notch style. */
  radius?: number;
  /** The app folds the body behind Show more past this many rendered lines (see QUIRKS.md). */
  maxLines?: number;
  island?: "dynamic-island" | "notch" | "punch-hole" | "none";
  /** Phones only: which X app. They fold long posts differently (see renderFor in postcheck.tsx). */
  platform?: "ios" | "android";
  /** Phones only: the timeline cell or the post detail screen. */
  view?: "timeline" | "post";
  /** Which Chirp build lays the text out (see globals.css). */
  font: "web" | "app";
  /** Which calibrated tracking applies: x.com's (web) or the app's (app). See globals.css. */
  pane: "web" | "app";
  /** Drawn without a phone around it: the visitor's own phone (see thisPhone). */
  frameless?: boolean;
  /** How tips name it, when the label reads badly mid-sentence ("On this phone that paragraph…"). */
  tipLabel?: string;
}

// Web numbers were measured on x.com (Sept 2026): a 600px column with 1px
// borders and 16px padding = 566px of content; avatar 40px + 8px gap leaves
// 518px for timeline text. The post page runs the text under the header at
// full 566px. Phone numbers assume the app's 16px inset, 40px avatar and 8px
// gap, so body width = screen width − 80.
/**
 * The iOS app folds a post behind "Show more" past this many rendered lines, even
 * under 280 characters; the web shows all of it. The Android app has no line fold:
 * it cuts at 280 like the web (@postcheck_test tests 05–08 and 11–13 on Android 12). Three iPhone samples from
 * Vibewatch_io: 8 lines → no fold; 10 and 12 lines → 9 shown. Exactly 9 lines
 * do not fold (@postcheck_test test 11); 10 fold after line 9 (test 12). See QUIRKS.md.
 */
export const APP_MAX_LINES = 9;

const phone = (
  id: string,
  label: string,
  width: number,
  height: number,
  island: Device["island"],
  radius = 54,
  platform: Device["platform"] = "ios",
): Device => ({
  id,
  label,
  kind: "phone",
  width,
  height,
  // App cell: 12px inset, 44px avatar, 8px gap, ~13px right → column = width − 77 (the oracle's window is 316–317).
  // CoreText with the app's own Chirp-UI (wght 300, opsz 15, tracking −0.2)
  // reproduces all 14 captured cells at 316–317px on a 393pt iPhone 15 Pro.
  // In the browser, x.com's current web Chirp with −0.32px tracking matches
  // that font's line widths to ±0.5px (77 lines, see scripts/ios/README.md).
  // Android (X 12.31 on a Pixel 3 at 360 and 411.4 dp): the body runs from 60dp to width − 12dp, so
  // column = width − 72; four lines of test 05 match x.com's untracked web Chirp at 15px to within ink side
  // bearings, with a 20dp pitch below 400 dp (scripts/android/README.md; the wide-screen size is below).
  textWidth: platform === "ios" ? width - 77 : width - 72,
  pane: platform === "ios" ? "app" : "web",
  // Android sets the body at 16/21.33 on a wide screen: the same lines measure 6.4% wider at 411.4 dp than at
  // 360 and 392 dp, and the pitch is 56px at 2.625 px/dp (@postcheck_test tests 01–08 on a Pixel 3). The
  // switch lies between 392 and 411.4 dp; 400 (Android's sw400dp resource bucket) is inferred.
  fontSize: platform === "android" && width >= 400 ? 16 : 15,
  lineHeight: platform === "android" && width >= 400 ? 64 / 3 : 20,
  pixelRatio: 3,
  radius,
  island,
  maxLines: platform === "ios" ? APP_MAX_LINES : undefined,
  platform,
  view: "timeline",
  font: "web",
});

/**
 * The app's post screen: stacked name/handle header, body at 17px/24px across
 * the full width minus 16px insets, no fold. Measured from an iPhone Mirroring
 * capture (402pt device) of Vibewatch_io/status/2092648171961041203: 24pt line
 * pitch, and "🐝 Receive automatic weekly reports about what" spans ~371pt,
 * which Chirp gives at 17px (369.8).
 */
const phonePost = (d: Device): Device => ({
  ...d,
  id: `${d.id}-post`,
  label: `${d.label} · post`,
  textWidth: d.width - 32,
  fontSize: 17,
  lineHeight: 24,
  maxLines: undefined,
  view: "post",
});

/**
 * The iOS app's timeline row draws a Premium-styled post with no bold or italic at all, short or
 * folded; the styling shows once a long row is expanded with Show more, and on the post screen
 * (@postcheck_test tests 70 and 70b, iPhone 15 Pro). The Android row drops it too, short or cut at 280
 * (tests 70 and 70b on a Pixel 3; its expanded row is assumed to match the iPhone's). Likely an X bug,
 * but the preview shows it as it is.
 */
export function rowHidesStyles(d: Device, expanded = false): boolean {
  return (d.pane === "app" || d.platform === "android") && d.view === "timeline" && !expanded;
}

/**
 * One entry per screen width in points, since that is what moves line breaks: each label names the
 * models that share the width. Ordered by how many people read on it. TelemetryDeck's iPhone model
 * survey (week of 2026-09-28, top 10 models in use) totals 402pt 32.6%, 393pt 28.4%, 390pt 19.5%,
 * 440pt 19.5%; the 430, 420 and 375pt screens are outside its top 10. The iPhone 18 Pro and 18 Pro Max
 * (Sept 2026) keep the 17 Pro's 402 and 17 Pro Max's 440 (Apple: 2622x1206 and 2868x1320 at 460 ppi,
 * 3x). Ids are kept from earlier labels: share links and the fixtures name devices by id.
 */
const PHONES: Device[] = [
  phone("iphone-17", "iPhone 17 / 16–18 Pro", 402, 874, "dynamic-island"),
  phone("iphone-16", "iPhone 15 / 16 / 14–15 Pro", 393, 852, "dynamic-island"),
  phone("iphone-13", "iPhone 12 / 13 / 14 / 16e / 17e", 390, 844, "notch", 47),
  phone("iphone-17-pro-max", "iPhone 16–18 Pro Max", 440, 956, "dynamic-island", 62),
  phone("iphone-16-plus", "iPhone 15–16 Plus / 14–15 Pro Max", 430, 932, "dynamic-island", 55),
  phone("iphone-air", "iPhone Air", 420, 912, "dynamic-island", 58),
  phone("iphone-se", "iPhone SE / 12–13 mini", 375, 667, "none", 0),
  phone("galaxy-s25", "Galaxy S25", 360, 780, "punch-hole", 36, "android"),
  phone("pixel-10", "Pixel 10", 412, 923, "punch-hole", 40, "android"),
];

/** The phone most people read on (the 402pt group, see PHONES), shown first. */
export const DEFAULT_PHONE_ID = "iphone-17";

export const THIS_PHONE_ID = "this-phone";

/**
 * The visitor's own phone, when they open the site on one: a phone's page width in CSS pixels is its
 * screen width in points (dp on Android), the unit the X app lays out in, so a timeline cell drawn at
 * that width is the app's own layout. Same cell geometry and fold rules as the phone list (QUIRKS.md),
 * drawn edge to edge with no frame. Assumes default text size, like every capture.
 */
export function thisPhone(width: number, height: number, platform: "ios" | "android"): Device {
  return { ...phone(THIS_PHONE_ID, `This phone (${width})`, width, height, "none", 0, platform), frameless: true, tipLabel: "this phone" };
}

/** The listed phone a share link names when it was made in this-phone mode: same platform, nearest width. */
export function nearestListedPhone(d: Device): Device {
  const same = PHONES.filter((p) => p.platform === d.platform);
  const listed = same.length ? same : PHONES;
  return listed.reduce((best, p) => (Math.abs(p.width - d.width) < Math.abs(best.width - d.width) ? p : best), listed[0]);
}

export const DEVICES: Device[] = [
  { id: "web", label: "X web · timeline", kind: "web", width: 600, textWidth: 518, fontSize: 15, lineHeight: 20, pixelRatio: 2, font: "web", pane: "web" },
  { id: "web-post", label: "X web · post page", kind: "focal", width: 600, textWidth: 566, fontSize: 17, lineHeight: 24, pixelRatio: 2, font: "web", pane: "web" },
  ...PHONES,
  // The post screen is measured on iOS only; Android's has no capture yet (QUIRKS.md).
  ...PHONES.filter((d) => d.platform === "ios").map(phonePost),
];

export const DEFAULT_DEVICE = DEVICES[0];
