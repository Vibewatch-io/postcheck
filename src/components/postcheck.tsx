"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { DEVICES, DEFAULT_DEVICE, type Device } from "@/lib/devices";
import { THEMES, type ThemeId } from "@/lib/theme";
import { useFontTier, type FontTier } from "./font-tier";
import type { CardData } from "@/lib/card";
import { MAX_WEIGHTED_LENGTH, appFoldCut, cardUrl, extractEntities, isTrailing, quoteUrl, showMoreCut, stripFormatting, tokenize, weightedLength } from "@/lib/entities";
import { draftToDoc, serializeDoc, trimDraft, type Draft, type DocNode } from "@/lib/draft";
import { ComposerField, FormatBar, useComposer } from "./composer";
import { buildAdvice, type Advice, type DeviceLines } from "@/lib/advice";
import { XPost, type Badge, type Identity } from "./x-post";
import { PhoneFrame } from "./phone-frame";
import { SearchIcon } from "./icons";
import { LineProbes } from "./line-probe";

const SAMPLE =
  "@jack we've seen a lot of bad posts. The hook goes first so it survives the 280 cut, the link goes last so only the card shows, and nobody leaves one lonely word dangling on the last line.\n\nhttps://vibewatch.io";

type CardState = CardData | null | "loading";

/** A 1×1 image for the verify harness: a post with a photo never shows a link card. */
const STAND_IN_PHOTO = "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";

const SEVERITY_STYLE = {
  fix: { dot: "bg-brand-orange", label: "Fix" },
  tip: { dot: "bg-brand-teal", label: "Tip" },
  note: { dot: "bg-brand-warm-muted", label: "Note" },
} as const;

const inputCls = "min-w-0 flex-1 rounded-lg border border-brand-warm-border bg-white px-3 py-2 text-sm text-brand-warm-dark outline-none placeholder:text-brand-warm-muted focus:border-brand-teal focus:placeholder:text-transparent";

