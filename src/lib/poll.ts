import { MAX_WEIGHTED_LENGTH } from "./entities";

/**
 * A poll on the draft: 2–4 choices, each up to 25 characters (test 92's 25-character choices
 * posted), and how long it runs. An image poll carries a picture per choice (test 57b).
 */
export interface Poll {
  choices: string[];
  /** One per choice: a data URL, or null for a choice without a picture. */
  images: Array<string | null>;
  /** How long it runs, in minutes: X's composer offers 5 minutes to 7 days, 1 day by default. */
  minutes: number;
}

export const POLL_MIN_CHOICES = 2;
export const POLL_MAX_CHOICES = 4;
export const POLL_CHOICE_MAX = 25;
export const POLL_MIN_MINUTES = 5;
export const POLL_MAX_MINUTES = 7 * 24 * 60;
export const POLL_DEFAULT_MINUTES = 24 * 60;

export const emptyPoll = (): Poll => ({ choices: ["", ""], images: [null, null], minutes: POLL_DEFAULT_MINUTES });

export const clampMinutes = (m: number) => Math.min(POLL_MAX_MINUTES, Math.max(POLL_MIN_MINUTES, Math.round(m)));

/** The choices X would post: blanks dropped (assumed: X's Post button stays off until two are filled). */
export function filledChoices(poll: Poll): Array<{ label: string; image: string | null }> {
  return poll.choices.map((label, i) => ({ label: label.trim(), image: poll.images[i] ?? null })).filter((c) => c.label !== "");
}

/**
 * The poll as X shows it, or null when there is none to show. A post over 280 weighted characters
 * loses its poll: the composer accepts it, but X stores the long post with no card (@postcheck_test
 * tests 94 and 94b), so the preview drops it too.
 */
export function shownPoll(poll: Poll | null, weighted: number): Poll | null {
  if (!poll || weighted > MAX_WEIGHTED_LENGTH) return null;
  return filledChoices(poll).length >= POLL_MIN_CHOICES ? poll : null;
}

/** A poll is an image poll when any choice has a picture (X stores it as a `poll_choice_images` card). */
export const isImagePoll = (poll: Poll) => poll.images.some(Boolean);

const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The time left under a poll just after posting (its length less a minute), the way each client
 * prints it. x.com gives the largest unit, rounded down ("23 hours left" for a day: test 57 on the
 * web; "6 days left" on a live 7-day poll). The iOS app gives two units for a text poll ("22 hours
 * 10 minutes left", test 57) and a short form for an image poll ("23h left", test 57b). The app's
 * day forms and every singular are inferred.
 */
export function timeLeft(minutes: number, style: "web" | "app" | "app-short"): string {
  const left = Math.max(0, minutes - 1);
  const d = Math.floor(left / 1440);
  const h = Math.floor((left % 1440) / 60);
  const m = left % 60;
  if (style === "web") return `${d ? unit(d, "day") : h ? unit(h, "hour") : unit(m, "minute")} left`;
  if (style === "app-short") return `${d ? `${d}d` : h ? `${h}h` : `${m}m`} left`;
  const parts = d ? [unit(d, "day"), h ? unit(h, "hour") : ""] : h ? [unit(h, "hour"), m ? unit(m, "minute") : ""] : [unit(m, "minute")];
  return `${parts.filter(Boolean).join(" ")} left`;
}
