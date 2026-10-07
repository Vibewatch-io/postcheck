"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import type { Device } from "@/lib/devices";
import type { XTheme } from "@/lib/theme";
import { fontStack } from "@/lib/theme";
import type { CardData } from "@/lib/card";
import { Entity, Token, extractEntities, isTrailing, quoteUrl, tokenize, type StyleRun } from "@/lib/entities";
import { quoteTime, type QuoteState } from "@/lib/quote";
import { PostBody } from "./post-body";
import { LinkCard } from "./link-card";
import { BookmarkIcon, GoldVerifiedIcon, GrayVerifiedIcon, LikeIcon, MoreIcon, ReplyIcon, RepostIcon, ShareIcon, VerifiedIcon, ViewsIcon } from "./icons";

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
  /** Called when the timeline cell itself is clicked: the preview folds or expands the post (not something X does). */
  onToggle?: () => void;
  hiddenUrlStart: number | null;
  card: CardData | "loading" | null;
  /** The post link that becomes the quote embed, and what the lookup found. */
  quote: { entity: Entity; state: QuoteState | null } | null;
  /** Attached image (data URL). A post with media never shows a link card. */
  media?: string | null;
  /** Premium bold / italic runs. */
  styles?: StyleRun[];
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

function Actions({ theme, full }: { theme: XTheme; full: boolean }) {
  const item = (icon: ReactNode, grow: boolean) => (
    <div style={{ flex: grow ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", height: 36, color: theme.icon }}>{icon}</div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: full ? "space-between" : undefined, width: "100%" }}>
      {item(<ReplyIcon size={20} />, !full)}
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

/** Name, check, @handle and time on one line, as the timeline cell and the quote embed print them. */
function NameRow({ name, handle, badge, time, theme }: { name: string; handle: string; badge: Badge; time: string; theme: XTheme }) {
  return (
    <div style={{ display: "flex", alignItems: "center", minWidth: 0, color: theme.secondary, whiteSpace: "nowrap" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        <span style={{ color: theme.text, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        <BadgeIcon badge={badge} theme={theme} />
      </span>
      <span style={{ marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", fontFeatureSettings: '"ss01"' }}>@{handle}</span>
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
  const entities = extractEntities(q.text);
  // A quoted post that ends in a post link is itself a quote: hide that link as the timeline does (assumed).
  const nested = quoteUrl(entities);
  const hiddenUrlStart = nested && isTrailing(q.text, nested) ? nested.start : null;
  const tokens = tokenize(q.text, entities, []);
  const hasText = tokens.some((t) => t.kind !== "space" && t.kind !== "newline" && !(t.kind === "entity" && t.entity.start === hiddenUrlStart));
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
              hiddenUrlStart={hiddenUrlStart}
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

/**
 * One post cell, laid out with the values read off x.com: 12px/16px cell
 * padding, 40px avatar, 8px gap, 15px/20px Chirp, name row → 2px → body →
 * 12px → card → action row. The post page ("focal") variant runs the body at
 * 17px/24px under the header and adds the timestamp row.
 */
export function XPost({ device, theme, identity, tokens, showMore, onShowMore, onToggle, hiddenUrlStart, card, quote, media, styles, bodyRef }: Props) {
  const font = { fontFamily: fontStack(device.font), fontSize: 15, lineHeight: "20px" } as const;
  const handle = identity.handle.replace(/^@/, "") || "yourhandle";
  const name = identity.name || "Your name";
  const square = identity.badge === "gold" || identity.badge === "gray";
  const bodyWidth = device.textWidth;
  const viewport = device.kind === "phone" ? device.width : 1200;
  const hasBody = tokens.some((t) => t.kind !== "space" && t.kind !== "newline" && !(t.kind === "entity" && t.entity.start === hiddenUrlStart));

  // The wrapper has no box of its own (display: contents), so layout is untouched; tip marks find
  // the attachment through it.
  const attached = media ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media} alt="" style={{ width: bodyWidth, display: "block", borderRadius: 16, border: `1px solid ${theme.cardBorder}`, boxSizing: "border-box", maxHeight: bodyWidth * 1.25, objectFit: "cover" }} />
  ) : quote ? (
    <QuoteEmbed entity={quote.entity} state={quote.state} device={device} theme={theme} />
  ) : card ? (
    <LinkCard card={card} theme={theme} width={bodyWidth} viewport={viewport} font={device.font} />
  ) : null;
  const attachment = attached && <div data-attachment="" style={{ display: "contents" }}>{attached}</div>;

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
        <div style={{ marginTop: 12, color: theme.secondary, fontSize: 15 }}>
          10:14 AM · {web ? "Sep 10, 2026" : "9/10/26"} · <span style={{ color: theme.text, fontWeight: 700 }}>12.4K</span> Views
        </div>
        <div style={{ marginTop: 12, borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, padding: "2px 0" }}>
          <Actions theme={theme} full />
        </div>
      </article>
    );
  }

  const isPhone = device.kind === "phone";
  const android = device.platform === "android";
  return (
    <article
      // Focusable when it toggles, as X's own timeline cells are; Enter or Space on the cell itself
      // (not on Show more inside it) toggles it, so the fold works without a mouse too.
      tabIndex={onToggle ? 0 : undefined}
      onClick={onToggle}
      onKeyDown={onToggle ? (e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onToggle();
      } : undefined}
      style={{
        cursor: onToggle ? "pointer" : undefined,
        // App cell measured on an iPhone 15 Pro capture: 12px inset, 44px avatar, 8px gap, 12px right.
        // Android (Pixel 3 capture): 12px inset, 40px avatar, 8px gap, 12px right (devices.ts textWidth).
        padding: isPhone ? (android ? "12px" : "12px 13px 12px 12px") : "12px 16px",
        backgroundColor: theme.bg,
        width: device.width,
        boxSizing: "border-box",
        borderBottom: `1px solid ${theme.border}`,
        borderLeft: isPhone ? undefined : `1px solid ${theme.border}`,
        borderRight: isPhone ? undefined : `1px solid ${theme.border}`,
        ...font,
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <Avatar src={identity.avatar} size={isPhone && !android ? 44 : 40} square={square} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, height: 20 }}>
            <NameRow name={name} handle={handle} badge={identity.badge} time="1h" theme={theme} />
            <div style={{ color: theme.icon, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", margin: "-6px -8px 0 0", flexShrink: 0 }}>
              <MoreIcon size={16} />
            </div>
          </div>
          <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 12 }}>
            {hasBody && body}
            {attachment}
          </div>
          <div style={{ marginTop: 4, marginLeft: -8 }}>
            <Actions theme={theme} full={false} />
          </div>
        </div>
      </div>
    </article>
  );
}