export function Postcheck() {
  const [draft, setDraft] = useState<Draft>({ text: "", styles: [] });
  // The sample is the editor's placeholder; the previews and checks run on it until the user types.
  const editor = useComposer(setDraft);
  const [identity, setIdentity] = useState<Identity>({ name: "", handle: "", avatar: null, badge: "none" });
  const [media, setMedia] = useState<string | null>(null);
  const [webDevice, setWebDevice] = useState<Device>(DEFAULT_DEVICE);
  const [phoneDevice, setPhoneDevice] = useState<Device>(DEVICES.find((d) => d.id === "iphone-16") ?? DEVICES[2]);
  const [themeId, setThemeId] = useState<ThemeId>("light");
  const [themeChosen, setThemeChosen] = useState(false);
  // Follow the viewer's system setting until they pick one themselves.
  useEffect(() => {
    if (themeChosen) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setThemeId(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeChosen]);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [lineSets, setLineSets] = useState<DeviceLines[]>([]);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | string>("idle");
  const theme = THEMES[themeId];
  const fontTier = useFontTier();

  // What X will actually post: outer whitespace trimmed, bold / italic as style runs over the plain text.
  const formatted = useMemo(() => trimDraft(draft.text.trim() ? draft : { text: SAMPLE, styles: [] }), [draft]);
  const post = formatted.text;
  const styles = formatted.styles;
  const styleCuts = useMemo(() => styles.flatMap((r) => [r.start, r.end]), [styles]);
  const entities = useMemo(() => extractEntities(post), [post]);
  const length = useMemo(() => weightedLength(post, entities), [post, entities]);
  const cut280 = useMemo(() => showMoreCut(post, length.limitIndex), [post, length.limitIndex]);

  // A link to a post becomes a quote wherever it sits, and a quote beats a link card (@postcheck_test
  // tests 40, 41, 45). A link to an X article is a plain link: no card, no embed (test 46).
  const quote = !media ? quoteUrl(entities) ?? null : null;
  const cardEntity = quote ? undefined : cardUrl(entities);
  const cardKey = cardEntity && !cardEntity.isStatus && !media ? cardEntity.href! : null;
  const card: CardState = cardKey ? (cards[cardKey] ?? "loading") : null;
  const hasAttachment = quote !== null || (card !== null && card !== "loading");
  const attachmentEntity = quote ?? cardEntity;
  const hiddenUrlStart = attachmentEntity && hasAttachment && isTrailing(post, attachmentEntity) ? attachmentEntity.start : null;

  // Probe text: the whole post, measured at every device width (the app folds by
  // rendered lines regardless of the 280 cut, so line 9 may lie past it).
  const probeTokens = useMemo(() => tokenize(post, entities, styleCuts), [post, entities, styleCuts]);
  const showMore280 = cut280 < post.length;

  // The app additionally folds long-by-lines posts (see devices.ts APP_MAX_LINES).
  const clampFor = useCallback(
    (d: Device) => {
      if (!d.maxLines) return null;
      const set = lineSets.find((s) => s.deviceId === d.id);
      if (!set || set.total <= d.maxLines) return null;
      const row = set.lines[d.maxLines - 1];
      if (!row) return null;
      // The last text line at or above the limit carries the token.
      let r = d.maxLines - 1;
      while (r > 0 && set.lines[r].spans.length === 0) r -= 1;
      const limit = appFoldCut(post, row.end, { spans: set.lines[r].spans, tokenWidth: set.tokenWidth, textWidth: d.textWidth });
      const lastWord = post.slice(0, limit).split(/\s+/).pop() ?? "";
      return { cut: limit, total: set.total, maxLines: d.maxLines, lastWord };
    },
    [lineSets, post],
  );
  const renderFor = useCallback(
    (d: Device) => {
      // The post page (web and app) always shows the whole text: no 280 fold, no line fold.
      if (d.kind === "focal" || d.view === "post") return { tokens: tokenize(post, entities, styleCuts), showMore: false, cut: post.length };
      const clamp = clampFor(d);
      // The app folds by rendered lines only: a long post shows its first 9 lines, not X's 280 cut
      // (Write/status/1646674962055565319 on an iPhone 15 Pro). Under 10 lines it shows everything it has.
      // A long post under 10 lines shows whole, with no Show more (@postcheck_test tests 05, 06, 08 on an iPhone 15 Pro).
      if (d.kind === "phone") {
        const cut = clamp ? clamp.cut : post.length;
        const ents = entities.filter((e) => e.end <= cut);
        return { tokens: tokenize(post.slice(0, cut), ents, styleCuts), showMore: Boolean(clamp), cut };
      }
      const cut = clamp ? Math.min(cut280, clamp.cut) : cut280;
      const visible = post.slice(0, cut);
      const ents = entities.filter((e) => e.end <= cut);
      return { tokens: tokenize(visible, ents, styleCuts), showMore: cut < post.length, cut };
    },
    [clampFor, cut280, post, entities, styleCuts],
  );
  const webRender = useMemo(() => renderFor(webDevice), [renderFor, webDevice]);
  const phoneRender = useMemo(() => renderFor(phoneDevice), [renderFor, phoneDevice]);
  const phoneClamp = clampFor(phoneDevice);

  // Fetch card metadata for the card URL, debounced while the user is typing.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    if (!cardKey || requested.current.has(cardKey)) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      requested.current.add(cardKey);
      setCards((c) => ({ ...c, [cardKey]: "loading" }));
      try {
        const res = await fetch(`/api/unfurl?url=${encodeURIComponent(cardKey)}`, { signal: ctrl.signal });
        const json = (await res.json()) as { card: CardData | null };
        setCards((c) => ({ ...c, [cardKey]: json.card }));
      } catch {
        if (ctrl.signal.aborted) requested.current.delete(cardKey);
        else setCards((c) => ({ ...c, [cardKey]: null }));
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [cardKey]);

  const advice: Advice[] = useMemo(
    () =>
      buildAdvice({
        text: post,
        entities,
        length,
        card: card === "loading" ? undefined : card,
        lineSets,
        appClamp: phoneClamp ? { maxLines: phoneClamp.maxLines, total: phoneClamp.total, lastWord: phoneClamp.lastWord, deviceLabel: phoneDevice.label } : null,
        hasMedia: media !== null,
        hasStyles: styles.length > 0,
        typed: draft.text,
      }),
    [post, entities, length, card, lineSets, phoneClamp, media, phoneDevice.label, styles.length, draft.text],
  );

  const readFile = useCallback((file: File | undefined, set: (url: string) => void) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && set(reader.result);
    reader.readAsDataURL(file);
  }, []);


  /** Fill name, avatar and badge from the handle typed in. */
  const lookupProfile = useCallback(async () => {
    const u = identity.handle.trim();
    if (!u) return;
    setLookupState("loading");
    try {
      const res = await fetch(`/api/profile?u=${encodeURIComponent(u)}`);
      const json = (await res.json()) as { profile?: Identity; error?: string };
      if (!res.ok || !json.profile) throw new Error(json.error || "Lookup failed. Enter the details by hand.");
      setIdentity(json.profile);
      setLookupState("idle");
    } catch (e) {
      setLookupState(e instanceof Error ? e.message : "Lookup failed. Enter the details by hand.");
    }
  }, [identity.handle]);

  // Test hook for scripts/verify.mjs, which drives the composer headlessly.
  useEffect(() => {
    const w = window as unknown as { __postcheck?: object };
    w.__postcheck = {
      ready: Boolean(editor),
      // **bold** / __italic__ markers become style runs; `photo` attaches a stand-in image.
      setDraft: (raw: string, opts: { photo?: boolean } = {}) => {
        const { text, styles } = stripFormatting(raw);
        editor?.commands.setContent(draftToDoc(text, styles));
        setMedia(opts.photo ? STAND_IN_PHOTO : null);
      },
      getText: () => (editor ? serializeDoc(editor.getJSON() as DocNode).text : draft.text),
    };
  }, [editor, draft.text]);

  const over = length.weighted > MAX_WEIGHTED_LENGTH;
  const ratio = Math.min(1, length.weighted / MAX_WEIGHTED_LENGTH);
  const ringColor = over ? "#F97316" : length.weighted > 260 ? "#F5A623" : "#00C4A1";

  // Tips sit to the right of the preview when there's room, otherwise under the composer.
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => setRowWidth(row.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);
  // Room for the wider preview plus the tips beside it, so neither view moves anything when you switch.
  // The composer never changes width. As the window narrows the tips column gives way (down to
  // TIPS_MIN), then the tips move under the composer, then Write / Preview split into a switch.
  const widestPreview = Math.max(phoneDevice.width + 24, webDevice.width);
  const room = (rowWidth ?? Infinity) - COLUMN_GAP - widestPreview - TIPS_GAP - COMPOSER_W;
  const tipsAside = rowWidth === null || room >= TIPS_MIN;
  const tipsWidth = Math.max(TIPS_MIN, Math.min(TIPS_MAX, room));
  const previewArea = widestPreview + TIPS_GAP + tipsWidth;
  // Too narrow for the composer beside a true-size preview: stack them and let the page scroll.
  // (The same width is the page's breakpoint in page.tsx, where the window lock comes off.)
  const narrow = rowWidth !== null && rowWidth < COMPOSER_W + COLUMN_GAP + widestPreview;

  // Tips only appear for the user's own draft, and only when there's something to say. The column
  // keeps its space either way, so nothing shifts when they come and go.
  const showTips = draft.text.trim() !== "" && advice.length > 0;
  const hints = showTips && (
    <div className={tipsAside ? "" : "mt-4 border-t border-brand-warm-border pt-3"}>
      <h2 className="font-syne text-sm font-semibold lining-nums text-brand-warm-dark">
        {`${advice.length} ${advice.length === 1 ? "thing" : "things"} to look at`}
      </h2>
      <ul className="mt-2 space-y-2.5">
        {advice.map((a) => (
          <li key={a.id} className="flex gap-2">
            <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_STYLE[a.severity].dot}`} aria-label={SEVERITY_STYLE[a.severity].label} />
            <div>
              <p className="text-[13px] font-semibold leading-snug text-brand-warm-dark">{a.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-brand-warm-gray">{a.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    // Composer, preview and tips share one row, each centred vertically in the window. On narrow
    // windows the preview stacks under the composer and the page scrolls.
    <div ref={rowRef} className={`flex min-h-0 flex-1 ${narrow ? "flex-col items-center gap-6 pb-6" : "items-center justify-center gap-6"}`}>
      <ThemeToggle themeId={themeId} onChange={(t) => { setThemeChosen(true); setThemeId(t); }} />
      <LineProbes tokens={probeTokens} showMore={showMore280} hiddenUrlStart={hiddenUrlStart} devices={DEVICES} onMeasure={setLineSets} styles={styles} />

      {/* Composer on the left; scrolls on its own if it outgrows the window. */}
      <section
        className={`max-h-full min-h-0 overflow-y-auto rounded-2xl border border-brand-warm-border bg-white/75 p-4 shadow-[0_1px_2px_rgba(20,20,18,0.04)] backdrop-blur-sm ${narrow ? "w-full max-w-[560px]" : "flex-none"}`}
        style={narrow ? undefined : { width: COMPOSER_W }}
      >
        {/* Identity in one row, handle first: it doubles as the lookup that fills in the rest. */}
        <form
          className="mb-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void lookupProfile();
          }}
        >
          <div className="flex min-w-0 flex-[1.3] basis-[190px] items-center rounded-lg border border-brand-warm-border bg-white pl-3 focus-within:border-brand-teal">
            <span className="text-sm text-brand-warm-secondary">@</span>
            <input
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-brand-warm-dark outline-none placeholder:text-brand-warm-muted focus:placeholder:text-transparent"
              value={identity.handle}
              maxLength={15}
              placeholder="yourhandle"
              aria-label="Handle"
              // Not a login: keep password managers (1Password, LastPass, Bitwarden, Dashlane) out of it.
              autoComplete="off" data-1p-ignore="" data-lpignore="true" data-bwignore="true" data-form-type="other"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setIdentity((i) => ({ ...i, handle: e.target.value.replace(/[^A-Za-z0-9_]/g, "") }))}
            />
            <button
              type="submit"
              disabled={lookupState === "loading" || !identity.handle}
              title="Look up on X: fills name, photo and check"
              aria-label="Look up on X"
              className="mr-1 flex h-7 w-7 flex-none items-center justify-center rounded-md text-brand-teal-dark hover:bg-brand-teal/10 disabled:text-brand-warm-muted disabled:hover:bg-transparent"
            >
              {lookupState === "loading" ? "…" : <SearchIcon size={16} />}
            </button>
          </div>
          <label className="group relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-brand-warm-border bg-brand-warm-surface" title="Upload avatar">
            {identity.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={identity.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[11px] font-medium text-brand-warm-secondary">Photo</span>
            )}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => readFile(e.target.files?.[0], (url) => setIdentity((i) => ({ ...i, avatar: url })))} />
          </label>
          <input className={`${inputCls} basis-[140px]`} value={identity.name} maxLength={50} placeholder="Your name" aria-label="Display name" autoComplete="off" data-1p-ignore="" data-lpignore="true" data-bwignore="true" data-form-type="other" onChange={(e) => setIdentity((i) => ({ ...i, name: e.target.value }))} />
          <select value={identity.badge} onChange={(e) => setIdentity((i) => ({ ...i, badge: e.target.value as Badge }))} aria-label="Verified badge" title="Verified check" className="flex-none rounded-lg border border-brand-warm-border bg-white px-2 py-2 text-sm text-brand-warm-dark">
            <option value="none">None</option>
            <option value="blue">Blue</option>
            <option value="gold">Gold</option>
            <option value="gray">Gray</option>
          </select>
          {lookupState !== "idle" && lookupState !== "loading" && <p className="w-full text-sm text-brand-orange">{lookupState}</p>}
        </form>

        <ComposerField editor={editor} placeholder={SAMPLE} />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-brand-warm-gray">
          <span className="flex items-center gap-3">
            <FormatBar editor={editor} />
            <label className="cursor-pointer rounded-lg border border-brand-warm-border px-3 py-1.5 text-sm font-medium text-brand-warm-dark hover:bg-brand-warm-surface">
              {media ? "Replace image" : "Add image"}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => readFile(e.target.files?.[0], setMedia)} />
            </label>
            {media && (
              <button type="button" className="text-sm text-brand-warm-secondary hover:underline" onClick={() => setMedia(null)}>
                Remove image
              </button>
            )}
          </span>
          <span className="flex items-center gap-2 tabular-nums" title="Weighted length, the way X counts it">
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
              <circle cx="14" cy="14" r="11" fill="none" stroke="#E4E1DA" strokeWidth="3" />
              <circle cx="14" cy="14" r="11" fill="none" stroke={ringColor} strokeWidth="3" strokeDasharray={`${ratio * 69.1} 69.1`} strokeLinecap="round" transform="rotate(-90 14 14)" />
            </svg>
            <span className={over ? "font-semibold text-brand-orange" : ""}>{over ? `${MAX_WEIGHTED_LENGTH - length.weighted}` : `${length.weighted} / ${MAX_WEIGHTED_LENGTH}`}</span>
          </span>
        </div>

        {!tipsAside && hints}
      </section>

      <Preview
        stacked={narrow}
        tips={tipsAside ? hints : null}
        areaWidth={narrow ? Math.min(rowWidth ?? 0, Math.max(phoneDevice.width + 24, webDevice.width)) : tipsAside ? previewArea : Math.max(phoneDevice.width + 24, webDevice.width)}
        fontTier={fontTier}
        fontBanner={
          fontTier && fontTier !== "chirp" ? (
            <p className="mb-3 rounded-lg border border-brand-orange/40 bg-orange-50 px-3 py-2 text-sm text-brand-warm-dark" role="status">
              {fontTier === "gt"
                ? "X's font (Chirp) didn't load, so the previews use GT America, the typeface it was derived from. Line breaks are within about 2px of X's; treat any word right at the edge as uncertain."
                : "X's font (Chirp) didn't load and no stand-in is available, so line breaks here are only approximate."}
            </p>
          ) : null
        }
        webDevice={webDevice}
        setWebDevice={setWebDevice}
        phoneDevice={phoneDevice}
        setPhoneDevice={setPhoneDevice}
        themeId={themeId}
        web={
          <div style={{ backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}`, borderBottom: webDevice.kind === "focal" ? `1px solid ${theme.border}` : undefined, width: webDevice.width }}>
            <XPost device={webDevice} theme={theme} identity={identity} tokens={webRender.tokens} showMore={webRender.showMore} hiddenUrlStart={hiddenUrlStart} card={card} quote={quote} media={media} styles={styles} />
          </div>
        }
        app={(maxHeight) => (
          <PhoneFrame device={phoneDevice} theme={theme} maxHeight={maxHeight}>
            <XPost device={phoneDevice} theme={theme} identity={identity} tokens={phoneRender.tokens} showMore={phoneRender.showMore} hiddenUrlStart={hiddenUrlStart} card={card} quote={quote} media={media} styles={styles} />
          </PhoneFrame>
        )}
      />

    </div>
  );
}

