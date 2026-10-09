/**
 * Post states X draws around a post's text (QUIRKS.md, "Post chrome"); a media item's sensitive flag
 * and alt text live on the item (`MediaItem`). An edited post isn't one: the timeline shows only the
 * latest text, no marker, on the web and in the iOS app (test 104).
 */

/** "Who can reply", as X's composer names the choices. */
export const REPLY_LIMITS = ["everyone", "following", "verified", "mentioned"] as const;
export type ReplyLimit = (typeof REPLY_LIMITS)[number];

export interface PostState {
  /** Pinned to the profile: "Pinned" above the name row. */
  pinned: boolean;
  /** The composer's content disclosure: "Paid partnership" under the post. */
  paid: boolean;
  replies: ReplyLimit;
  /** Display names of the people tagged, comma-separated ("" for none). Drawn only with media. */
  tagged: string;
}

export const NO_POST_STATE: PostState = { pinned: false, paid: false, replies: "everyone", tagged: "" };

/** X tags up to 10 people, each shown by a display name of up to 50 characters. */
export const TAG_PEOPLE = 10;
/** X counts a display name in UTF-16 units (an emoji costs 2; test 80). */
const NAME_MAX = 50;

/** A name cut to NAME_MAX units, never through an emoji's surrogate pair. */
function capName(name: string): string {
  let out = "";
  for (const ch of name) {
    if (out.length + ch.length > NAME_MAX) break;
    out += ch;
  }
  return out;
}
export const TAG_MAX = TAG_PEOPLE * 52;

/**
 * The line X puts under tagged media: one name as it is, two as "A and B" (test 110b). Three or
 * more as "A and N others" is assumed, not captured.
 */
export function tagLine(tagged: string): string {
  const names = tagged.split(",").map((n) => capName(n.trim())).filter(Boolean).slice(0, TAG_PEOPLE);
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]} and ${names.length - 1} others`;
}

/** Whether anything differs from a plain post (the composer marks its options button when so). */
export function hasPostState(s: PostState): boolean {
  return s.pinned || s.paid || s.replies !== "everyone" || s.tagged.trim() !== "";
}
