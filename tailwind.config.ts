import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        syne: ["var(--font-syne)", "sans-serif"],
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          teal: "#00C4A1",
          "teal-dark": "#00735A",
          "teal-light": "#00DFC8",
          violet: "#7B5EA7",
          orange: "#F97316",
          ivory: "#F9F8F5",
          "warm-dark": "#141412",
          "warm-gray": "#6A6861",
          "warm-secondary": "#8A867E",
          "warm-muted": "#B8B4AE",
          "warm-border": "#E4E1DA",
          "warm-border-hover": "#D4D0C8",
          "warm-surface": "#F2F0EB",
        },
      },
    },
  },
  plugins: [],
};
export default config;
