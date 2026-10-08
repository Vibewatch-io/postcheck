/**
 * Post states X draws around a post's text (QUIRKS.md, "Post chrome"). An edited post isn't one:
 * the timeline shows only the latest text, no marker, on the web and in the iOS app (test 104).
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
  /** The photo flagged sensitive in the composer. Drawn only while a photo is attached. */
  sensitive: boolean;
  /** Display name of the person tagged in the photo ("" for none). Drawn only with a photo. */
  tagged: string;
}

export const NO_POST_STATE: PostState = { pinned: false, paid: false, replies: "everyone", sensitive: false, tagged: "" };

/** X's display-name limit; a tag shows the tagged account's display name. */
export const TAG_MAX = 50;

/** Whether anything differs from a plain post (the composer marks its options button when so). */
export function hasPostState(s: PostState): boolean {
  return s.pinned || s.paid || s.replies !== "everyone" || s.sensitive || s.tagged.trim() !== "";
}
