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

/**
 * Links X builds no card for although the page carries Open Graph tags: the App Store, both the
 * short `apps.apple.com/app/id…` form (a 301) and the direct `/us/app/x/id…` page (@postcheck_test
 * test 122 on the web and in the app, 122b on the web). The link text stays visible, so the tool
 * never looks one up.
 */
export function cardless(href: string): boolean {
  try {
    return new URL(href).hostname === "apps.apple.com";
  } catch {
    return false;
  }
}
