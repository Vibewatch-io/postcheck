/** The site's own address and the title and description its meta tags give X and other unfurlers. */
/** NEXT_PUBLIC_SITE_URL (README: Deploying) for a deployment elsewhere; production otherwise. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://postcheck.vibewatch.io").replace(/\/+$/, "");
export const SITE_HOST = new URL(SITE_URL).hostname;
export const TITLE = "Postcheck";
/** The header line, printed next to the name inside the page's h1. */
export const TAGLINE = "Preview your post exactly as X will show it.";
/**
 * The browser tab and search result title. It leads with the words people search for (Search
 * Console, autocomplete: "x post preview", "tweet preview", 2026-11); social cards keep the short name.
 */
export const SEARCH_TITLE = "X post preview: see your tweet as X will show it | Postcheck";
export const X_HANDLE = "@vibewatch_io";
export const REPO_URL = "https://github.com/Vibewatch-io/postcheck";
/** The "Looks different on X" issue form (.github/ISSUE_TEMPLATE/render-mismatch.yml). */
export const MISMATCH_FORM = `${REPO_URL}/issues/new?template=render-mismatch.yml`;
export const DESCRIPTION = "Free X (Twitter) post previewer. See your tweet on iPhone, Android and x.com: character count, Show more cuts, link cards. Nothing is stored.";
