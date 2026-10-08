import type { Device } from "./devices";

/**
 * Attached media and how X lays it out (QUIRKS.md, "Web media" and "App media" rows). Every
 * constant here was read off x.com's DOM (`fixtures/web/postcheck_test.json` `media`) or an
 * iPhone 15 Pro capture (`fixtures/app/iphone-16.json` `media`) of @postcheck_test tests 50–59c and
 * 110–117b, unless its comment says inferred or assumed.
 */

export type MediaKind = "photo" | "gif" | "video";

export interface MediaItem {
  /** What the preview draws: the image itself, or a still frame for a video. */
  src: string;
  kind: MediaKind;
  /** Natural size in pixels: the layout reads only its shape. */
  width: number;
  height: number;
  /** Alt text was added (x.com shows an ALT badge). */
  alt: boolean;
  /** Videos: length in milliseconds (x.com shows it as m:ss). */
  durationMs?: number;
}

/** The composer's limit: "Please choose up to 4 photos, videos, or GIFs." */
export const MAX_MEDIA = 4;
/** Bounds a picked file is clamped to, so every item the composer makes survives a share link. */
export const MAX_MEDIA_SIDE = 20_000;
export const MAX_VIDEO_MS = 4 * 60 * 60 * 1000;

export interface MediaBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MediaLayout {
  /** One item; several sharing one height across the column; or a sideways ScrollSnap row. */
  mode: "single" | "row" | "carousel";
  /** The column the media sits in: the frame (single, row) or the scroll window (carousel). */
  column: number;
  /** x.com draws a 1px frame border outside single and row media; the app's sits on the image. */
  border: number;
  /** Each item's image box, relative to the first item's top-left (the fixtures' frame of reference). */
  boxes: MediaBox[];
  /** Which part of the layout has no capture behind it, for the tip that says so. */
  assumed: "narrow-carousel" | "narrow-floor" | null;
  /** Some item is drawn narrower than its own shape (cut at the sides). */
  cropped: boolean;
}

type Shape = Pick<MediaItem, "kind" | "width" | "height">;

const ratio = (m: Shape) => (m.width > 0 && m.height > 0 ? m.width / m.height : 16 / 9);

// x.com, 600px timeline column (518px body, 1px frame border → 516 inside).
/**
 * One portrait item is capped at this height (9:16 → 287×510, 1:4 → 128×510). A square is not:
 * 516×516 (test 113). So the cap applies below 1:1; where between 1:1 and 9:16 it starts is inferred.
 */
export const WEB_MAX_HEIGHT = 510;
/** ...a portrait video at 506 (one sample, test 114: 720×1280 → 285×506). */
const WEB_VIDEO_MAX_HEIGHT = 506;
/** ...and never narrower than this (87×1200 → 51×510, test 117). */
const WEB_MIN_WIDTH = 51;
/** Between items, in a row and in the carousel (measured 6–7: 0/356/712/1069). */
const WEB_GAP = 6;
/** The carousel's height (squares 350×350, tests 53, 54, 59b, 59c). */
const WEB_CAROUSEL_HEIGHT = 350;
/**
 * A carousel item is never wider than this shape: 16:9 photos, GIFs and videos all show 412×350
 * (tests 59b, 59c). The iOS carousel crops 16:9 at the same ratio (259×220, test 59b).
 */
const CAROUSEL_MAX_RATIO = 412 / 350;
/**
 * Four 87×1200 strips (test 117b) sit in a carousel 643 tall, each 45 wide. One sample, no rule:
 * the tool copies it for four items all narrower than the single item's floor (51/510 = 1:10).
 * Assumed; fewer narrow items take the ordinary 350 carousel.
 */
const WEB_NARROW_RATIO = WEB_MIN_WIDTH / WEB_MAX_HEIGHT;
const WEB_NARROW_HEIGHT = 643;
const WEB_NARROW_WIDTH = 45;

// iOS app, 393pt screen: the media column is the quote embed's, screen − 71 (322pt).
/** One item: capped at this height (9:16 → 226×402, a 9:16 video too). */
export const APP_MAX_HEIGHT = 402;
/**
 * A taller photo is cropped to this shape: 186×402 for 1:4 (test 116) and 1:13.8 (test 117) alike.
 * Where between 9:16 (whole) and 1:4 the crop starts is inferred: here, at this shape itself.
 */
export const APP_MIN_RATIO = 186 / 402;
/**
 * Between items: four strips at 0/33/67/100, 30 wide (test 117b), and 242 + 4 (test 115). Test 52's
 * pair read 158 + 6; a 6pt gap would put the strips 5pt off, and 159 + 4 is within that capture's
 * reading (the same 16:9 photo reads 322×182 in test 50 and 324×183 in test 110).
 */
const APP_GAP = 4;
/** The carousel: 218–220 tall across tests 53, 54, 59b, 59c; 219 is the median. */
const APP_CAROUSEL_HEIGHT = 219;
/**
 * Photos share one row when their common height would be at least this; otherwise they go into the
 * carousel. Inferred: rows were seen at 136 (test 115), 158 (52) and 402 (117b, capped), carousels
 * where the row would have been 105 (53) and 89 (59b). 120 sits between; nothing nearer is captured.
 */
