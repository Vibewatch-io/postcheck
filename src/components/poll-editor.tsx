"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { CameraIcon } from "./icons";
import { POLL_CHOICE_MAX, POLL_MAX_CHOICES, POLL_MIN_CHOICES, clampMinutes, type Poll } from "@/lib/poll";

const field = "min-w-0 flex-1 rounded-lg border border-brand-warm-border bg-white px-3 py-2 text-base sm:text-sm text-brand-warm-dark outline-hidden placeholder:text-brand-warm-muted focus:border-brand-teal";
const small = "flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-brand-warm-border text-brand-warm-gray hover:bg-brand-warm-surface";
const select = "rounded-lg border border-brand-warm-border bg-white px-2 py-1.5 text-base sm:text-sm text-brand-warm-dark";
/** What X's choice-picture picker accepts (its `accept`, read 2026-10-08). */
const CHOICE_PICTURE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The poll under the editor, as X's composer has it: two to four choices of up to 25 characters, a
 * picture beside each one if it's an image poll (X takes JPEG, PNG, GIF or WebP there, and wants one
 * on every choice), and how long it runs (5 minutes to 7 days).
 */
export function PollEditor({ poll, onChange, readFile }: { poll: Poll; onChange: Dispatch<SetStateAction<Poll | null>>; readFile: (file: File | undefined, set: (url: string) => void) => void }) {
  // A picture lands when its read finishes, so it goes through the latest poll, not this render's.
  // Removing a choice shifts the ones after it, so a read started before a removal is dropped
  // rather than landing on whichever choice now has its old place. Removing the poll unmounts this
  // editor, which drops every read still running, so none lands on a poll added afterwards.
  const removals = useRef(0);
  useEffect(() => {
    const gen = removals;
    return () => {
      gen.current += 1;
    };
  }, []);
  // Each choice's latest pick or clear wins: an older read finishing later is dropped.
  const picks = useRef<Record<number, number>>({});
  const setImage = (i: number, image: string | null) => onChange((p) => p && { ...p, images: p.images.map((x, j) => (j === i ? image : x)) });
  const clearImage = (i: number) => {
    picks.current[i] = (picks.current[i] ?? 0) + 1;
    setImage(i, null);
  };
  const pickImage = (i: number, file: File | undefined) => {
    // X's choice picker takes these four only (an SVG or HEIC would never reach the poll).
    if (!file || !CHOICE_PICTURE_TYPES.includes(file.type)) return;
    const at = removals.current;
    const pick = (picks.current[i] = (picks.current[i] ?? 0) + 1);
    readFile(file, (url) => removals.current === at && picks.current[i] === pick && setImage(i, url));
  };
  const days = Math.floor(poll.minutes / 1440);
  const hours = Math.floor((poll.minutes % 1440) / 60);
  const minutes = poll.minutes % 60;
  const setLength = (d: number, h: number, m: number) => onChange((p) => p && { ...p, minutes: clampMinutes(d === 7 ? 7 * 1440 : d * 1440 + h * 60 + m) });
  const setChoice = (i: number, label: string) => onChange((p) => p && { ...p, choices: p.choices.map((c, j) => (j === i ? label : c)) });
  const remove = (i: number) => {
    removals.current += 1;
    picks.current = {};
    onChange((p) => p && { ...p, choices: p.choices.filter((_, j) => j !== i), images: p.images.filter((_, j) => j !== i) });
  };

  return (
    <fieldset className="mt-3 space-y-2 rounded-xl border border-brand-warm-border bg-white p-3" aria-label="Poll">
      {poll.choices.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <label className={`${small} relative cursor-pointer overflow-hidden`} title={poll.images[i] ? "Change picture" : "Add picture"}>
            {poll.images[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poll.images[i]!} alt="" className="h-full w-full object-cover" />
            ) : (
              <CameraIcon size={16} />
            )}
            <input type="file" accept={CHOICE_PICTURE_TYPES.join(",")} aria-label={`Picture for choice ${i + 1}`} className="sr-only" onChange={(e) => { pickImage(i, e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <input className={field} value={label} maxLength={POLL_CHOICE_MAX} placeholder={`Choice ${i + 1}`} aria-label={`Choice ${i + 1}`} autoComplete="off" onChange={(e) => setChoice(i, e.target.value)} />
          {poll.images[i] && (
            <button type="button" className={small} aria-label={`Remove picture from choice ${i + 1}`} title="Remove picture" onClick={() => clearImage(i)}>
              ×
            </button>
          )}
          {poll.choices.length > POLL_MIN_CHOICES && (
            <button type="button" className={small} aria-label={`Remove choice ${i + 1}`} title="Remove choice" onClick={() => remove(i)}>
              −
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-brand-warm-gray">
        {poll.choices.length < POLL_MAX_CHOICES && (
          <button type="button" className="rounded-lg border border-brand-warm-border px-3 py-1.5 font-medium text-brand-warm-dark hover:bg-brand-warm-surface" onClick={() => onChange((p) => p && { ...p, choices: [...p.choices, ""], images: [...p.images, null] })}>
            Add choice
          </button>
        )}
        <span className="ml-auto">Length</span>
        <select className={select} aria-label="Days" value={days} onChange={(e) => setLength(Number(e.target.value), hours, minutes)}>
          {range(8).map((d) => <option key={d} value={d}>{plural(d, "day")}</option>)}
        </select>
        <select className={select} aria-label="Hours" value={hours} disabled={days === 7} onChange={(e) => setLength(days, Number(e.target.value), minutes)}>
          {range(24).map((h) => <option key={h} value={h}>{plural(h, "hour")}</option>)}
        </select>
        <select className={select} aria-label="Minutes" value={minutes} disabled={days === 7} onChange={(e) => setLength(days, hours, Number(e.target.value))}>
          {range(60).map((m) => <option key={m} value={m}>{plural(m, "minute")}</option>)}
        </select>
        <button type="button" className="text-sm text-brand-warm-secondary hover:underline" onClick={() => onChange(null)}>
          Remove poll
        </button>
      </div>
    </fieldset>
  );
}
