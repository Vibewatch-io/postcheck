"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { DEVICES, DEFAULT_DEVICE, DEFAULT_PHONE_ID, THIS_PHONE_ID, nearestListedPhone, rowHidesStyles, thisPhone, type Device } from "@/lib/devices";
import { THEMES, type ThemeId } from "@/lib/theme";
import { useFontTier, type FontTier } from "./font-tier";
import { cardless, type CardData } from "@/lib/card";
import { DESCRIPTION, MISMATCH_FORM, SITE_HOST, SITE_URL, TITLE } from "@/lib/site";
import socialCard from "@/app/opengraph-image.png";
import { MAX_WEIGHTED_LENGTH, appFoldCut, cardUrl, extractEntities, isTrailing, quoteUrl, showMoreCut, stripFormatting, tokenize, weightedLength } from "@/lib/entities";
import { draftToDoc, serializeDoc, trimDraft, type Draft, type DocNode } from "@/lib/draft";
import { ComposerField, FormatBar, useComposer } from "./composer";
import { buildAdvice, type Advice, type DeviceLines, type Severity } from "@/lib/advice";
import { DefaultAvatar, XPost, type Badge, type Identity } from "./x-post";
import { PHONE_BEZEL, PhoneFrame } from "./phone-frame";
import { CameraIcon, SearchIcon } from "./icons";
import { LineProbes } from "./line-probe";
import { ShareButton } from "./share-button";
import { SHARE_PREFIX, decodeShare, type SharedPreview } from "@/lib/share";
import { statusId, type QuoteResult, type QuoteState } from "@/lib/quote";
import { APP_MIN_RATIO, mediaLayout, type MediaItem, type MediaKind } from "@/lib/media";
import { MediaPicker } from "./media-picker";

// The sample says what Postcheck does, and shows it: on the default 402pt iPhone preview "line." wraps
// alone onto its own line on purpose, and the trailing link shows only its card. 261 of 280.
const SAMPLE =
  `We've seen lots of posts on X, so we know how yours will look.\n\nPostcheck counts your characters the way X does, shows exactly where "Show more" cuts in, and flags any single word stranded on its own line.\n\nWe never store what you write.\n${SITE_URL}`;

/**
 * The sample links to Postcheck itself, so its card ships with the page instead of being looked up:
 * the large card X builds from this site's own tags (title, summary_large_image, the social card),
 * with the image served from this origin so PNG export can draw it. It applies to the link exactly
 * as the sample writes it (`SITE_URL`), whether the placeholder shows it or someone types it that
 * way; any other spelling of it is looked up like any link.
 */
const PRECACHED_CARDS: Record<string, CardData> = {
  [SITE_URL]: { url: `${SITE_URL}/`, host: SITE_HOST, title: TITLE, description: DESCRIPTION, image: socialCard.src, layout: "large" },
};

type CardState = CardData | null | "loading";

/** A 1×1 grey image for the verify harness, standing in for media of any recorded size. */
const STAND_IN_PHOTO = "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
const NO_MEDIA: MediaItem[] = [];

/** Fix = something X will do to the post that you'll regret (error); tip = worth changing (warning); note = good to know (info). */
const SEVERITY_STYLE = {
  fix: { dot: "bg-severity-fix", label: "Fix" },
  tip: { dot: "bg-severity-tip", label: "Tip" },
  note: { dot: "bg-severity-note", label: "Note" },
} as const;

// 16px on phones (iOS Safari zooms into smaller fields on tap), 14px from the sm breakpoint up.
const inputCls = "min-w-0 flex-1 rounded-lg border border-brand-warm-border bg-white px-3 py-2 text-base sm:text-sm text-brand-warm-dark outline-hidden placeholder:text-brand-warm-muted focus:border-brand-teal focus:placeholder:text-transparent";