/** The toolbar above the preview, which the phone has to leave room for. */
const TOOLBAR_H = 48;
const COMPOSER_W = 560;
const COLUMN_GAP = 24;
/** Tips sit close to the preview, like notes in its margin. */
const TIPS_MIN = 160;
const TIPS_MAX = 280;
/** Beside the narrower phone the tips fill the room the web view reserves, so both views are the same
 *  width and the page stays centred; capped at a readable line length. */
const TIPS_MAX_MOBILE = 460;
const TIPS_GAP = 20;

interface PreviewProps {
  /** Stacked under the composer on a scrolling page: full phone height, no centring. */
  stacked: boolean;
  /** Tips beside the preview, level with the post; null when they live under the composer. */
  tips: React.ReactNode;
  /** Width the preview area reserves: sized for phone + tips, so switching views never moves anything. */
  areaWidth: number;
  fontBanner: React.ReactNode;
  /** Which body font loaded. PNG export is off on the GT America tier: Grilli Type's web licence forbids saving the font into images. */
  fontTier: FontTier | null;
  webDevice: Device;
  setWebDevice: (d: Device) => void;
  phoneDevice: Device;
  setPhoneDevice: (d: Device) => void;
  themeId: ThemeId;
  web: React.ReactNode;
  /** The phone, given the height it may take (it sheds app furniture to fit, never the post). */
  app: (maxHeight: number | undefined) => React.ReactNode;
}

