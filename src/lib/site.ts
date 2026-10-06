/** The site's own address and the title and description its meta tags give X and other unfurlers. */
/** NEXT_PUBLIC_SITE_URL (README: Deploying) for a deployment elsewhere; production otherwise. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://postcheck.vibewatch.io").replace(/\/+$/, "");
export const SITE_HOST = new URL(SITE_URL).hostname;
export const TITLE = "Postcheck";
/** The header line; also the browser and search title after the name. */
export const TAGLINE = "See your post exactly as X will show it.";
export const X_HANDLE = "@vibewatch_io";
export const DESCRIPTION = "1:1 previews of your X post on the web and on phones, rendered in your browser, with tips grounded in how X renders and ranks posts.";
