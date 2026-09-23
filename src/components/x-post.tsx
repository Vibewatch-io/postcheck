"use client";

import type { ReactNode, Ref } from "react";
import type { Device } from "@/lib/devices";
import type { XTheme } from "@/lib/theme";
import { fontStack } from "@/lib/theme";
import type { CardData } from "@/lib/card";
import { Entity, Token, type StyleRun } from "@/lib/entities";
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
  hiddenUrlStart: number | null;
  card: CardData | "loading" | null;
  quote: Entity | null;
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
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className={shape} style={{ flexShrink: 0, display: "block", borderRadius: square ? undefined : "50%", overflow: "hidden" }}>
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

function QuoteStub({ entity, theme, width, font }: { entity: Entity; theme: XTheme; width: number; font: "web" | "app" }) {
  return (
    <div style={{ width, boxSizing: "border-box", border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 12, fontFamily: fontStack(font), fontSize: 15, lineHeight: "20px", color: theme.secondary }}>
      {entity.isArticle ? "Article on X" : "Quote post"} · {entity.display}
    </div>
  );
}

/**
 * One post cell, laid out with the values read off x.com: 12px/16px cell
 * padding, 40px avatar, 8px gap, 15px/20px Chirp, name row → 2px → body →
 * 12px → card → action row. The post page ("focal") variant runs the body at
 * 17px/24px under the header and adds the timestamp row.
 */
export function XPost({ device, theme, identity, tokens, showMore, hiddenUrlStart, card, quote, media, styles, bodyRef }: Props) {
  const font = { fontFamily: fontStack(device.font), fontSize: 15, lineHeight: "20px" } as const;
  const handle = identity.handle.replace(/^@/, "") || "yourhandle";
  const name = identity.name || "Your name";
  const square = identity.badge === "gold" || identity.badge === "gray";
  const bodyWidth = device.textWidth;
  const viewport = device.kind === "phone" ? device.width : 1200;
  const hasBody = tokens.some((t) => t.kind !== "space" && t.kind !== "newline" && !(t.kind === "entity" && t.entity.start === hiddenUrlStart));

  const attachment = media ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media} alt="" style={{ width: bodyWidth, display: "block", borderRadius: 16, border: `1px solid ${theme.cardBorder}`, boxSizing: "border-box", maxHeight: bodyWidth * 1.25, objectFit: "cover" }} />
  ) : quote ? (
    <QuoteStub entity={quote} theme={theme} width={bodyWidth} font={device.font} />
  ) : card ? (
    <LinkCard card={card} theme={theme} width={bodyWidth} viewport={viewport} font={device.font} />
  ) : null;

  const body = (
    <PostBody
      ref={bodyRef}
      tokens={tokens}
      showMoreAt={showMore ? tokens.length : -1}
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
  return (
    <article
      style={{
        // App cell measured on an iPhone 15 Pro capture: 12px inset, 44px avatar, 8px gap, 12px right.
        padding: isPhone ? "12px 13px 12px 12px" : "12px 16px",
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
        <Avatar src={identity.avatar} size={isPhone ? 44 : 40} square={square} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, height: 20 }}>
            <div style={{ display: "flex", alignItems: "center", minWidth: 0, color: theme.secondary, whiteSpace: "nowrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                <span style={{ color: theme.text, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                <BadgeIcon badge={identity.badge} theme={theme} />
              </span>
              <span style={{ marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", fontFeatureSettings: '"ss01"' }}>@{handle}</span>
              <span style={{ padding: "0 4px" }}>·</span>
              <span>1h</span>
            </div>
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