/**
 * One preview at a time, at true size, behind a Mobile / Web switch. Mobile is the default: it's how
 * most people read X.
 */
function Preview({ stacked, tips, areaWidth, fontBanner, fontTier, webDevice, setWebDevice, phoneDevice, setPhoneDevice, themeId, web, app }: PreviewProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"app" | "web">("app");
  const [room, setRoom] = useState<number | null>(null);
  // Whichever preview is showing is centred vertically; switching views slides it into place.
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => setRoom(area.getBoundingClientRect().height - TOOLBAR_H);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  // Tips start level with the post (inside the phone, or at the top of the web cell). The post's
  // offset changes as the phone sheds furniture, so it's measured.
  const [postTop, setPostTop] = useState(0);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const post = stage.querySelector("article");
      if (post) setPostTop(Math.round(post.getBoundingClientRect().top - stage.getBoundingClientRect().top));
      setStageHeight(Math.round(stage.getBoundingClientRect().height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    // The phone drops its tabs or header without changing size, so watch its contents too.
    const mo = new MutationObserver(measure);
    mo.observe(stage, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [view]);

  const device = view === "app" ? phoneDevice : webDevice;
  const width = view === "app" ? phoneDevice.width + 24 : webDevice.width;

  const exportAllowed = fontTier !== "gt";
  const exportPng = useCallback(async () => {
    const node = stageRef.current;
    if (!node || exporting || !exportAllowed) return;
    setExporting(true);
    setExportError(null);
    try {
      await document.fonts.ready;
      const { toPng } = await import("html-to-image");
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000));
      const dataUrl = await Promise.race([toPng(node, { pixelRatio: device.pixelRatio, cacheBust: false }), timeout]);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `postcheck-${device.id}-${themeId}.png`;
      a.click();
    } catch {
      setExportError("Export didn't finish. Try again, or screenshot the preview.");
    } finally {
      setExporting(false);
    }
  }, [device, themeId, exporting, exportAllowed]);

  const select = "h-8 min-w-0 rounded-lg border border-brand-warm-border bg-white px-2 text-[13px] text-brand-warm-dark";
  const segment = (on: boolean) => `px-3 text-[13px] font-medium transition ${on ? "bg-brand-warm-dark text-white" : "text-brand-warm-gray hover:text-brand-warm-dark"}`;

  return (
    // Left-aligned in a fixed-width area: the switch stays under your cursor when you change views.
    <div
      ref={areaRef}
      className={`flex min-h-0 max-w-full flex-none flex-col justify-start transition-[padding] duration-300 ease-out ${stacked ? "items-center" : "h-full items-start"}`}
      style={{ width: stacked ? "100%" : areaWidth, paddingTop: !stacked && room !== null && stageHeight !== null ? Math.max(0, Math.floor((room - stageHeight) / 2)) : 0 }}
    >
      {fontBanner}
      <div className="mb-3 flex max-w-full flex-none items-center gap-2" style={{ height: TOOLBAR_H - 12, width }}>
        <div className="flex h-8 flex-none overflow-hidden rounded-lg border border-brand-warm-border bg-white" role="tablist" aria-label="Preview">
          <button type="button" role="tab" aria-selected={view === "app"} onClick={() => setView("app")} className={segment(view === "app")}>Mobile</button>
          <button type="button" role="tab" aria-selected={view === "web"} onClick={() => setView("web")} className={segment(view === "web")}>Web</button>
        </div>
        {view === "app" ? (
          <select value={phoneDevice.id} onChange={(e) => setPhoneDevice(PHONE_DEVICES.find((d) => d.id === e.target.value) ?? PHONE_DEVICES[0])} aria-label="App device" className={select}>
            {PHONE_DEVICES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        ) : (
          <select value={webDevice.id} onChange={(e) => setWebDevice(WEB_DEVICES.find((d) => d.id === e.target.value) ?? WEB_DEVICES[0])} aria-label="Web device" className={select}>
            {WEB_DEVICES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        )}
        {exportAllowed ? (
          <button type="button" onClick={() => void exportPng()} disabled={exporting} className="ml-auto h-8 flex-none whitespace-nowrap rounded-lg bg-brand-teal px-3 text-[13px] font-medium text-brand-warm-dark shadow-sm transition hover:bg-brand-teal-light disabled:opacity-60">
            {exporting ? "Rendering…" : "Export PNG"}
          </button>
        ) : (
          <span className="ml-auto min-w-0 text-right text-[12px] leading-tight text-brand-warm-secondary" title="Grilli Type's web licence doesn't allow saving GT America into images.">
            Export is off while GT America stands in for Chirp.
          </span>
        )}
      </div>
      {exportError && <p className="mb-3 text-sm text-brand-orange">{exportError}</p>}
      {/* True size, never scaled. */}
      <div className={`flex min-h-0 max-w-full gap-5 overflow-auto flex-row items-start`}>
        <div ref={stageRef} className="flex-none" style={{ display: "inline-block", width }}>
          {view === "app" ? app(stacked ? undefined : (room ?? undefined)) : web}
        </div>
        {tips && (
          <aside className="flex-none" style={{ width: Math.min(TIPS_MAX_MOBILE, areaWidth - width - TIPS_GAP), marginTop: postTop }}>
            {tips}
          </aside>
        )}
      </div>
    </div>
  );
}

const WEB_DEVICES = DEVICES.filter((d) => d.kind !== "phone");
const PHONE_DEVICES = DEVICES.filter((d) => d.kind === "phone");

/** Light / dark switch for the previews, rendered into the page header's slot. */
function ThemeToggle({ themeId, onChange }: { themeId: ThemeId; onChange: (t: ThemeId) => void }) {
  const slot = useSyncExternalStore(
    () => () => {},
    () => document.getElementById("theme-slot"),
    () => null,
  );
  const dark = themeId === "dark";
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Preview in dark mode"
      title={dark ? "Previews in X's dark mode. Click for light." : "Previews in X's light mode. Click for dark."}
      onClick={() => onChange(dark ? "light" : "dark")}
      className="flex items-center gap-1 rounded-full border border-brand-warm-border bg-white p-1 text-brand-warm-gray shadow-sm"
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${dark ? "" : "bg-brand-warm-dark text-white"}`} aria-hidden>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </span>
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${dark ? "bg-brand-warm-dark text-white" : ""}`} aria-hidden>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      </span>
    </button>
  );
  return slot ? createPortal(control, slot) : null;
}
