"use client";

import { MAX_MEDIA, MAX_MEDIA_SIDE, MAX_VIDEO_MS, type MediaItem } from "@/lib/media";

/** A video's first frame is drawn no larger than this on its long side. */
const POSTER_EDGE = 1280;
/** A video the browser can't decode may never answer: give up on it, not on the files picked with it. */
const VIDEO_TIMEOUT_MS = 10_000;

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** A natural size scaled down, shape kept, to no more than MAX_MEDIA_SIDE on its long side. */
function bounded(width: number, height: number): { width: number; height: number } {
  const k = Math.min(1, MAX_MEDIA_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * Reads a picked file into a media item, in the browser: an image as a data URL with its natural
 * size, a video as a still of its first frame plus its size and length. Nothing is uploaded.
 */
export async function readMediaFile(file: File): Promise<MediaItem | null> {
  try {
    if (file.type.startsWith("image/")) {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("unreadable")));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const img = new Image();
      img.src = src;
      await img.decode();
      if (!img.naturalWidth || !img.naturalHeight) return null;
      return { src, kind: file.type === "image/gif" ? "gif" : "photo", ...bounded(img.naturalWidth, img.naturalHeight), alt: false };
    }
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      try {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = url;
        await within(
          new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error("unreadable video"));
          }),
          VIDEO_TIMEOUT_MS,
        );
        // Step just past the start: some files have a blank frame at 0.
        await within(
          new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
            video.currentTime = Math.min(0.1, (video.duration || 0) / 2);
          }),
          VIDEO_TIMEOUT_MS,
        );
        const { videoWidth: w, videoHeight: h } = video;
        if (!w || !h) return null;
        const k = Math.min(1, POSTER_EDGE / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        // A length the browser can't read (a live stream, a broken header) gets no badge rather than "0:00".
        const durationMs = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(MAX_VIDEO_MS, Math.round(video.duration * 1000)) : undefined;
        return { src: canvas.toDataURL("image/jpeg", 0.85), kind: "video", ...bounded(w, h), alt: false, ...(durationMs ? { durationMs } : {}) };
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * The composer's media controls: add up to 4 photos, GIFs or videos (X's limit), remove one. Alt
 * text is marked per photo in Post options (x.com then shows an ALT badge).
 */
export function MediaPicker({ media, onChange }: { media: MediaItem[]; onChange: (update: (m: MediaItem[]) => MediaItem[]) => void }) {
  const full = media.length >= MAX_MEDIA;
  const add = async (files: FileList | null) => {
    // Only as many as there are free slots are read: a big pick never decodes files that can't be added.
    const room = MAX_MEDIA - media.length;
    if (!files?.length || room <= 0) return;
    const read = (await Promise.all([...files].slice(0, room).map(readMediaFile))).filter((m): m is MediaItem => m !== null);
    onChange((m) => [...m, ...read].slice(0, MAX_MEDIA));
  };
  return (
    <>
      <label
        className={`rounded-lg border border-brand-warm-border px-3 py-1.5 text-sm font-medium text-brand-warm-dark ${full ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-brand-warm-surface"}`}
        title={full ? "X takes up to 4 photos, videos or GIFs" : "Add photos, GIFs or videos (up to 4)"}
      >
        Add media
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          disabled={full}
          className="sr-only"
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {media.length > 0 && (
        <ul className="flex items-center gap-1.5" aria-label="Attached media">
          {media.map((m, i) => (
            <li key={i} className="relative h-9 w-9 flex-none overflow-hidden rounded-md border border-brand-warm-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remove media ${i + 1}`}
                title="Remove"
                onClick={() => onChange((all) => all.filter((_, j) => j !== i))}
                className="absolute right-0 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-bl bg-black/70 text-[10px] leading-none text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
