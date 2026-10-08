"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import type { Device } from "@/lib/devices";
import type { XTheme } from "@/lib/theme";
import { fontStack } from "@/lib/theme";
import type { CardData } from "@/lib/card";
import { Entity, Token, extractEntities, isTrailing, quoteUrl, tokenize, type StyleRun } from "@/lib/entities";
import { quoteTime, type QuoteState } from "@/lib/quote";
import { NO_POST_STATE, type PostState } from "@/lib/post-state";
import { mediaColumn, mediaLayout, videoTime, type MediaItem } from "@/lib/media";
import { PostBody } from "./post-body";
import { LinkCard } from "./link-card";
import { BookmarkIcon, EyeSlashIcon, GoldVerifiedIcon, GrayVerifiedIcon, GrokIcon, LikeIcon, MoreIcon, MuteIcon, PaidPartnershipIcon, PersonIcon, PinIcon, ReplyIcon, RepostIcon, ShareIcon, VerifiedIcon, ViewsIcon } from "./icons";

export interface Identity {
  name: string;
  handle: string;
  avatar: string | null;
  badge: Badge;
}

/** Blue: Premium. Gold: verified organization. Gray: government. */
export type Badge = "none" | "blue" | "gold" | "gray";

function BadgeIcon({ badge, theme }: { badge: Badge; theme: XTheme }) {
  const style = { flexShrink: 0 };
  if (badge === "gold") return <GoldVerifiedIcon size={15} style={style} />;
  if (badge === "gray") return <GrayVerifiedIcon size={15} style={style} />;
  if (badge === "blue") return <VerifiedIcon size={15} style={{ ...style, color: theme.badge }} />;
  return null;
}

interface Props {
  device: Device;
  theme: XTheme;
  identity: Identity;
  tokens: Token[];
  showMore: boolean;
  /** Called when Show more is clicked. */
  onShowMore?: () => void;
  /**
   * Set when the timeline cell can fold or expand (a preview affordance, not something X does):
   * whether it's expanded now, and what a click or Enter / Space on the cell does.
   */
  toggle?: { expanded: boolean; onToggle: () => void };
  hiddenUrlStart: number | null;
  card: CardData | "loading" | null;
  /** The post link that becomes the quote embed, and what the lookup found. */
  quote: { entity: Entity; state: QuoteState | null } | null;
  /** Attached photos, GIFs and videos, up to 4. A post with media never shows a link card or a quote. */
  media?: MediaItem[];
  /** Premium bold / italic runs. */
  styles?: StyleRun[];
  /** Pinned, paid partnership, reply limit, and the photo's sensitive flag and tag. */
  state?: PostState;
  bodyRef?: Ref<HTMLDivElement>;
}

/** Organization and government accounts get X's rounded-square avatar (x.com's `rounded-xs`, see globals.css). */
function Avatar({ src, size, square }: { src: string | null; size: number; square: boolean }) {
  const shape = square ? "x-avatar-square" : undefined;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={shape} style={{ width: size, height: size, borderRadius: square ? undefined : "50%", objectFit: "cover", display: "block", flexShrink: 0 }} />;
  }
  return <DefaultAvatar size={size} className={shape} style={{ borderRadius: square ? undefined : "50%" }} />;
}

/** X's grey person silhouette for an account with no photo (also the composer's photo button). */
export function DefaultAvatar({ size, className, style }: { size: number | string; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className={className} style={{ flexShrink: 0, display: "block", overflow: "hidden", ...style }}>
      <rect width="40" height="40" fill="#CFD9DE" />
      <circle cx="20" cy="15.5" r="7" fill="#fff" />
      <path d="M6.5 35.5c1.4-7.2 7-11 13.5-11s12.1 3.8 13.5 11A19.9 19.9 0 0 1 20 40a19.9 19.9 0 0 1-13.5-4.5z" fill="#fff" />
    </svg>
  );
}

