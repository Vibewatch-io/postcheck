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

// Light values are X's long-standing palette; dark values were read off the
// live client (text rgb(230,233,234), secondary rgb(113,117,122),
// row border rgb(43,46,49), card border rgb(50,54,57), card bg rgb(22,24,29)).
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
    text: "#E6E9EA",
    secondary: "#71757A",
    border: "#2B2E31",
    cardBorder: "#323639",
    cardBg: "#16181D",
    link: "#1D9BF0",
    icon: "rgba(255,255,255,0.6)",
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
