#!/usr/bin/env node
// Snapshot a live post's syndication JSON into fixtures/posts/<id>.json.
// Usage: node scripts/fetch-fixture.mjs <post id or URL> [...more]
import { writeFileSync } from "node:fs";

import { readFileSync } from "node:fs";
const args = process.argv.slice(2).length ? process.argv.slice(2) : Object.values(JSON.parse(readFileSync("fixtures/corpus.json", "utf8")).accounts).flat().map((p) => p.id);
for (const arg of args) {
  const id = arg.match(/(\d{5,25})\s*$/)?.[1];
  if (!id) {
    console.error(`skip ${arg}: no id`);
    continue;
  }
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`);
  if (!res.ok) {
    console.error(`skip ${id}: ${res.status}`);
    continue;
  }
  const j = await res.json();
  // The syndication JSON of a long post stops at the 280 cut; FxTwitter carries the whole text (t.co links expanded).
  let full_text;
  if (j.note_tweet) {
    const fx = await fetch(`https://api.fxtwitter.com/status/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    full_text = fx?.tweet?.text;
  }
  // Keep only what the tests read; drop the heavy media metadata.
  const slim = {
    id_str: j.id_str,
    text: j.text,
    display_text_range: j.display_text_range,
    note_tweet: j.note_tweet ? true : false,
    ...(full_text ? { full_text } : {}),
    entities: j.entities,
    card: j.card ? { name: j.card.name, url: j.card.url } : null,
    photos: (j.photos || []).length,
    ...(j.mediaDetails?.length
      ? {
          media: j.mediaDetails.map((m) => ({
            type: m.type,
            width: m.original_info?.width,
            height: m.original_info?.height,
            ...(m.video_info?.duration_millis ? { duration_ms: m.video_info.duration_millis } : {}),
            ...(m.ext_alt_text ? { alt: m.ext_alt_text } : {}),
          })),
        }
      : {}),
    // Polls are cards named poll<N>choice_text_only, or <id>:poll_choice_images when each choice has an image.
    ...(/poll/.test(j.card?.name ?? "")
      ? {
          poll: [1, 2, 3, 4]
            .map((n) => ({ label: j.card.binding_values[`choice${n}_label`]?.string_value, image: !!j.card.binding_values[`choice${n}_image`] }))
            .filter((c) => c.label !== undefined),
        }
      : {}),
    user: { name: j.user?.name, screen_name: j.user?.screen_name },
  };
  writeFileSync(`fixtures/posts/${id}.json`, JSON.stringify(slim, null, 2) + "\n");
  console.log(`saved fixtures/posts/${id}.json`);
}