function Actions({ theme, full, replyDimmed = false }: { theme: XTheme; full: boolean; replyDimmed?: boolean }) {
  const item = (icon: ReactNode, grow: boolean) => (
    <div style={{ flex: grow ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", height: 36, color: theme.icon }}>{icon}</div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: full ? "space-between" : undefined, width: "100%" }}>
      {/* iOS dims the reply icon when the viewer can't reply: about a third as bright (tests 101, 103). */}
      {item(<ReplyIcon data-reply-icon="" size={20} style={replyDimmed ? { opacity: 0.33 } : undefined} />, !full)}
      {item(<RepostIcon size={20} />, !full)}
      {item(<LikeIcon size={20} />, !full)}
      {item(<ViewsIcon size={20} />, !full)}
      <div style={{ display: "flex", gap: 16, color: theme.icon, alignItems: "center", height: 36 }}>
        <BookmarkIcon size={20} />
        <ShareIcon size={20} />
      </div>
    </div>
  );
}

/**
 * Name, check, @handle and time on one line, as the timeline cell and the quote embed print them.
 * x.com shrinks the name and the @handle together. The iOS timeline row gives way with the handle
 * first: a name too long for the row leaves no handle at all, "Name… · 4m" (test 80). Whether a
 * name that nearly fits shows a cut "@hand…" first is assumed, not captured.
 */
function NameRow({ name, handle, badge, time, theme, handleFirst = false }: { name: string; handle: string; badge: Badge; time: string; theme: XTheme; handleFirst?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", minWidth: 0, color: theme.secondary, whiteSpace: "nowrap" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        <span style={{ color: theme.text, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        <BadgeIcon badge={badge} theme={theme} />
      </span>
      {handleFirst ? (
        // The gap sits inside the clipped box, so a handle shrunk to nothing leaves no space behind.
        <span style={{ flexShrink: 1e4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontFeatureSettings: '"ss01"' }}>
          <span style={{ marginLeft: 8 }}>@{handle}</span>
        </span>
      ) : (
        <span style={{ marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", fontFeatureSettings: '"ss01"' }}>@{handle}</span>
      )}
      <span style={{ padding: "0 4px" }}>·</span>
      <span>{time}</span>
    </div>
  );
}

/**
 * Quote embed geometry (QUIRKS.md, "Quote embeds").
 * Web, measured on x.com 2026-10-06 (fixtures/web/postcheck_test.json `quote` boxes): the body
 * column wide (518 timeline, 566 post page), radius 16, 12px inset inside a 1px border, 24px
 * avatar, text 4px under it at 15/20, links in the text colour, 5-line clamp (x.com's
 * -webkit-line-clamp).
 * iOS timeline, from iPhone 15 Pro captures of tests 42 and 43 at 393pt: 322pt wide (screen − 71:
 * it starts at the text column and runs 6pt past its right edge), radius 12 (fit to the capture),
 * 20pt avatar, text 6pt under it with a 19pt line pitch, links blue, 5 lines then "…".
 * The iOS post screen and Android have no capture: assumed iOS-like and web-like respectively.
 */
function quoteLook(device: Device) {
  if (device.kind === "phone" && device.platform === "ios") {
    const width = device.view === "post" ? device.textWidth : device.width - 71;
    // One landscape sample (test 44): a 1600×900 photo shows 321×171, cropped wider than 16:9.
    return { width, radius: 12, avatar: 20, textGap: 6, lineHeight: 19, appLinks: true, photoRatio: 171 / 321 };
  }
  return { width: device.textWidth, radius: 16, avatar: 24, textGap: 4, lineHeight: 20, appLinks: false, photoRatio: null };
}

/**
 * The post a link points at, drawn the way X embeds it. While the lookup runs it holds a
 * one-line box; a post X can't show gets its "unavailable" box, and a failed lookup falls
 * back to naming the link.
 */
function QuoteEmbed({ entity, state, device, theme }: { entity: Entity; state: QuoteState | null; device: Device; theme: XTheme }) {
  const look = quoteLook(device);
  const frame: React.CSSProperties = {
    width: look.width,
    boxSizing: "border-box",
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: look.radius,
    overflow: "hidden",
    fontFamily: fontStack(device.font),
    fontSize: 15,
    lineHeight: "20px",
  };
  if (state === null || state === "loading" || state.status !== "ok") {
    const unavailable = state !== null && state !== "loading" && state.status === "unavailable";
    const label = state === "loading" ? "Loading post…" : unavailable ? "This post is unavailable." : `Quote post · ${entity.display}`;
    return (
      <div data-quote="" style={{ ...frame, padding: 12, color: theme.secondary, backgroundColor: unavailable ? theme.cardBg : undefined }}>
        {label}
      </div>
    );
  }

  const q = state.quote;
  // A quoted post that is itself a quote keeps its post link as visible text: X draws no quote
  // inside a quote. The iOS app prints that link twice (@postcheck_test test 107, one capture).
  const inner = quoteUrl(extractEntities(q.text));
  const text = device.pane === "app" && inner && isTrailing(q.text, inner) ? `${q.text} ${q.text.slice(inner.start, inner.end)}` : q.text;
  const tokens = tokenize(text, extractEntities(text), []);
  const hasText = tokens.some((t) => t.kind !== "space" && t.kind !== "newline");
  const photoWidth = look.width - 2;
  // Web: the photo's own shape (16:9 measured); no taller than 4:5 is assumed (QUIRKS.md).
  const photoHeight = q.photo ? Math.round(photoWidth * (look.photoRatio ?? Math.min(q.photo.height / q.photo.width, 1.25))) : 0;
  return (
    <div data-quote="" style={frame}>
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, height: look.avatar }}>
          <Avatar src={q.avatar} size={look.avatar} square={q.badge === "gold" || q.badge === "gray"} />
          <NameRow name={q.name} handle={q.handle} badge={q.badge} time={quoteTime(q.createdAt, state.at, device.kind === "phone" ? "app" : "web")} theme={theme} />
        </div>
        {hasText && (
          <div style={{ marginTop: look.textGap }}>
            <PostBody
              tokens={tokens}
              showMoreAt={-1}
              hiddenUrlStart={null}
              theme={theme}
              fontSize={15}
              lineHeight={look.lineHeight}
              width={look.width - 26}
              font={device.font}
              pane={device.pane}
              linkColor={look.appLinks ? theme.link : theme.text}
              maxLines={5}
            />
          </div>
        )}
        {/* A quoted poll isn't drawn (tests 96, 54). */}
        {q.poll && (
          <div data-quote-poll="" style={{ marginTop: 4, color: theme.link }}>
            Show this poll
          </div>
        )}
      </div>
      {q.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img data-quote-photo="" src={q.photo.src} alt="" style={{ display: "block", width: photoWidth, height: photoHeight, objectFit: "cover", marginTop: 4 }} />
      )}
    </div>
  );
}

/** Small dark label on a photo, GIF or video. Placement and styling are assumed; only ALT's 23×15 is measured. */
const badgeStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, backgroundColor: "rgba(0,0,0,0.77)", color: "#fff", fontWeight: 700 };