export function Postcheck() {
  const [draft, setDraft] = useState<Draft>({ text: "", styles: [] });
  // The sample is the editor's placeholder; the previews and checks run on it until the user types.
  const editor = useComposer(setDraft);
  const [identity, setIdentity] = useState<Identity>({ name: "", handle: "", avatar: null, badge: "none" });
  const [media, setMedia] = useState<MediaItem[]>(NO_MEDIA);
  const [webDevice, setWebDevice] = useState<Device>(DEFAULT_DEVICE);
  const [phoneDevice, setPhoneDevice] = useState<Device>(DEFAULT_PHONE);
  // On a phone, the preview defaults to that phone itself, drawn at its own width (see thisPhone).
  const here = useThisPhone();
  const [phoneChosen, setPhoneChosen] = useState(false);
  const choosePhone = useCallback((d: Device) => {
    setPhoneChosen(true);
    setPhoneDevice(d);
  }, []);
  // Follow the phone during render (not in an effect, so no frame shows the old one): a rotation
  // redraws this phone at its new width, leaving phone mode drops back to the list, and on first
  // sight it becomes the preview unless a phone was already picked (by hand or by a share link).
  const [hereSeen, setHereSeen] = useState<Device | null>(null);
  if (here !== hereSeen) {
    setHereSeen(here);
    setPhoneDevice((d) => (d.id === THIS_PHONE_ID ? (here ?? DEFAULT_PHONE) : here && !phoneChosen ? here : d));
  }
  const probeDevices = useMemo(() => (here ? [...DEVICES, here] : DEVICES), [here]);
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
  const [cards, setCards] = useState<Record<string, CardState>>(PRECACHED_CARDS);
  // Quote lookups by status number. A found or missing post is kept for the session; a failed
  // lookup is dropped so the next time that link is needed it is asked for again.
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const [lineSets, setLineSets] = useState<DeviceLines[]>([]);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | string>("idle");
  const [view, setView] = useState<"app" | "web">("app");
  // Clicking Show more expands that preview in place, the way x.com does, keyed by device id; a
  // click anywhere on a cut or expanded post toggles it, so it can be folded again. Any change to
  // the text folds every preview again (see below); bold / italic alone don't, and a device stays
  // expanded if you switch away and back.
  const [expanded, setExpanded] = useState<Record<string, true>>({});
  const theme = THEMES[themeId];
  const fontTier = useFontTier();

  // A share link (#s=…) opens as the preview alone; "Edit a copy" loads it into the composer.
  const [shared, setShared] = useState<SharedPreview | null>(null);
  // A damaged link leaves a notice over the composer, holding the draft text it appeared over: it
  // goes away as soon as the draft changes or a good link opens.
  const [shareError, setShareError] = useState<string | null>(null);
  // True while a link is being read, so the composer doesn't show first. Set in a layout effect, so
  // it is in place from the first paint after hydration; the server-rendered page before that
  // can't see the fragment and still shows the composer for a moment.
  const [opening, setOpening] = useState(false);
  // What the page showed before a share took over, so going Back (or to a damaged link) returns to
  // it. `latest` mirrors the current state for the hashchange listener, which is bound once.
  const latest = useRef({ draft, identity, media, phoneDevice, webDevice, themeId, themeChosen, view });
  useLayoutEffect(() => {
    latest.current = { draft, identity, media, phoneDevice, webDevice, themeId, themeChosen, view };
  });
  const beforeShare = useRef<typeof latest.current | null>(null);
  useLayoutEffect(() => {
    let live = true;
    let reads = 0;
    const leave = () => {
      const b = beforeShare.current;
      beforeShare.current = null;
      setShared(null);
      if (!b) return;
      setDraft(b.draft);
      setIdentity(b.identity);
      setMedia(b.media);
      setPhoneDevice(b.phoneDevice);
      setWebDevice(b.webDevice);
      setThemeChosen(b.themeChosen);
      setThemeId(b.themeId);
      setView(b.view);
    };
    const open = () => {
      // Only the newest read counts: a slow decode must not land after the hash has moved on.
      const read = ++reads;
      if (!location.hash.startsWith(SHARE_PREFIX)) {
        setOpening(false);
        leave();
        return;
      }
      setOpening(true);
      void decodeShare(location.hash).catch(() => null).then((p) => {
        if (!live || read !== reads) return;
        if (p) {
          beforeShare.current ??= latest.current;
          setShareError(null);
          setShared(p);
          setDraft({ text: p.text, styles: p.styles });
          setIdentity(p.identity);
          setMedia(p.media);
          setPhoneChosen(true);
          setPhoneDevice(DEVICES.find((d) => d.id === p.phone) ?? DEFAULT_PHONE);
          setWebDevice(DEVICES.find((d) => d.id === p.web) ?? DEFAULT_DEVICE);
          setThemeChosen(true);
          setThemeId(p.theme);
          setView(p.view);
        } else {
          // The notice sits over the draft the page returns to.
          setShareError((beforeShare.current ?? latest.current).draft.text);
          history.replaceState(null, "", location.pathname + location.search);
          leave();
        }
        setOpening(false);
      });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => {
      live = false;
      window.removeEventListener("hashchange", open);
    };
  }, []);
  const previewOnly = shared !== null || opening;
  // Once the draft moves on from the text the notice appeared over, the notice is done for good.
  if (shareError !== null && shareError !== draft.text) setShareError(null);
  const editCopy = useCallback(() => {
    if (!shared) return;
    editor?.commands.setContent(draftToDoc(shared.text, shared.styles));
    // The copy is now yours: Back no longer restores what was here before.
    beforeShare.current = null;
    setShared(null);
    history.replaceState(null, "", location.pathname + location.search);
  }, [editor, shared]);

  // What X will actually post: outer whitespace trimmed, bold / italic as style runs over the plain text.
  const formatted = useMemo(() => trimDraft(draft.text.trim() ? draft : { text: SAMPLE, styles: [] }), [draft]);
  const post = formatted.text;
  const styles = formatted.styles;
  // Reset during render rather than in an effect, so an edit never paints an expanded frame and
  // undoing back to the text that was expanded doesn't expand it again.
  const [expandedText, setExpandedText] = useState(post);
  if (expandedText !== post) {
    setExpandedText(post);
    setExpanded({});
  }
  const styleCuts = useMemo(() => styles.flatMap((r) => [r.start, r.end]), [styles]);
  const entities = useMemo(() => extractEntities(post), [post]);
  const length = useMemo(() => weightedLength(post, entities), [post, entities]);
  const cut280 = useMemo(() => showMoreCut(post, length.limitIndex), [post, length.limitIndex]);

  // A link to a post becomes a quote wherever it sits, and a quote beats a link card (@postcheck_test
  // tests 40, 41, 45). A link to an X article is a plain link: no card, no embed (test 46).
  const quote = !media.length ? quoteUrl(entities) ?? null : null;
  const quoteId = quote ? statusId(quote.href) : null;
  // No answer yet means a lookup is about to start: the embed holds its place from the first frame.
  const quoteState: QuoteState | null = quoteId ? (quotes[quoteId] ?? "loading") : null;
  const cardEntity = quote ? undefined : cardUrl(entities);
  const cardKey = cardEntity && !cardEntity.isStatus && !media.length && !cardless(cardEntity.href!) ? cardEntity.href! : null;
  const card: CardState = cardKey ? (cards[cardKey] ?? "loading") : null;
  const hasAttachment = quote !== null || (card !== null && card !== "loading");
  const attachmentEntity = quote ?? cardEntity;
  const hiddenUrlStart = attachmentEntity && hasAttachment && isTrailing(post, attachmentEntity) ? attachmentEntity.start : null;

  // Probe text: the whole post, measured at every device width (the iOS app folds by
  // rendered lines regardless of the 280 cut, so line 9 may lie past it).
  const probeTokens = useMemo(() => tokenize(post, entities, styleCuts), [post, entities, styleCuts]);
  const showMore280 = cut280 < post.length;

  // The iOS app additionally folds long-by-lines posts (see devices.ts APP_MAX_LINES).
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
      // So does a timeline post once its Show more has been clicked.
      if (d.kind === "focal" || d.view === "post" || expanded[d.id]) return { tokens: tokenize(post, entities, styleCuts), showMore: false, cut: post.length };
      const clamp = clampFor(d);
      // The iOS app folds by rendered lines only: a long post shows its first 9 lines, not X's 280 cut
      // (Write/status/1646674962055565319 on an iPhone 15 Pro). Under 10 lines it shows everything it has.
      // A long post under 10 lines shows whole, with no Show more (@postcheck_test tests 05, 06, 08 on an iPhone 15 Pro).
      // The Android app cuts at 280 exactly like the web and never folds by lines (tests 05–08, 11–13 on Android 12).
      if (d.kind === "phone" && d.platform === "ios") {
        const cut = clamp ? clamp.cut : post.length;
        const ents = entities.filter((e) => e.end <= cut);
        return { tokens: tokenize(post.slice(0, cut), ents, styleCuts), showMore: Boolean(clamp), cut };
      }
      const cut = clamp ? Math.min(cut280, clamp.cut) : cut280;
      const visible = post.slice(0, cut);
      const ents = entities.filter((e) => e.end <= cut);
      return { tokens: tokenize(visible, ents, styleCuts), showMore: cut < post.length, cut };
    },
    [clampFor, cut280, post, entities, styleCuts, expanded],
  );
  const expand = useCallback((d: Device) => setExpanded((e) => ({ ...e, [d.id]: true })), []);
  const fold = useCallback((d: Device) => setExpanded((e) => {
    const next = { ...e };
    delete next[d.id];
    return next;
  }), []);
  // A click on a post folds it if it's expanded and expands it if it's cut. It decides from this
  // render's state, so the click that bubbles up from Show more (which has just expanded the post)
  // expands it again rather than folding it.
  const toggleFor = (d: Device, cut: boolean) => {
    const open = Boolean(expanded[d.id]);
    if (!open && !cut) return undefined;
    return { expanded: open, onToggle: () => (open ? fold(d) : expand(d)) };
  };
  const quoteProp = useMemo(() => (quote ? { entity: quote, state: quoteState } : null), [quote, quoteState]);
  const webRender = useMemo(() => renderFor(webDevice), [renderFor, webDevice]);
  const phoneRender = useMemo(() => renderFor(phoneDevice), [renderFor, phoneDevice]);
  const phoneClamp = clampFor(phoneDevice);

  // Fetch card metadata for the card URL once the link looks finished: something typed after it, or
  // a longer pause when it's the last thing in the post (where a half-typed link usually sits). Each
  // card is fetched once a session and kept here; the server keeps nothing.
  const cardLinkDone = cardEntity ? cardEntity.end < post.length : false;
  const requested = useRef(new Set<string>(Object.keys(PRECACHED_CARDS)));
  useEffect(() => {
    const asked = requested.current;
    if (!cardKey || asked.has(cardKey)) return;
    const ctrl = new AbortController();
    let inFlight = false;
    const timer = setTimeout(async () => {
      inFlight = true;
      asked.add(cardKey);
      setCards((c) => ({ ...c, [cardKey]: "loading" }));
      try {
        const res = await fetch("/api/unfurl", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: cardKey }), signal: ctrl.signal });
        const json = (await res.json()) as { card: CardData | null };
        inFlight = false;
        setCards((c) => ({ ...c, [cardKey]: json.card }));
      } catch {
        if (ctrl.signal.aborted) return;
        inFlight = false;
        setCards((c) => ({ ...c, [cardKey]: null }));
      }
    }, cardLinkDone ? 600 : 1500);
    return () => {
      clearTimeout(timer);
      // A fetch cut off mid-flight (typing after the link changes the wait) is forgotten here, before
      // the next run checks for it, so that run fetches the card again instead of leaving it loading.
      // A finished lookup stays cached for the visit.
      if (inFlight) asked.delete(cardKey);
      ctrl.abort();
    };
  }, [cardKey, cardLinkDone]);

  // Look up the quoted post once its link looks finished, as for the card (a half-typed status
  // number names a different post). Each answer lands under its own status number, so a slow answer
  // for a link that has since changed can't overwrite the current one.
  const quoteLinkDone = quote ? quote.end < post.length : false;
  const quotesAsked = useRef(new Set<string>());
  useEffect(() => {
    const asked = quotesAsked.current;
    if (!quoteId || asked.has(quoteId)) return;
    const ctrl = new AbortController();
    let settled = false;
    const timer = setTimeout(async () => {
      asked.add(quoteId);
      // A retry after a failed lookup shows as loading again.
      setQuotes((q) => ({ ...q, [quoteId]: "loading" }));
      let result: QuoteResult;
      try {
        const res = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: quoteId }), signal: ctrl.signal });
        result = res.ok ? ((await res.json()) as QuoteResult) : { status: "error" };
      } catch {
        // Typing past the link aborted its lookup; the cleanup below has already forgotten it.
        if (ctrl.signal.aborted) return;
        result = { status: "error" };
      }
      settled = true;
      if (result.status === "error") asked.delete(quoteId);
      setQuotes((q) => ({ ...q, [quoteId]: { ...result, at: Date.now() } }));
    }, quoteLinkDone ? 600 : 1500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
      // Forget an unanswered lookup now, not when its abort lands, so coming straight back to the
      // link asks again instead of waiting on a request that was cancelled.
      if (!settled) asked.delete(quoteId);
    };
  }, [quoteId, quoteLinkDone]);

  const advice: Advice[] = useMemo(
    () =>
      buildAdvice({
        text: post,
        entities,
        length,
        card: card === "loading" ? undefined : card,
        lineSets,
        appClamp: phoneClamp ? { maxLines: phoneClamp.maxLines, total: phoneClamp.total, lastWord: phoneClamp.lastWord, deviceLabel: phoneDevice.tipLabel ?? phoneDevice.label, deviceId: phoneDevice.id } : null,
        hasMedia: media.length > 0,
        mediaKinds: media.map((m) => m.kind),
        mediaLayouts: [webDevice, phoneDevice].flatMap((d) => {
          const layout = mediaLayout(media, d);
          return layout ? [{ deviceId: d.id, deviceLabel: d.tipLabel ?? d.label, layout, ios: d.platform === "ios", tall: media.length === 1 && media[0].kind === "photo" && media[0].width / media[0].height < APP_MIN_RATIO }] : [];
        }),
        hasStyles: styles.length > 0,
        typed: draft.text,
      }),
    [post, entities, length, card, lineSets, phoneClamp, media, webDevice, phoneDevice, styles.length, draft.text],
  );

  const readFile = useCallback((file: File | undefined, set: (url: string) => void) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && set(reader.result);
    reader.readAsDataURL(file);
  }, []);


  /** Fill name, avatar and badge from the handle typed in. Each handle is looked up once a session. */
  const profiles = useRef(new Map<string, Identity>());
  const lookupProfile = useCallback(async () => {
    const u = identity.handle.trim();
    if (!u) return;
    const known = profiles.current.get(u.toLowerCase());
    if (known) {
      setIdentity(known);
      setLookupState("idle");
      return;
    }
    setLookupState("loading");
    try {
      const res = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ u }) });
      const json = (await res.json()) as { profile?: Omit<Identity, "badge"> & { badge: Identity["badge"] | null }; error?: string };
      if (!res.ok || !json.profile) throw new Error(json.error || "Lookup failed. Enter the details by hand.");
      // No badge in the answer (the fallback API can't tell): keep the one chosen by the time it
      // arrives, and don't keep the answer, so the next lookup of this handle asks for the badge again.
      // An answer that arrives after the handle was changed belongs to the old one: it's dropped.
      const { badge, ...rest } = json.profile;
      if (badge !== null) profiles.current.set(u.toLowerCase(), { ...rest, badge });
      setIdentity((prev) => (prev.handle.trim().toLowerCase() !== u.toLowerCase() ? prev : { ...rest, badge: badge ?? prev.badge }));
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
      // **bold** / __italic__ markers become style runs; `media` attaches stand-ins of the recorded
      // kinds and sizes (`photo` alone, one 16:9 photo).
      setDraft: (raw: string, opts: { photo?: boolean; media?: Array<{ kind: MediaKind; width: number; height: number; alt?: boolean; durationMs?: number }> } = {}) => {
        const { text, styles } = stripFormatting(raw);
        editor?.commands.setContent(draftToDoc(text, styles));
        const items = opts.media ?? (opts.photo ? [{ kind: "photo" as const, width: 1600, height: 900 }] : []);
        setMedia(items.length ? items.map((m) => ({ src: STAND_IN_PHOTO, alt: false, ...m })) : NO_MEDIA);
      },
      getText: () => (editor ? serializeDoc(editor.getJSON() as DocNode).text : draft.text),
    };
  }, [editor, draft.text]);

  const over = length.weighted > MAX_WEIGHTED_LENGTH;
  const ratio = Math.min(1, length.weighted / MAX_WEIGHTED_LENGTH);
  const ringColor = over ? "#F97316" : length.weighted > 260 ? "#F5A623" : "#00C4A1";

  // Two halves: composer and tips on the left, the preview centred on the right.
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
  // The right half always holds the wider preview at true size, so switching views never moves the
  // composer. Too narrow for the composer beside it: stack them and let the page scroll. (The same
  // width is the page's breakpoint in page.tsx, where the window lock comes off.) A shared link shows
  // the preview alone, so only the preview has to fit.
  const widestPreview = Math.max(phoneDevice.width + PHONE_BEZEL * 2, webDevice.width);
  const narrow = rowWidth !== null && rowWidth < (previewOnly ? 0 : COMPOSER_MIN + COLUMN_GAP) + widestPreview;

  // Tips only appear for the user's own draft, and only when there's something to say. They hang
  // below the composer, so the composer never moves when they come and go.
  const showTips = !previewOnly && draft.text.trim() !== "" && advice.length > 0;

  // Nothing typed yet shares an empty draft: the recipient sees the same sample, still as a
  // placeholder, and "Edit a copy" starts them empty rather than with the sample as real text.
  const typed = draft.text.trim() !== "";
  const sharePreview = useCallback(
    // A link made on someone's own phone names the listed phone nearest to it.
    (): SharedPreview => ({ text: typed ? post : "", styles: typed ? styles : [], identity, media, theme: themeId, phone: phoneDevice.frameless ? nearestListedPhone(phoneDevice).id : phoneDevice.id, web: webDevice.id, view }),
    [typed, post, styles, identity, media, themeId, phoneDevice, webDevice.id, view],
  );
  const actions = shared ? (
    <button type="button" onClick={editCopy} className="h-8 flex-none whitespace-nowrap rounded-lg bg-brand-warm-dark px-3 text-[13px] font-medium text-white hover:bg-brand-warm-dark/90">
      Edit a copy
    </button>
  ) : (
    <ShareButton preview={sharePreview} />
  );
  const hints = showTips && (
    <div className="px-1 pt-5">
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
    // Two halves: composer with its tips on the left, the preview centred on the right. On narrow
    // windows the preview stacks under the composer and the page scrolls.
    <div ref={rowRef} className={`mx-auto flex min-h-0 w-full flex-1 ${narrow ? "flex-col items-center gap-6 pb-6" : "items-stretch gap-6"}`} style={{ maxWidth: ROW_MAX }}>
      <ThemeToggle themeId={themeId} onChange={(t) => { setThemeChosen(true); setThemeId(t); }} />
      <LineProbes tokens={probeTokens} showMore={showMore280} hiddenUrlStart={hiddenUrlStart} quoteShown={quote !== null} devices={probeDevices} onMeasure={setLineSets} styles={styles} />

      {/* Left half: the composer centred vertically, like the preview, with the tips hanging in the
          space below it. The two spacers split the free height evenly, but the tips' block never
          shrinks below its content, so in a short window the composer rises only as far as the tips
          need; past that the half scrolls. On a shared link it stays mounted but hidden, ready for
          "Edit a copy". */}
      <div
        hidden={previewOnly}
        className={narrow ? "mx-auto w-full" : "flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center overflow-y-auto"}
        style={narrow ? { maxWidth: COMPOSER_MAX } : { minWidth: COMPOSER_MIN }}
      >
      {!narrow && <div className="min-h-0 flex-1 basis-0" aria-hidden />}
      <div className="w-full flex-none" style={{ maxWidth: COMPOSER_MAX }}>
      {/* No card around the composer: its fields sit on the page, the editor is the one surface. */}
      <section data-composer="">
        {shareError !== null && (
          <p className="mb-3 rounded-lg border border-brand-orange/40 bg-orange-50 px-3 py-2 text-sm text-brand-warm-dark" role="status">
            That share link is incomplete or damaged, so there was nothing to show. Ask for the link again.
          </p>
        )}
        {/* Identity in one row, in X's order: photo, name, check, then @handle, which doubles as the
            lookup that fills in the rest. */}
        <form
          className="mb-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void lookupProfile();
          }}
        >
          <label className="group relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-brand-warm-border bg-brand-warm-surface" title={identity.avatar ? "Change your photo" : "Upload your photo"}>
            {identity.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={identity.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <DefaultAvatar size="100%" />
            )}
            {/* Hover (or keyboard focus) says the circle takes your own photo, the way X's profile editor does. */}
            <span aria-hidden className="absolute inset-0 flex items-center justify-center rounded-full bg-brand-warm-dark/45 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <CameraIcon size={18} />
            </span>
            <input type="file" accept="image/*" aria-label={identity.avatar ? "Change your photo" : "Upload your photo"} className="sr-only" onChange={(e) => readFile(e.target.files?.[0], (url) => setIdentity((i) => ({ ...i, avatar: url })))} />
          </label>
          <input className={`${inputCls} basis-[140px]`} value={identity.name} maxLength={50} placeholder="Your name" aria-label="Display name" autoComplete="off" data-1p-ignore="" data-lpignore="true" data-bwignore="true" data-form-type="other" onChange={(e) => setIdentity((i) => ({ ...i, name: e.target.value }))} />
          <select value={identity.badge} onChange={(e) => setIdentity((i) => ({ ...i, badge: e.target.value as Badge }))} aria-label="Verified badge" title="Verified check" className="flex-none rounded-lg border border-brand-warm-border bg-white px-2 py-2 text-base sm:text-sm text-brand-warm-dark">
            <option value="none">None</option>
            <option value="blue">Blue</option>
            <option value="gold">Gold</option>
            <option value="gray">Gray</option>
          </select>
          <div className="flex min-w-0 flex-[1.3] basis-[190px] items-center rounded-lg border border-brand-warm-border bg-white pl-3 focus-within:border-brand-teal">
            <span className="text-sm text-brand-warm-secondary">@</span>
            <input
              className="min-w-0 flex-1 bg-transparent py-2 text-base sm:text-sm text-brand-warm-dark outline-hidden placeholder:text-brand-warm-muted focus:placeholder:text-transparent"
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
          {lookupState !== "idle" && lookupState !== "loading" && <p className="w-full text-sm text-brand-orange">{lookupState}</p>}
        </form>

        <ComposerField editor={editor} placeholder={SAMPLE} />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-brand-warm-gray">
          <span className="flex items-center gap-3">
            <FormatBar editor={editor} />
            <MediaPicker media={media} onChange={setMedia} />
          </span>
          <span className="flex items-center gap-2 tabular-nums" title="Weighted length, the way X counts it">
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
              <circle cx="14" cy="14" r="11" fill="none" stroke="#E4E1DA" strokeWidth="3" />
              <circle cx="14" cy="14" r="11" fill="none" stroke={ringColor} strokeWidth="3" strokeDasharray={`${ratio * 69.1} 69.1`} strokeLinecap="round" transform="rotate(-90 14 14)" />
            </svg>
            <span className={over ? "font-semibold text-brand-orange" : ""}>{over ? `${MAX_WEIGHTED_LENGTH - length.weighted}` : `${length.weighted} / ${MAX_WEIGHTED_LENGTH}`}</span>
          </span>
        </div>

      </section>
      </div>
      <div className={narrow ? "w-full" : "w-full flex-1 basis-0"} style={{ maxWidth: COMPOSER_MAX }}>
        {hints}
      </div>
      </div>

      <Preview
        stacked={narrow}
        minWidth={widestPreview}
        marks={showTips ? advice : NO_MARKS}
        report={previewOnly ? "never" : typed ? "shown" : "reserved"}
        view={view}
        setView={setView}
        actions={actions}
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
        setPhoneDevice={choosePhone}
        here={here}
        themeId={themeId}
        web={
          <div style={{ backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}`, borderBottom: webDevice.kind === "focal" ? `1px solid ${theme.border}` : undefined, width: webDevice.width }}>
            <XPost device={webDevice} theme={theme} identity={identity} tokens={webRender.tokens} showMore={webRender.showMore} onShowMore={() => expand(webDevice)} toggle={toggleFor(webDevice, webRender.showMore)} hiddenUrlStart={hiddenUrlStart} card={card} quote={quoteProp} media={media} styles={styles} />
          </div>
        }
        app={(maxHeight) => {
          const cell = <XPost device={phoneDevice} theme={theme} identity={identity} tokens={phoneRender.tokens} showMore={phoneRender.showMore} onShowMore={() => expand(phoneDevice)} toggle={toggleFor(phoneDevice, phoneRender.showMore)} hiddenUrlStart={hiddenUrlStart} card={card} quote={quoteProp} media={media} styles={rowHidesStyles(phoneDevice, Boolean(expanded[phoneDevice.id])) ? [] : styles} />;
          // This phone: the timeline cell edge to edge, as the visitor's X app draws it.
          return phoneDevice.frameless ? (
            <div style={{ width: phoneDevice.width, backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}>{cell}</div>
          ) : (
            <PhoneFrame device={phoneDevice} theme={theme} maxHeight={maxHeight}>{cell}</PhoneFrame>
          );
        }}
      />

    </div>
  );
}

/** The phone shrinks to fit a short window, down to this scale; below it the phone sheds app furniture instead. */
const MIN_PHONE_SCALE = 0.7;
/** The "Looks different on X?" line under the preview: its gap above and its height, both kept out of the phone's room. */
const FOOT_GAP = 8;
const FOOT_LINE = 16;
/** The composer fills its half up to COMPOSER_MAX; below COMPOSER_MIN beside the preview, the page stacks. */
const COMPOSER_MIN = 560;
const COMPOSER_MAX = 640;
const COLUMN_GAP = 24;
/** The two halves stop growing here, so on a wide window the composer and the preview stay close. */
const ROW_MAX = 1440;

interface PreviewProps {
  /** Stacked under the composer on a scrolling page: full phone height, no centring. */
  stacked: boolean;
  /** The right half never gets narrower than the wider preview at true size. */
  minWidth: number;
  /** Tips whose marks are drawn beside the preview, on the line they're about. */
  marks: Advice[];
  fontBanner: React.ReactNode;
  /** Which body font loaded. PNG export is off on the GT America tier: Grilli Type's web licence forbids saving the font into images. */
  fontTier: FontTier | null;
  webDevice: Device;
  setWebDevice: (d: Device) => void;
  phoneDevice: Device;
  setPhoneDevice: (d: Device) => void;
  /** The visitor's own phone, when they are on one: offered first in the list. */
  here: Device | null;
  themeId: ThemeId;
  web: React.ReactNode;
  /** The phone, given the height it may take (it sheds app furniture to fit, never the post). */
  app: (maxHeight: number | undefined) => React.ReactNode;
  view: "app" | "web";
  setView: (v: "app" | "web") => void;
  /** Extra toolbar buttons (Share, or Edit a copy on a shared link). */
  actions: React.ReactNode;
  /**
   * The "Looks different on X?" line under the preview: shown for the user's own draft once they've
   * typed, its space reserved before that, and no line at all on a shared link.
   */
  report: "never" | "reserved" | "shown";
}

/**
 * One preview at a time behind a Mobile / Web switch. Mobile is the default: it's how most people
 * read X. The web view is always true size. The phone is laid out at true size and, in a short
 * window, drawn smaller as a whole (a transform, so line breaks can't move) to keep its real shape.
 */
function Preview({ stacked, minWidth, marks, fontBanner, fontTier, webDevice, setWebDevice, phoneDevice, setPhoneDevice, here, themeId, web, app, view, setView, actions, report }: PreviewProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // The height under the notices; the preview gets it less the "Looks different on X?" line's.
  const [space, setSpace] = useState<number | null>(null);
  const room = space === null ? null : space - (report === "never" ? 0 : FOOT_GAP + FOOT_LINE);
  const [areaWidth, setAreaWidth] = useState<number | null>(null);
  // The stage's layout height (unscaled). Whichever preview is showing is centred vertically;
  // switching views slides it into place.
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const controlsSlot = useSlot("preview-controls");

  // Measured before paint, and again in the commit that portals the header's controls in: the
  // slots fill only after hydration, and the header grows with them. The observer alone reports
  // that a frame late, and not at all while the tab stays hidden (a link opened in a background
  // tab), which kept the room from before the header grew and drew the phone past the bottom.
  useLayoutEffect(() => {
    const area = areaRef.current;
    const notice = noticeRef.current;
    if (!area || !notice) return;
    const measure = () => {
      setSpace(area.getBoundingClientRect().height - notice.getBoundingClientRect().height);
      setAreaWidth(area.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    ro.observe(notice);
    return () => ro.disconnect();
  }, [controlsSlot]);

  // The phone's natural height with its bezel; it shrinks until it fits, then sheds furniture.
  const phoneHeight = (phoneDevice.height ?? 0) + PHONE_BEZEL * 2;
  const frameless = view === "app" && Boolean(phoneDevice.frameless);
  const width = view === "app" ? phoneDevice.width + (frameless ? 0 : PHONE_BEZEL * 2) : webDevice.width;
  // Beside the composer the phone shrinks to the window's height. Stacked, anything wider than the
  // column (the web view or a listed phone, on a phone) shrinks to its width; this phone never needs to.
  const scale = stacked
    ? frameless || areaWidth === null ? 1 : Math.min(1, areaWidth / width)
    : view === "app" && room !== null && room > 0 ? Math.min(1, Math.max(MIN_PHONE_SCALE, room / phoneHeight)) : 1;
  // Tip marks go just inside the preview's left edge when there's no margin beside it.
  const marksInside = stacked && (frameless || areaWidth === null || areaWidth < width * scale + 2 * (MARK_OFFSET + 3 * MARK_STEP));

  // Measured before paint, so the first frame after a view switch never uses the other view's height.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageHeight(stage.offsetHeight);
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
  }, [view, scale]);

  const device = view === "app" ? phoneDevice : webDevice;
  const drawnHeight = stageHeight === null ? null : stageHeight * scale;

  const exportAllowed = fontTier !== "gt";
  const exportPng = useCallback(async () => {
    const node = stageRef.current;
    if (!node || exporting || !exportAllowed) return;
    setExporting(true);
    setExportError(null);
    const restore: Array<() => void> = [];
    try {
      await document.fonts.ready;
      const { toPng } = await import("html-to-image");
      // html-to-image clones the DOM, and a clone has no scroll position: a phone scrolled down an
      // expanded post would export its top. Shift the post up by the scroll instead while it draws, so
      // the image is what the screen shows; the screen itself looks the same throughout. Read just
      // before drawing, after the awaits, so a scroll made meanwhile is the one exported.
      restore.push(...[...node.querySelectorAll<HTMLElement>("[data-screen-scroll]")].flatMap((el) => {
        const top = el.scrollTop;
        const cell = el.firstElementChild as HTMLElement | null;
        if (!top || !cell) return [];
        const margin = cell.style.marginTop;
        cell.style.marginTop = `${-top}px`;
        el.scrollTop = 0;
        return [() => { cell.style.marginTop = margin; el.scrollTop = top; }];
      }));
      // A media carousel swiped sideways: the same, along x.
      for (const el of node.querySelectorAll<HTMLElement>('[data-media="carousel"]')) {
        const left = el.scrollLeft;
        const first = el.firstElementChild as HTMLElement | null;
        if (!left || !first) continue;
        const margin = first.style.marginLeft;
        first.style.marginLeft = `${-left}px`;
        el.scrollLeft = 0;
        restore.push(() => { first.style.marginLeft = margin; el.scrollLeft = left; });
      }
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000));
      const dataUrl = await Promise.race([toPng(node, { pixelRatio: device.pixelRatio, cacheBust: false }), timeout]);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `postcheck-${device.id}-${themeId}.png`;
      a.click();
    } catch {
      setExportError("Export didn't finish. Try again, or screenshot the preview.");
    } finally {
      restore.forEach((undo) => undo());
      setExporting(false);
    }
  }, [device, themeId, exporting, exportAllowed]);

  // One width for both device lists, so the buttons after it never move when you switch views. A
  // select sizes to its widest option; the widest label, "iPhone 15–16 Plus / 14–15 Pro Max", needs about 235px.
  // 16px below the sm breakpoint: iOS Safari zooms the page into any control under 16px when it's tapped.
  const select = "h-8 w-[244px] min-w-0 shrink rounded-lg border border-brand-warm-border bg-white px-2 text-base text-brand-warm-dark sm:text-[13px]";
  const segment = (on: boolean) => `px-3 text-[13px] font-medium transition ${on ? "bg-brand-warm-dark text-white" : "text-brand-warm-gray hover:text-brand-warm-dark"}`;

  const toolbar = (
    <div className={`flex max-w-full items-center gap-2 ${stacked ? "mb-3 w-full flex-none flex-wrap justify-center" : ""}`} style={stacked ? { maxWidth: Math.max(width * scale, 0) || undefined } : undefined}>
      <div className="flex h-8 flex-none overflow-hidden rounded-lg border border-brand-warm-border bg-white" role="tablist" aria-label="Preview">
        <button type="button" role="tab" aria-selected={view === "app"} onClick={() => setView("app")} className={segment(view === "app")}>Mobile</button>
        <button type="button" role="tab" aria-selected={view === "web"} onClick={() => setView("web")} className={segment(view === "web")}>Web</button>
      </div>
      {view === "app" ? (
        <select value={phoneDevice.id} onChange={(e) => setPhoneDevice([...(here ? [here] : []), ...PHONE_DEVICES].find((d) => d.id === e.target.value) ?? PHONE_DEVICES[0])} aria-label="App device" className={select}>
          {here && (
            <optgroup label="Your screen">
              <option value={here.id}>{here.label}</option>
            </optgroup>
          )}
          {PHONE_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </optgroup>
          ))}
        </select>
      ) : (
        <select value={webDevice.id} onChange={(e) => setWebDevice(WEB_DEVICES.find((d) => d.id === e.target.value) ?? WEB_DEVICES[0])} aria-label="Web device" className={select}>
          {WEB_DEVICES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      )}
      <span className="flex items-center gap-2">
        {actions}
        {exportAllowed ? (
          <button type="button" onClick={() => void exportPng()} disabled={exporting} className="h-8 min-w-[96px] flex-none whitespace-nowrap rounded-lg bg-brand-teal px-3 text-[13px] font-medium text-brand-warm-dark shadow-xs transition hover:bg-brand-teal-light disabled:opacity-60">
            {exporting ? "Rendering…" : "Export PNG"}
          </button>
        ) : (
          <span className="min-w-0 max-w-[190px] text-right text-[12px] leading-tight text-brand-warm-secondary" title="Grilli Type's web licence doesn't allow saving GT America into images.">
            Export is off while GT America stands in for Chirp.
          </span>
        )}
      </span>
    </div>
  );

  return (
    // The right half; the preview is centred in it (in the whole row on a shared link).
    <div
      ref={areaRef}
      data-preview=""
      className={`flex min-h-0 max-w-full flex-col items-center justify-start transition-[padding] duration-300 ease-out ${stacked ? "w-full" : "h-full min-w-0 flex-1 basis-0"}`}
      style={{ minWidth: stacked ? undefined : minWidth, paddingTop: !stacked && room !== null && drawnHeight !== null ? Math.max(0, Math.floor((room - drawnHeight) / 2)) : 0 }}
    >
      <div ref={noticeRef} className="max-w-full flex-none">
        {fontBanner}
        {exportError && <p className="mb-3 text-sm text-brand-orange">{exportError}</p>}
      </div>
      {/* Wide windows keep the controls in the page header; stacked, they sit over the preview. */}
      {stacked ? toolbar : controlsSlot && createPortal(toolbar, controlsSlot)}
      {/* The side padding (cancelled by the negative margin) is room for the tip marks left of the preview.
          Beside the composer the phone always fits (it scales, then sheds furniture, and its screen
          scrolls itself), so nothing here scrolls: while it slides in from the web view's position it
          may hang past the bottom for a moment, which must not flash a scrollbar. A tall web post page
          and the stacked layout still scroll. */}
      <div
        className={stacked ? "flex justify-center" : `-mx-12 min-h-0 max-w-[calc(100%+96px)] px-12 ${view === "app" ? "overflow-visible" : "overflow-auto"}`}
        // This phone runs edge to edge, out through the page's side padding.
        style={stacked && frameless ? { width: "100vw", marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)" } : stacked ? { width: "100%" } : undefined}
      >
        {/* The box takes the drawn size; the preview inside keeps its true-size layout (export reads that). */}
        <div ref={boxRef} className="relative flex-none" style={{ width: width * scale, height: drawnHeight ?? undefined }}>
          <TipMarks advice={marks} deviceId={device.id} stageRef={stageRef} boxRef={boxRef} inside={marksInside} />
          <div style={scale < 1 ? { width, transform: `scale(${scale})`, transformOrigin: "top left" } : { width }}>
            <div ref={stageRef} style={{ display: "inline-block", width }}>
              {view === "app" ? app(stacked || room === null ? undefined : room / scale) : web}
            </div>
          </div>
        </div>
      </div>
      {frameless && <p className="mt-2 px-4 text-center text-xs text-brand-warm-secondary">Drawn at this phone&apos;s width, with default text size.</p>}
      {stacked && scale < 1 && <p className="mt-2 px-4 text-center text-xs text-brand-warm-secondary">Scaled down to fit this screen.</p>}
      {/* Its line is kept while empty, so the phone doesn't resize when the first character goes in.
          A shared link has no line, and the phone gets the room back. */}
      {report !== "never" && (
        <p className="flex-none px-4 text-center text-xs text-brand-warm-secondary" style={{ marginTop: FOOT_GAP, height: FOOT_LINE, lineHeight: `${FOOT_LINE}px` }}>
          {report === "shown" && (
            <>
              Looks different on X?{" "}
              <a href={MISMATCH_FORM} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-warm-dark">
                Tell us
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

const NO_MARKS: Advice[] = [];
/** Marks sit this far left of the preview's edge, and this far apart when several share a line. */
const MARK_OFFSET = 14;
const MARK_STEP = 10;

/**
 * A small dot left of the preview on each line a tip is about, in the tip's severity colour. Drawn
 * outside the stage, so PNG export never includes them; positions are read from the rendered post
 * (after scaling and the phone's own scroll), so they follow the text exactly.
 */
function TipMarks({ advice, deviceId, stageRef, boxRef, inside }: { advice: Advice[]; deviceId: string; stageRef: React.RefObject<HTMLDivElement | null>; boxRef: React.RefObject<HTMLDivElement | null>; inside: boolean }) {
  const [dots, setDots] = useState<Array<{ key: string; y: number; col: number; severity: Severity; title: string }>>([]);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const box = boxRef.current;
    if (!stage || !box) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = box.getBoundingClientRect().top;
        const words = [...stage.querySelectorAll<HTMLElement>("[data-w]")];
        const screen = stage.querySelector("[data-screen-scroll]")?.getBoundingClientRect();
        const next: typeof dots = [];
        const perRow = new Map<number, Set<string>>();
        for (const a of advice) {
          for (const m of a.marks ?? []) {
            if (m.devices && !m.devices.includes(deviceId)) continue;
            // A word span ends past its own offset; the first such span holds the character.
            const el = "at" in m ? words.find((w) => Number(w.dataset.e) > m.at) : stage.querySelector(m.el === "more" ? "[data-more]" : "[data-attachment] > *");
            const rect = el?.getClientRects()[0];
            if (!rect) continue;
            const mid = rect.top + rect.height / 2;
            // Off the phone's screen (scrolled away inside it): no mark.
            if (screen && (mid < screen.top || mid > screen.bottom)) continue;
            const y = Math.round(mid - top);
            const row = perRow.get(y) ?? new Set<string>();
            perRow.set(y, row);
            if (row.has(a.id)) continue;
            next.push({ key: `${a.id}:${y}`, y, col: row.size, severity: a.severity, title: a.title });
            row.add(a.id);
          }
        }
        setDots(next);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(box);
    const mo = new MutationObserver(measure);
    mo.observe(stage, { childList: true, subtree: true, characterData: true });
    stage.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    void document.fonts.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      stage.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [advice, deviceId, stageRef, boxRef]);
  return (
    <>
      {/* Inside the preview there's room for one dot per line (the most severe; tips come sorted). */}
      {dots.filter((d) => !inside || d.col === 0).map((d) => (
        <span
          key={d.key}
          title={d.title}
          aria-hidden
          className={`absolute h-1.5 w-1.5 rounded-full ${SEVERITY_STYLE[d.severity].dot}`}
          style={{ top: d.y - 3, left: inside ? 3 : -MARK_OFFSET - 3 - d.col * MARK_STEP }}
        />
      ))}
    </>
  );
}

/**
 * The visitor's phone, or null on anything else. A phone: no hover, a coarse pointer, and a screen
 * under 500 on its short side (a narrowed desktop window stays on the phone list). Its width is the
 * page's width in portrait, the short side of the screen in landscape (the X app's timeline keeps the
 * portrait column). iPhone or Android from the user agent, which still names Android.
 */
function useThisPhone(): Device | null {
  const [device, setDevice] = useState<Device | null>(null);
  // Before paint, so the first hydrated frame already shows this phone; globals.css hides the preview
  // on phone-width touch screens until data-phone-checked is set, so the server-rendered listed phone
  // never shows there either.
  useLayoutEffect(() => {
    const read = () => {
      const short = Math.min(screen.width, screen.height);
      if (!matchMedia("(hover: none) and (pointer: coarse)").matches || short >= 500) {
        setDevice(null);
        return;
      }
      const portrait = innerHeight >= innerWidth;
      const width = Math.round(portrait ? document.documentElement.clientWidth : short);
      const height = Math.round(portrait ? innerHeight : Math.max(screen.width, screen.height));
      const platform = /Android/i.test(navigator.userAgent) ? "android" : "ios";
      // The address bar coming and going changes the height only: keep the same device then.
      setDevice((d) => (d && d.width === width && d.platform === platform ? d : thisPhone(width, height, platform)));
    };
    read();
    document.documentElement.dataset.phoneChecked = "";
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return device;
}

/** A slot in the page header (page.tsx) that the tool renders controls into. */
function useSlot(id: string): HTMLElement | null {
  return useSyncExternalStore(
    () => () => {},
    () => document.getElementById(id),
    () => null,
  );
}

const WEB_DEVICES = DEVICES.filter((d) => d.kind !== "phone");
const PHONE_DEVICES = DEVICES.filter((d) => d.kind === "phone");
const DEFAULT_PHONE = PHONE_DEVICES.find((d) => d.id === DEFAULT_PHONE_ID) ?? PHONE_DEVICES[0];
/** The phone list in groups: iPhone and Android timelines, then the iPhone post screen. */
const PHONE_GROUPS = [
  { label: "iPhone", devices: PHONE_DEVICES.filter((d) => d.platform === "ios" && d.view !== "post") },
  { label: "Android", devices: PHONE_DEVICES.filter((d) => d.platform === "android") },
  { label: "iPhone · post page", devices: PHONE_DEVICES.filter((d) => d.platform === "ios" && d.view === "post") },
];

/** Light / dark switch for the previews, rendered into the page header's slot. */
function ThemeToggle({ themeId, onChange }: { themeId: ThemeId; onChange: (t: ThemeId) => void }) {
  const slot = useSlot("theme-slot");
  const dark = themeId === "dark";
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Preview in dark mode"
      title={dark ? "Previews in X's dark mode. Click for light." : "Previews in X's light mode. Click for dark."}
      onClick={() => onChange(dark ? "light" : "dark")}
      className="flex items-center gap-1 rounded-full border border-brand-warm-border bg-white p-1 text-brand-warm-gray shadow-xs"
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
