export interface CardData {
  url: string;
  host: string;
  title: string;
  description: string;
  /** Data URL (inlined server-side so PNG export can draw it) or null. */
  image: string | null;
  /** "large" = summary_large_image, "small" = summary. */
  layout: "large" | "small";
}
