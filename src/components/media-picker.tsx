"use client";

import { MAX_MEDIA, type MediaItem } from "@/lib/media";

/** A video's first frame is drawn no larger than this on its long side. */
const POSTER_EDGE = 1280;

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
      return { src, kind: file.type === "image/gif" ? "gif" : "photo", width: img.naturalWidth, height: img.naturalHeight, alt: false };
    }
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      try {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = url;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("unreadable video"));
        });
        // Step just past the start: some files have a blank frame at 0.
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = Math.min(0.1, (video.duration || 0) / 2);
        });
        const { videoWidth: w, videoHeight: h } = video;
        if (!w || !h) return null;
        const k = Math.min(1, POSTER_EDGE / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
        return { src: canvas.toDataURL("image/jpeg", 0.85), kind: "video", width: w, height: h, alt: false, durationMs };
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
 * The composer's media controls: add up to 4 photos, GIFs or videos (X's limit), mark one as having
 * alt text (x.com then shows an ALT badge), remove one.
 */
export function MediaPicker({ media, onChange }: { media: MediaItem[]; onChange: (update: (m: MediaItem[]) => MediaItem[]) => void }) {
  const full = media.length >= MAX_MEDIA;
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const read = (await Promise.all([...files].map(readMediaFile))).filter((m): m is MediaItem => m !== null);
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
                aria-pressed={m.alt}
                aria-label={m.alt ? "Has alt text" : "No alt text"}
                title={m.alt ? "Has alt text: x.com shows an ALT badge. Click to remove it." : "Mark as having alt text"}
                onClick={() => onChange((all) => all.map((x, j) => (j === i ? { ...x, alt: !x.alt } : x)))}
                className={`absolute bottom-0 left-0 rounded-tr px-0.5 text-[9px] font-bold leading-[11px] ${m.alt ? "bg-black/80 text-white" : "bg-white/80 text-brand-warm-secondary"}`}
              >
                ALT
              </button>
              <button
                type="button"
                aria-label="Remove"
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
