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
  /** Phones only: the timeline cell or the post detail screen. */
  view?: "timeline" | "post";
  /** Which Chirp build lays the text out (see globals.css). */
  font: "web" | "app";
  /** Which calibrated tracking applies: x.com's (web) or the app's (app). See globals.css. */
  pane: "web" | "app";
}

// Web numbers were measured on x.com (Sept 2026): a 600px column with 1px
// borders and 16px padding = 566px of content; avatar 40px + 8px gap leaves
// 518px for timeline text. The post page runs the text under the header at
// full 566px. Phone numbers assume the app's 16px inset, 40px avatar and 8px
// gap, so body width = screen width − 80.
/**
 * The app folds a post behind "Show more" past this many rendered lines, even
 * under 280 characters; the web shows all of it. Three iPhone samples from
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
  textWidth: width - 77,
  pane: "app",
  fontSize: 15,
  lineHeight: 20,
  pixelRatio: 3,
  radius,
  island,
  maxLines: APP_MAX_LINES,
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

const PHONES: Device[] = [
  phone("iphone-se", "iPhone SE", 375, 667, "none", 0),
  phone("iphone-16", "iPhone 16", 393, 852, "dynamic-island"),
  phone("iphone-17", "iPhone 17 / Pro", 402, 874, "dynamic-island"),
  phone("iphone-air", "iPhone Air", 420, 912, "dynamic-island", 58),
  phone("iphone-17-pro-max", "iPhone 17 Pro Max", 440, 956, "dynamic-island", 62),
  phone("galaxy-s25", "Galaxy S25", 360, 780, "punch-hole", 36),
  phone("pixel-10", "Pixel 10", 412, 923, "punch-hole", 40),
];

export const DEVICES: Device[] = [
  { id: "web", label: "X web · timeline", kind: "web", width: 600, textWidth: 518, fontSize: 15, lineHeight: 20, pixelRatio: 2, font: "web", pane: "web" },
  { id: "web-post", label: "X web · post page", kind: "focal", width: 600, textWidth: 566, fontSize: 17, lineHeight: 24, pixelRatio: 2, font: "web", pane: "web" },
  ...PHONES,
  ...PHONES.map(phonePost),
];

export const DEFAULT_DEVICE = DEVICES[0];