const APP_ROW_MIN_HEIGHT = 120;

/** The column media fills on a device, and whether it takes x.com's rules or the app's. */
export function mediaColumn(device: Device): { width: number; web: boolean } {
  if (device.kind !== "phone") return { width: device.textWidth, web: true };
  // iOS timeline: the quote embed's column, 6pt past the text. The post screen and Android have
  // no capture: the app's rules at their body column, assumed.
  if (device.platform === "ios" && device.view !== "post") return { width: device.width - 71, web: false };
  return { width: device.textWidth, web: false };
}

/** Lays the items out in a row from x = 0 at height h, each `widthOf` wide, `gap` apart. */
function lay(items: Shape[], h: number, gap: number, widthOf: (m: Shape) => number): MediaBox[] {
  let x = 0;
  return items.map((m) => {
    const w = widthOf(m);
    const box = { x: Math.round(x), y: 0, w: Math.max(1, Math.round(w)), h: Math.round(h) };
    x += w + gap;
    return box;
  });
}

export function mediaLayout(items: Shape[], device: Device): MediaLayout | null {
  const list = items.slice(0, MAX_MEDIA);
  if (!list.length) return null;
  const { width: column, web } = mediaColumn(device);
  const photosOnly = list.every((m) => m.kind === "photo");
  const sum = list.reduce((s, m) => s + ratio(m), 0);

  if (web) {
    const inner = column - 2;
    if (list.length === 1) {
      const m = list[0];
      const r = ratio(m);
      const cap = m.kind === "video" ? WEB_VIDEO_MAX_HEIGHT : WEB_MAX_HEIGHT;
      const h = r < 1 ? Math.min(inner / r, cap) : inner / r;
      const w = h < cap || r >= 1 ? inner : Math.max(WEB_MIN_WIDTH, cap * r);
      return { mode: "single", column, border: 1, boxes: [{ x: 0, y: 0, w: Math.round(w), h: Math.round(h) }], assumed: null, cropped: false };
    }
    // Two photos fill the row at one height (255 + 255; 388 + 122 at 218). Capped like one item: assumed.
    if (list.length === 2 && photosOnly) {
      const h = Math.min((inner - WEB_GAP) / sum, WEB_MAX_HEIGHT);
      return { mode: "row", column, border: 1, boxes: lay(list, h, WEB_GAP, (m) => h * ratio(m)), assumed: null, cropped: false };
    }
    if (list.length === 4 && list.every((m) => ratio(m) < WEB_NARROW_RATIO)) {
      return { mode: "carousel", column, border: 0, boxes: lay(list, WEB_NARROW_HEIGHT, WEB_GAP, () => WEB_NARROW_WIDTH), assumed: "narrow-carousel", cropped: false };
    }
    const h = WEB_CAROUSEL_HEIGHT;
    // A narrow item among wider ones keeps the strips' 45px: assumed.
    const floored = list.some((m) => h * ratio(m) < WEB_NARROW_WIDTH);
    return {
      mode: "carousel",
      column,
      border: 0,
      boxes: lay(list, h, WEB_GAP, (m) => Math.max(WEB_NARROW_WIDTH, h * Math.min(ratio(m), CAROUSEL_MAX_RATIO))),
      assumed: floored ? "narrow-floor" : null,
      cropped: list.some((m) => ratio(m) > CAROUSEL_MAX_RATIO),
    };
  }

  if (list.length === 1) {
    const r = ratio(list[0]);
    const h = Math.min(column / r, APP_MAX_HEIGHT);
    const w = h < APP_MAX_HEIGHT ? column : APP_MAX_HEIGHT * Math.max(r, APP_MIN_RATIO);
    return { mode: "single", column, border: 0, boxes: [{ x: 0, y: 0, w: Math.round(w), h: Math.round(h) }], assumed: null, cropped: false };
  }
  const rowHeight = Math.min((column - APP_GAP * (list.length - 1)) / sum, APP_MAX_HEIGHT);
  if (photosOnly && rowHeight >= APP_ROW_MIN_HEIGHT) {
    return { mode: "row", column, border: 0, boxes: lay(list, rowHeight, APP_GAP, (m) => rowHeight * ratio(m)), assumed: null, cropped: false };
  }
  const h = APP_CAROUSEL_HEIGHT;
  return { mode: "carousel", column, border: 0, boxes: lay(list, h, APP_GAP, (m) => h * Math.min(ratio(m), CAROUSEL_MAX_RATIO)), assumed: null, cropped: list.some((m) => ratio(m) > CAROUSEL_MAX_RATIO) };
}

/** Whether the layout runs past its column, so readers have to swipe to see the rest. */
export function overflows(layout: MediaLayout): boolean {
  const last = layout.boxes[layout.boxes.length - 1];
  return last.x + last.w > layout.column;
}

/** x.com's video badge: the length as m:ss ("0:06"); h:mm:ss from an hour (assumed, no capture). */
export function videoTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}