/**
 * Attached media, laid out by `mediaLayout()` (QUIRKS.md, "Web media" and "App media"): one item,
 * a row sharing one height, or a sideways ScrollSnap carousel with the next item peeking in.
 * x.com frames a single item or a row in the card border; the app's frame is drawn on the image
 * (assumed), and so is each carousel item's. Corner radius 16 on x.com (the card's) and 12 on the
 * app (the quote embed's fit): assumed, not measured on media. Badges: x.com shows "GIF", a video's
 * length and a 23×15 "ALT"; the iOS timeline shows a "GIF" pill and a mute mark on a video, and no
 * ALT. A video is drawn as its first frame.
 */
function MediaBlock({ items, device, theme }: { items: MediaItem[]; device: Device; theme: XTheme }) {
  const layout = mediaLayout(items, device);
  if (!layout) return null;
  const { web } = mediaColumn(device);
  const radius = web ? 16 : 12;
  const carousel = layout.mode === "carousel";
  const height = Math.max(...layout.boxes.map((b) => b.h));
  const hairline = <div aria-hidden style={{ position: "absolute", inset: 0, border: `1px solid ${theme.cardBorder}`, borderRadius: radius, pointerEvents: "none" }} />;
  const cells = layout.boxes.map((b, i) => {
    const m = items[i];
    const prev = layout.boxes[i - 1];
    const badge = m.kind === "gif" ? "GIF" : m.kind === "video" ? (web ? (m.durationMs !== undefined ? "time" : "") : "mute") : "";
    return (
      <div
        key={i}
        data-media-item=""
        data-badge={badge}
        data-kind={m.kind}
        style={{ position: "relative", flex: "none", width: b.w, height: b.h, marginLeft: prev ? b.x - prev.x - prev.w : 0, overflow: "hidden", borderRadius: carousel ? radius : undefined, scrollSnapAlign: carousel ? "start" : undefined }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.src} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
        {carousel && hairline}
        {(badge === "GIF" || badge === "time" || (web && m.alt && m.kind === "photo")) && (
          <div style={{ position: "absolute", left: 8, bottom: 8, display: "flex", gap: 4 }}>
            {badge === "GIF" && <span style={{ ...badgeStyle, height: 20, padding: "0 4px", fontSize: 13, lineHeight: "16px" }}>GIF</span>}
            {badge === "time" && <span style={{ ...badgeStyle, height: 20, padding: "0 4px", fontSize: 13, lineHeight: "16px", fontWeight: 400 }}>{videoTime(m.durationMs ?? 0)}</span>}
            {web && m.alt && m.kind === "photo" && <span data-media-alt="" style={{ ...badgeStyle, width: 23, height: 15, fontSize: 11, lineHeight: "15px" }}>ALT</span>}
          </div>
        )}
        {badge === "mute" && (
          <div style={{ position: "absolute", right: 8, bottom: 8, width: 24, height: 24, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MuteIcon size={16} />
          </div>
        )}
      </div>
    );
  });
  if (carousel) {
    // Clipped to the column and scrolled sideways, with no scrollbar showing.
    return (
      <div data-media="carousel" role="region" aria-label="Post media" style={{ width: layout.column, height, display: "flex", overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}>
        {cells}
      </div>
    );
  }
  const width = layout.boxes[layout.boxes.length - 1].x + layout.boxes[layout.boxes.length - 1].w;
  return (
    <div
      data-media={layout.mode}
      style={{ position: "relative", display: "flex", width: width + 2 * layout.border, boxSizing: "border-box", border: layout.border ? `1px solid ${theme.cardBorder}` : undefined, borderRadius: radius, overflow: "hidden" }}
    >
      {cells}
      {!layout.border && hairline}
    </div>
  );
}

/**
 * Where X puts the post-state rows (QUIRKS.md, "Post chrome"). Web: x.com's logged-in DOM
 * (2026-10-08), timeline and post page. iOS: iPhone 15 Pro captures of tests 104, 110, 111 and 131
 * (393pt, 2026-10-07), the sizes from Chirp widths against the capture's ink, the offsets from its
 * ink against Chirp's metrics. Android has no capture and the iOS post screen none for these
 * states: both take the iOS timeline numbers (assumed).
 */
function stateLook(device: Device) {
  if (device.kind === "phone") {
    return {
      // "Pinned" 14pt bold; pin 14pt, right-aligned to the avatar column.
      pinned: { size: 14, lineHeight: 18, icon: 14, iconTop: 2 },
      // The row adds 19pt to the cell; the name's cap sits 11pt under the photo.
      tag: { block: 19, top: 8, size: 14, icon: 0 },
      // The row adds 22pt; its cap sits 11pt under the last body line.
      paid: { block: 22, top: 8, size: 14, icon: 13, gap: 4 },
    };
  }
  const focal = device.kind === "focal";
  return {
    pinned: { size: 13, lineHeight: 16, icon: 16, iconTop: 0 },
    // Timeline: 13px under the photo, no icon (+20). Post page: 15px with the person icon.
    tag: focal ? { block: 24, top: 4, size: 15, icon: 19 } : { block: 20, top: 4, size: 13, icon: 0 },
    // 8px under the text, a 16px icon and 13px text (+25).
    paid: { block: 25, top: 8, size: 13, icon: 16, gap: 3 },
  };
}

/** "Pinned" over the name row, its pin in the avatar column (timeline only: the post page has none). */
function PinnedRow({ device, theme, avatar }: { device: Device; theme: XTheme; avatar: number }) {
  const look = stateLook(device).pinned;
  return (
    <div data-pinned="" style={{ display: "flex", gap: 8, height: 16, marginBottom: 4, color: theme.secondary, fontSize: look.size, lineHeight: `${look.lineHeight}px`, fontWeight: 700, whiteSpace: "nowrap" }}>
      <div style={{ width: avatar, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
        <PinIcon data-pinned-icon="" size={look.icon} style={{ marginTop: look.iconTop }} />
      </div>
      <span data-pinned-text="">Pinned</span>
    </div>
  );
}

/** The tagged person's display name under the photo. */
function TagRow({ device, theme, name }: { device: Device; theme: XTheme; name: string }) {
  const look = stateLook(device).tag;
  const lineHeight = look.size === 15 ? 20 : 16;
  return (
    <div data-tag="" style={{ height: look.block, boxSizing: "border-box", paddingTop: look.top, color: theme.secondary, fontSize: look.size, lineHeight: `${lineHeight}px`, whiteSpace: "nowrap", overflow: "visible" }}>
      <div style={{ display: "flex", alignItems: "center", height: lineHeight, minWidth: 0 }}>
        {look.icon > 0 && <PersonIcon size={look.icon} style={{ flexShrink: 0, marginRight: 4 }} />}
        <span data-tag-text="" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </div>
    </div>
  );
}

/** "Paid partnership", the composer's content disclosure, under the post. */
function PaidRow({ device, theme }: { device: Device; theme: XTheme }) {
  const look = stateLook(device).paid;
  const web = device.kind !== "phone";
  return (
    <div data-paid="" style={{ height: look.block, boxSizing: "border-box", paddingTop: look.top, color: theme.secondary, fontSize: look.size, lineHeight: "16px", whiteSpace: "nowrap" }}>
      {/* x.com: the icon at the row's top and the text 1px lower; iOS: both centred on one 16pt line. */}
      <div style={{ display: "flex", alignItems: web ? "flex-start" : "center", gap: look.gap, height: web ? 17 : 16 }}>
        <PaidPartnershipIcon data-paid-icon="" size={look.icon} style={{ flexShrink: 0 }} />
        <span data-paid-text="" style={{ marginTop: web ? 1 : 0 }}>
          Paid partnership
        </span>
      </div>
    </div>
  );
}

/**
 * A photo flagged sensitive. x.com keeps the photo's box and darkens a blurred copy (X serves the
 * blur; a CSS blur stands in for it) by half, with a centred column (max 400px) of icon, title,
 * explanation and a "Show" pill. The iOS app swaps the photo for a 324×163 cover at 393pt whatever
 * its shape, its pieces at fixed offsets from the cover's edges.
 */
function SensitiveCover({ items, device, theme }: { items: MediaItem[]; device: Device; theme: XTheme }) {
  const src = items[0].src;
  const blurred = (
    // A blur fades out over about three radii at the image's edges: draw it that far past the box,
    // which clips it, so the cover stays even to its corners.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" style={{ position: "absolute", inset: -72, width: "calc(100% + 144px)", height: "calc(100% + 144px)", maxWidth: "none", objectFit: "cover", filter: "blur(24px)" }} />
  );
  const white = "#FFFFFF";
  if (device.kind === "phone") {
    const w = device.width - 69;
    // Measured at 393pt only: 324×163. Wider screens keep that shape; a narrower one keeps the
    // 163pt and grows if its text wraps further, so the pieces never overlap (assumed).
    const h = Math.max(163, Math.round((w * 163) / 324));
    return (
      <div data-sensitive="" style={{ position: "relative", width: w, minHeight: h, boxSizing: "border-box", padding: "14px 0 10px", borderRadius: 12, overflow: "hidden", color: white, fontSize: 15, display: "flex", flexDirection: "column" }}>
        {blurred}
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0, 0, 0, 0.5)" }} />
        {/* At 393pt: icon 14 from the top, title at 20,48, text at 21,82, pill 11 from the right and 10 from the bottom. */}
        <EyeSlashIcon size={20} style={{ position: "relative", alignSelf: "center", flexShrink: 0 }} />
        <div style={{ position: "relative", margin: "14px 20px 0", lineHeight: "20px", fontWeight: 700 }}>
          <span data-cover-title="">Content warning: Sensitive content</span>
        </div>
        <div style={{ position: "relative", margin: "14px 21px 0", lineHeight: "18px" }}>The author flagged this post as showing sensitive content.</div>
        <div style={{ flex: "1 0 11px" }} />
        <div data-cover-show="" style={{ position: "relative", alignSelf: "flex-end", flexShrink: 0, marginRight: 11, height: 24, minWidth: 80, padding: "0 12px", boxSizing: "border-box", borderRadius: 9999, backgroundColor: "rgba(0, 0, 0, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>
          Show
        </div>
      </div>
    );
  }
  // The media keeps its own box (one photo measured; several assumed covered as one), the blur over it.
  return (
    <div data-sensitive="" style={{ position: "relative", width: "fit-content" }}>
      <MediaBlock items={items} device={device} theme={theme} />
      <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: 16, overflow: "hidden" }}>{blurred}</div>
      <div style={{ position: "absolute", inset: 0, borderRadius: 16, backgroundColor: "rgba(0, 0, 0, 0.5)", padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: white, fontSize: 15, lineHeight: "20px" }}>
        <div style={{ width: "100%", maxWidth: 400, padding: "0 12px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "center", height: 24 }}>
            <EyeSlashIcon data-cover-icon="" size={24} />
          </div>
          <div style={{ marginTop: 12, fontWeight: 700 }}>
            <span data-cover-title="">Content warning: Sensitive content</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <span data-cover-text="">The post author flagged this post as showing sensitive content.</span>
          </div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <div data-cover-show="" style={{ height: 32, padding: "0 16px", boxSizing: "border-box", border: "1px solid transparent", borderRadius: 9999, backgroundColor: "rgba(255, 255, 255, 0.25)", display: "flex", alignItems: "center", fontSize: 14, lineHeight: "16px", fontWeight: 700 }}>
              Show
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One post cell, laid out with the values read off x.com: 12px/16px cell
 * padding, 40px avatar, 8px gap, 15px/20px Chirp, name row → 2px → body →
 * 12px → card → action row. The post page ("focal") variant runs the body at
 * 17px/24px under the header and adds the timestamp row.
 */
export function XPost({ device, theme, identity, tokens, showMore, onShowMore, toggle, hiddenUrlStart, card, quote, media, styles, state = NO_POST_STATE, bodyRef }: Props) {
  const font = { fontFamily: fontStack(device.font), fontSize: 15, lineHeight: "20px" } as const;
  const handle = identity.handle.replace(/^@/, "") || "yourhandle";
  const name = identity.name || "Your name";
  const square = identity.badge === "gold" || identity.badge === "gray";
  const bodyWidth = device.textWidth;
  const viewport = device.kind === "phone" ? device.width : 1200;
  const hasBody = tokens.some((t) => t.kind !== "space" && t.kind !== "newline" && !(t.kind === "entity" && t.entity.start === hiddenUrlStart));

  // The wrapper has no box of its own (display: contents), so layout is untouched; tip marks find
  // the attachment through it.
  const attached = media?.length ? (
    state.sensitive ? <SensitiveCover items={media} device={device} theme={theme} /> : <MediaBlock items={media} device={device} theme={theme} />
  ) : quote ? (
    <QuoteEmbed entity={quote.entity} state={quote.state} device={device} theme={theme} />
  ) : card ? (
    <LinkCard card={card} theme={theme} width={bodyWidth} viewport={viewport} font={device.font} web={device.kind !== "phone"} />
  ) : null;
  const attachment = attached && <div data-attachment="" style={{ display: "contents" }}>{attached}</div>;
  // Under the text and attachment: the tag, then the disclosure. Each was captured alone; the order
  // when both show is assumed (QUIRKS.md).
  const tagged = media?.length && state.tagged.trim() ? state.tagged.trim() : null;
  const below = (
    <>
      {tagged && <TagRow device={device} theme={theme} name={tagged} />}
      {state.paid && <PaidRow device={device} theme={theme} />}
    </>
  );
  // iOS dims the reply icon for a viewer outside the limit, in the row and on the post screen (test
  // 101). Only "accounts you follow" and "accounts you mention" were seen dimmed; the capturing
  // account could reply to the verified-only post.
  const replyDimmed = device.kind === "phone" && (state.replies === "following" || state.replies === "mentioned");

  const body = (
    <PostBody
      ref={bodyRef}
      tokens={tokens}
      showMoreAt={showMore ? tokens.length : -1}
      onShowMore={onShowMore}
      hiddenUrlStart={hiddenUrlStart}
      theme={theme}
      fontSize={device.fontSize}
      lineHeight={device.lineHeight}
      width={bodyWidth}
      font={device.font}
      pane={device.pane}
      styles={styles}
    />
  );

  if (device.kind === "focal" || device.view === "post") {
    const web = device.kind === "focal";
    return (
      <article style={{ padding: "12px 16px", backgroundColor: theme.bg, width: device.width, boxSizing: "border-box", borderLeft: web ? `1px solid ${theme.border}` : undefined, borderRight: web ? `1px solid ${theme.border}` : undefined, ...font }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar src={identity.avatar} size={40} square={square} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: theme.text, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              <BadgeIcon badge={identity.badge} theme={theme} />
            </div>
            <div style={{ color: theme.secondary, fontFeatureSettings: '"ss01"' }}>@{handle}</div>
          </div>
          <div style={{ color: theme.icon, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", margin: "-8px 0" }}>
            <MoreIcon size={16} />
          </div>
        </div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {hasBody && body}
          {attachment}
        </div>
        {below}
        <div style={{ marginTop: 12, color: theme.secondary, fontSize: 15 }}>
          10:14 AM · {web ? "Sep 10, 2026" : "9/10/26"} · <span style={{ color: theme.text, fontWeight: 700 }}>12.4K</span> Views
        </div>
        <div style={{ marginTop: 12, borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, padding: "2px 0" }}>
          <Actions theme={theme} full replyDimmed={replyDimmed} />
        </div>
      </article>
    );
  }

  const isPhone = device.kind === "phone";
  const android = device.platform === "android";
  return (
    <article
      // Focusable when it toggles, as X's own timeline cells are. It stays an article (a button role
      // would put Show more inside another button), so its label carries the state and the action.
      // Enter or Space on the cell itself (not on Show more inside it) toggles it, once per press.
      tabIndex={toggle ? 0 : undefined}
      aria-label={toggle ? (toggle.expanded ? "Post preview, expanded. Press Enter to fold it." : "Post preview, cut at Show more. Press Enter to expand it.") : undefined}
      onClick={toggle ? (e) => {
        // A drag that selects text in the post ends in a click; leave the selection alone.
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && e.currentTarget.contains(selection.anchorNode)) return;
        toggle.onToggle();
      } : undefined}
      onKeyDown={toggle ? (e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        if (!e.repeat) toggle.onToggle();
      } : undefined}
      style={{
        cursor: toggle ? "pointer" : undefined,
        // App cell measured on an iPhone 15 Pro capture: 12px inset, 44px avatar, 8px gap, 12px right.
        // Android (Pixel 3 capture): 12px inset, 40px avatar, 8px gap, 12px right (devices.ts textWidth).
        // A pinned post's "Pinned" row takes the top 8px of the inset, then 16 + 4 (x.com and iOS: +16).
        // One shorthand only: a longhand beside it would survive React's style diff on a device switch.
        padding: `${state.pinned ? 8 : 12}px ${isPhone ? (android ? "12px 12px" : "13px 12px 12px") : "16px 12px"}`,
        backgroundColor: theme.bg,
        width: device.width,
        boxSizing: "border-box",
        borderBottom: `1px solid ${theme.border}`,
        borderLeft: isPhone ? undefined : `1px solid ${theme.border}`,
        borderRight: isPhone ? undefined : `1px solid ${theme.border}`,
        ...font,
      }}
    >
      {state.pinned && <PinnedRow device={device} theme={theme} avatar={isPhone && !android ? 44 : 40} />}
      <div style={{ display: "flex", gap: 8 }}>
        <Avatar src={identity.avatar} size={isPhone && !android ? 44 : 40} square={square} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, height: 20 }}>
            <NameRow name={name} handle={handle} badge={identity.badge} time="1h" theme={theme} handleFirst={device.pane === "app"} />
            {device.pane === "app" && (
              // iPhone captures (test 80, 2026-10-07): the Grok mark at x 343–357 on a 393pt screen, so the name row stops near 334.
              <div style={{ color: theme.icon, width: 16, height: 20, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "auto", marginRight: -10, flexShrink: 0 }}>
                <GrokIcon size={16} />
              </div>
            )}
            <div style={{ color: theme.icon, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", margin: "-6px -8px 0 0", flexShrink: 0 }}>
              <MoreIcon size={16} />
            </div>
          </div>
          <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 12 }}>
            {hasBody && body}
            {attachment}
          </div>
          {below}
          <div style={{ marginTop: 4, marginLeft: -8 }}>
            <Actions theme={theme} full={false} replyDimmed={replyDimmed} />
          </div>
        </div>
      </div>
    </article>
  );
}
