#!/usr/bin/env node
// Re-capture how x.com renders every corpus post in the timeline, from a saved
// login. First run: `node scripts/capture-web.mjs --login` opens a headed
// browser; sign in to X, then close it. After that it runs headless.
// Writes fixtures/web/<handle>.json. Never posts, likes or follows.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const login = process.argv.includes("--login");
const corpus = JSON.parse(readFileSync("fixtures/corpus.json", "utf8"));
mkdirSync(".auth", { recursive: true });
const ctx = await chromium.launchPersistentContext(".auth/x-profile", { headless: !login, viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();

if (login) {
  await page.goto("https://x.com/login");
  console.log("Sign in to X in the window, then close it.");
  await page.waitForEvent("close", { timeout: 0 }).catch(() => {});
  await ctx.close();
  process.exit(0);
}

const EXTRACT = `(() => {
  const out = [];
  for (const art of document.querySelectorAll('article[data-testid=tweet]')) {
    const link = [...art.querySelectorAll('a[href*="/status/"]')].find((a) => a.querySelector('time'));
    const id = link?.href.match(/status\\/(\\d+)/)?.[1]; if (!id) continue;
    const tt = art.querySelector('[data-testid=tweetText]'); const rows = {}; let lh = 20;
    if (tt) { const top = tt.getBoundingClientRect().top; const walker = document.createTreeWalker(tt, NodeFilter.SHOW_TEXT); let n, first = true;
      while ((n = walker.nextNode())) { if (n.parentElement.closest('[aria-hidden="true"]') && !n.parentElement.getBoundingClientRect().width) continue; /* X hides a link's scheme and cut path in zero-width spans; the visible … after a cut path is aria-hidden too, so test the width */ const s = n.nodeValue; const re = /\\S+/g; let m;
        while ((m = re.exec(s))) { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const rects = r.getClientRects(); if (!rects.length) continue;
          if (first) { lh = Math.max(rects[0].height, 16); first = false; }
          if (rects.length === 1) { const k = Math.round((rects[0].top - top) / lh); (rows[k] = rows[k] || []).push(m[0]); continue; }
          // A token that wraps (after a hyphen, or CJK with no spaces): place it character by character.
          let curK = null; for (let c = m.index; c < m.index + m[0].length; c++) { const cr = document.createRange(); cr.setStart(n, c); cr.setEnd(n, c + 1); const cc = cr.getClientRects(); if (!cc.length) continue;
            const k = Math.round((cc[0].top - top) / lh); rows[k] = rows[k] || []; if (k === curK) rows[k][rows[k].length - 1] += s[c]; else { rows[k].push(s[c]); curK = k; } } } }
      for (const img of tt.querySelectorAll('img[alt]')) { const k = Math.round((img.getBoundingClientRect().top - top) / lh); (rows[k] = rows[k] || []).push(img.alt); } }
    const more = art.querySelector('[data-testid=tweet-text-show-more-link]'); const card = art.querySelector('[data-testid="card.wrapper"]');
    /* Media boxes relative to the first one: [x, y, w, h, badge]. Several items sit in a ScrollSnap row that scrolls sideways (no 2x2 grid since 2026-09); a video's countdown is recorded as 'time'. */
    const ph = [...art.querySelectorAll('[data-testid=tweetPhoto]')].filter((e) => !e.closest('div[role=link]')); const o = ph[0]?.getBoundingClientRect();
    const media = ph.length ? { carousel: !!art.querySelector('[data-testid=ScrollSnap-List] [data-testid=tweetPhoto]'), items: ph.map((e) => { const r = e.getBoundingClientRect(); const b = e.innerText.trim(); return [Math.round(r.left - o.left), Math.round(r.top - o.top), Math.round(r.width), Math.round(r.height), /^\\d+:\\d\\d$/.test(b) ? 'time' : b]; }),
      alt: [...art.querySelectorAll('span')].filter((s) => !s.children.length && s.textContent.trim() === 'ALT' && !s.closest('div[role=link]')).length } : null;
    const pollText = card && /\\bvotes?\\b/.test(card.innerText) ? card.innerText.split('\\n') : null; const cr = card?.getBoundingClientRect();
    const poll = pollText ? { choices: pollText.filter((_, i) => pollText[i + 1]?.endsWith('%')), images: card.querySelectorAll('img').length, size: [Math.round(cr.width), Math.round(cr.height)] } : null;
    out.push({ id, lines: Object.keys(rows).sort((a, b) => a - b).map((k) => rows[k].join(' ')), rowCount: tt ? Math.round(tt.getBoundingClientRect().height / lh) : 0, showMore: !!more,
      card: card ? (card.querySelector('[data-testid="card.layoutLarge.media"]') ? 'large' : card.querySelector('[data-testid="card.layoutSmall.media"]') ? 'small' : 'other') : null,
      photo: !!art.querySelector('[data-testid=tweetPhoto]'), video: !!art.querySelector('[data-testid=videoPlayer]'), quote: !!art.querySelector('div[role=link] [data-testid=tweetText]') /* a quote embed is a role=link block with its own tweetText; x.com sets no testid on it (2026-09-17) */,
      ...(media ? { media } : {}), ...(poll ? { poll } : {}) });
  }
  return out;
})()`;

const FONT = `(() => { const faces = []; for (const ss of document.styleSheets) { let rules; try { rules = ss.cssRules } catch { continue } for (const r of rules) if (r instanceof CSSFontFaceRule && /Chirp/i.test(r.style.fontFamily) && r.style.fontWeight === '400') faces.push(r.style.src.match(/url\\("([^"]+)"/)?.[1]); }
  const s = document.createElement('span'); s.style.cssText = 'position:absolute;white-space:pre;font-family:TwitterChirp;font-size:15px'; s.textContent = 'Every week, the 10 most active public voices in'; document.body.appendChild(s); const w = s.getBoundingClientRect().width; s.remove();
  return { chirpRegular: faces[0] || null, referenceWidth: Math.round(w * 10) / 10, column: document.querySelector('[data-testid=primaryColumn]')?.getBoundingClientRect().width }; })()`;

for (const [handle, posts] of Object.entries(corpus.accounts)) {
  const want = new Set(posts.map((p) => p.id));
  await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("article[data-testid=tweet]", { timeout: 30000 }).catch(() => {});
  if (await page.$('a[href="/login"]')) { console.error("Not logged in. Run with --login first."); process.exit(2); }
  const seen = new Map();
  for (let i = 0; i < 40 && [...want].some((id) => !seen.has(id)); i++) {
    // X auto-translates non-English posts in the logged-in timeline; read the original.
    await page.evaluate(() => { for (const b of document.querySelectorAll('article[data-testid=tweet] [role=button]')) if (b.textContent.trim() === 'Show original') b.click(); });
    await page.waitForTimeout(600);
    for (const t of await page.evaluate(EXTRACT)) if (want.has(t.id) && t.lines.length && !seen.has(t.id)) seen.set(t.id, t);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(1500);
  }
  const font = await page.evaluate(FONT);
  const missing = [...want].filter((id) => !seen.has(id));
  const out = { source: `x.com/${handle} profile timeline, logged in, ${font.column}px column`, capturedAt: new Date().toISOString().slice(0, 10), font, posts: posts.map((p) => seen.get(p.id)).filter(Boolean) };
  writeFileSync(`fixtures/web/${handle}.json`, JSON.stringify(out, null, 0).replace(/\},\{"id"/g, "},\n{\"id\"") + "\n");
  console.log(`${handle}: ${out.posts.length}/${want.size} captured, Chirp ${font.chirpRegular}, reference ${font.referenceWidth}px${missing.length ? `, missing ${missing.join(" ")}` : ""}`);
}
await ctx.close();
