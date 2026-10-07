export type ThemeId = "light" | "dark";

export interface XTheme {
  id: ThemeId;
  label: string;
  bg: string;
  text: string;
  secondary: string;
  border: string;
  cardBorder: string;
  cardBg: string;
  link: string;
  icon: string;
  badge: string;
}

// Both read off the logged-in x.com client on 2026-10-07 (C1/C2: test 20's
// post page, light via prefers-color-scheme). Dark: text rgb(231,233,234),
// secondary and icons rgb(113,118,123), row and card borders rgb(47,51,54).
// Light matched X's long-standing palette exactly. x.com fills no link card in
// either theme; cardBg fills the phone panes' cards and the loading and
// unavailable boxes (values assumed).
export const THEMES: Record<ThemeId, XTheme> = {
  light: {
    id: "light",
    label: "Light",
    bg: "#FFFFFF",
    text: "#0F1419",
    secondary: "#536471",
    border: "#EFF3F4",
    cardBorder: "#CFD9DE",
    cardBg: "#F7F9F9",
    link: "#1D9BF0",
    icon: "#536471",
    badge: "#1D9BF0",
  },
  dark: {
    id: "dark",
    label: "Dark",
    bg: "#000000",
    text: "#E7E9EA",
    secondary: "#71767B",
    border: "#2F3336",
    cardBorder: "#2F3336",
    cardBg: "#16181D",
    link: "#1D9BF0",
    icon: "#71767B",
    badge: "#1D9BF0",
  },
};

const FALLBACKS = '-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** The app's Chirp (fonts/v2 metrics), then the platform fallbacks x.com declares. */
export const X_FONT_STACK = `TwitterChirp, GTAmerica, ${FALLBACKS}`;
/** The web client's newer Chirp build (see globals.css), same fallbacks. */
export const X_WEB_FONT_STACK = `TwitterChirpWeb, TwitterChirp, GTAmerica, ${FALLBACKS}`;
/** Which Chirp a device renders with: x.com's current web build or the app's. */
export const fontStack = (font: "web" | "app") => (font === "web" ? X_WEB_FONT_STACK : X_FONT_STACK);
