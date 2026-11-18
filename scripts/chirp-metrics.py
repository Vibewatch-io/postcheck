#!/usr/bin/env python3
"""Regenerate src/lib/layout/chirp-metrics.json from X's Chirp web fonts.

The layout engine (src/lib/layout) measures text the way Chrome does with these fonts: each code
point's advance, plus the GPOS `kern` pair adjustments HarfBuzz applies between neighbours, plus the
few default-on GSUB substitutions that change a width (`ccmp` decompositions, the `calt` bird
ligature). This script reads the same files the page loads (their URLs come from
src/app/globals.css, the first `src` of each TwitterChirpWeb / TwitterChirp face at 400 and 700) and
writes only those numbers: no outlines, nothing that draws. Run it when X ships a new Chirp (verify's
font line moves), then `npm test`:

    python3 scripts/chirp-metrics.py            # needs fontTools with brotli (pip install fonttools brotli)

The numbers are X's (NOTICE). The fonts themselves are never written to disk.
"""
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
CSS = ROOT / "src/app/globals.css"
OUT = ROOT / "src/lib/layout/chirp-metrics.json"
# The face every preview lays text out in: x.com's build (devices.ts `font: "web"`). The fonts/v2 build
# (TwitterChirp) has no character it lacks, so the fallback never reaches it, and is left out.
FACES = {"web": "TwitterChirpWeb"}
WEIGHTS = (400, 700)


def font_urls():
    css = CSS.read_text()
    urls = {}
    for m in re.finditer(r'@font-face\s*\{([^}]*)\}', css):
        body = m.group(1)
        family = re.search(r'font-family:\s*"([^"]+)"', body)
        weight = re.search(r"font-weight:\s*(\d+)", body)
        src = re.search(r'src:\s*url\("([^"]+)"\)', body)
        if not (family and weight and src):
            continue
        for key, name in FACES.items():
            if family.group(1) == name and int(weight.group(1)) in WEIGHTS:
                urls[f"{key}-{weight.group(1)}"] = src.group(1)
    missing = [f"{k}-{w}" for k in FACES for w in WEIGHTS if f"{k}-{w}" not in urls]
    if missing:
        sys.exit(f"no @font-face src in globals.css for {', '.join(missing)}")
    return urls


def load(url):
    if not url.startswith("https://abs.twimg.com/"):
        sys.exit(f"refusing to read a font from {url}: only X's CDN")
    req = urllib.request.Request(url, headers={"User-Agent": "postcheck-chirp-metrics"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return TTFont(io.BytesIO(r.read()))


def feature_indices(table):
    """The features Chrome applies to the page's text: the page is `lang="en"`, so the default and English
    language systems of the Latin and default scripts. Other languages' rules (Dutch IJ, Turkish i) don't apply."""
    out = set()
    for rec in table.ScriptList.ScriptRecord:
        if rec.ScriptTag not in ("DFLT", "latn"):
            continue
        systems = [rec.Script.DefaultLangSys] + [ls.LangSys for ls in rec.Script.LangSysRecord if ls.LangSysTag == "ENG "]
        for sys_ in systems:
            if sys_ is None:
                continue
            out.update(sys_.FeatureIndex)
            if sys_.ReqFeatureIndex != 0xFFFF:
                out.add(sys_.ReqFeatureIndex)
    return out


def lookup_indices(table, tag):
    """The lookups a feature runs for the page's language, in lookup-list order (HarfBuzz's order)."""
    idx = set()
    for i in feature_indices(table):
        fr = table.FeatureList.FeatureRecord[i]
        if fr.FeatureTag == tag:
            idx.update(fr.Feature.LookupListIndex)
    return sorted(idx)


def lookups(table, tag):
    return [table.LookupList.Lookup[i] for i in lookup_indices(table, tag)]


def subtables(lookup, ext_type):
    for st in lookup.SubTable:
        if lookup.LookupType == ext_type:
            yield st.ExtSubTable.LookupType, st.ExtSubTable
        else:
            yield lookup.LookupType, st


def x_advance(value):
    return (getattr(value, "XAdvance", 0) or 0) if value is not None else 0


def kern_pairs(font, glyphs):
    """Effective kern XAdvance for every ordered pair of mapped glyphs, summed over the kern lookups.

    Within a lookup the first subtable that applies wins: a format 1 subtable applies only when the
    pair is listed, a format 2 subtable whenever the first glyph is in its coverage (OpenType spec;
    HarfBuzz's PairPos). A pair adjustment that moves the second glyph's advance is refused, since
    every value here is the first glyph's.
    """
    gpos = font["GPOS"].table
    total = {}
    for lk in lookups(gpos, "kern"):
        tables = [st for t, st in subtables(lk, 9) if t == 2]
        if not tables:
            continue
        compiled = []
        for st in tables:
            cov = {g: i for i, g in enumerate(st.Coverage.glyphs)}
            if st.Format == 1:
                sets = [{p.SecondGlyph: p for p in ps.PairValueRecord} for ps in st.PairSet]
                compiled.append((1, cov, sets, None, None))
            else:
                compiled.append((2, cov, st.Class1Record, st.ClassDef1.classDefs, st.ClassDef2.classDefs))
        for a in glyphs:
            for b in glyphs:
                for fmt, cov, data, cd1, cd2 in compiled:
                    if a not in cov:
                        continue
                    if fmt == 1:
                        rec = data[cov[a]].get(b)
                        if rec is None:
                            continue
                        if x_advance(getattr(rec, "Value2", None)):
                            sys.exit(f"pair {a} {b} moves the second glyph's advance; the engine can't model it")
                        v = x_advance(rec.Value1)
                    else:
                        r = data[cd1.get(a, 0)].Class2Record[cd2.get(b, 0)]
                        if x_advance(getattr(r, "Value2", None)):
                            sys.exit(f"pair {a} {b} moves the second glyph's advance; the engine can't model it")
                        v = x_advance(r.Value1)
                    if v:
                        total[(a, b)] = total.get((a, b), 0) + v
                    break
    return total


def rule_records(st):
    """Every SubstLookupRecord in a contextual subtable (formats 1, 2 and 3, chained or not)."""
    out = []

    def walk(o, depth=0):
        if o is None or depth > 3:
            return
        out.extend(getattr(o, "SubstLookupRecord", None) or [])
        for name in ("SubRuleSet", "SubRule", "SubClassSet", "SubClassRule", "ChainSubRuleSet", "ChainSubRule", "ChainSubClassSet", "ChainSubClassRule"):
            for x in getattr(o, name, None) or []:
                walk(x, depth + 1)

    walk(st)
    return out


def gsub_widths(font, cmap, rev):
    """Default-on GSUB that changes widths, for the features Chrome applies to text (ccmp, locl, rlig, calt,
    clig, liga; the last three only without letter-spacing, which the engine's ligatures follow).

    - A decomposition of a typed character (multiple substitution) is recorded as the characters it
      becomes, or, when one of them is a glyph no character maps to (Ŀ → L + a dot), as its summed advance.
    - A ligature of typed characters (the bird) is recorded; one built from unmapped glyphs can't come
      from typed text.
    - A single substitution, direct or called from a contextual rule, must keep the advance.
    - A contextual decomposition or ligature, or any other lookup type, stops the script: the engine
      has no context to apply it with.
    """
    gsub = font["GSUB"].table
    hmtx = font["hmtx"].metrics
    decompose, advance, ligatures = {}, {}, []
    seen = set()

    def check(index, tag, contextual):
        if (index, contextual) in seen:
            return
        seen.add((index, contextual))
        for t, st in subtables(gsub.LookupList.Lookup[index], 7):
            if t == 1:
                for a, b in st.mapping.items():
                    if a in rev and hmtx[a][0] != hmtx[b][0]:
                        sys.exit(f"{tag} swaps {a} for {b} at a different width; the engine can't model it")
            elif t in (2, 4) and contextual:
                sys.exit(f"{tag} has a contextual {'decomposition' if t == 2 else 'ligature'} (lookup {index}); the engine can't model it")
            elif t == 2:
                for a, seq in st.mapping.items():
                    if a not in rev:
                        continue
                    if all(g in rev for g in seq):
                        decompose[rev[a]] = [rev[g] for g in seq]
                    else:
                        advance[rev[a]] = sum(hmtx[g][0] for g in seq)
            elif t == 4:
                for first, ligs in st.ligatures.items():
                    for lig in ligs:
                        parts = [first] + list(lig.Component)
                        if all(g in rev for g in parts):
                            ligatures.append({"text": "".join(chr(rev[g]) for g in parts), "adv": hmtx[lig.LigGlyph][0]})
            elif t in (5, 6):
                for rec in rule_records(st):
                    check(rec.LookupListIndex, tag, True)
            else:
                sys.exit(f"{tag} uses GSUB lookup type {t} (lookup {index}); the engine can't model it")

    for tag in ("ccmp", "locl", "rlig", "calt", "clig", "liga"):
        for i in lookup_indices(gsub, tag):
            check(i, tag, False)
    return decompose, advance, ligatures


def metrics(font):
    cmap = font.getBestCmap()
    hmtx = font["hmtx"].metrics
    rev = {}
    for cp, g in sorted(cmap.items()):
        rev.setdefault(g, cp)
    gdef = font["GDEF"].table.GlyphClassDef.classDefs if "GDEF" in font else {}
    # HarfBuzz zeroes the advance of a GDEF mark (class 3) in Latin text.
    adv = {cp: (0 if gdef.get(g) == 3 else hmtx[g][0]) for cp, g in cmap.items()}
    glyphs = sorted(set(cmap.values()))
    by_glyph = {}
    for cp, g in cmap.items():
        by_glyph.setdefault(g, []).append(cp)
    pairs = {}
    for (a, b), v in kern_pairs(font, glyphs).items():
        for ca in by_glyph.get(a, []):
            for cb in by_glyph.get(b, []):
                pairs[(ca, cb)] = v
    decompose, advance, ligatures = gsub_widths(font, cmap, rev)
    return {
        "upm": font["head"].unitsPerEm,
        "chars": "".join(chr(cp) for cp in sorted(adv)),
        "adv": [adv[cp] for cp in sorted(adv)],
        "kern": kern_classes(pairs),
        "decompose": {chr(cp): "".join(chr(c) for c in seq) for cp, seq in sorted(decompose.items())},
        "advance": {chr(cp): a for cp, a in sorted(advance.items())},
        "ligatures": ligatures,
    }


def kern_classes(pairs):
    """The pair table folded back into classes: characters whose kerning rows (as a left neighbour) or
    columns (as a right neighbour) are identical share a class; `values[i]` lists [right class, value]
    for left class i. Lossless: the engine looks a pair up as values[left[a]][right[b]]."""
    rows = {}
    for (a, b), v in pairs.items():
        rows.setdefault(a, {})[b] = v
    left_of, left_sig = {}, {}
    for a, row in sorted(rows.items()):
        sig = tuple(sorted(row.items()))
        left_of[a] = left_sig.setdefault(sig, len(left_sig))
    cols = {}
    for (a, b), v in pairs.items():
        cols.setdefault(b, []).append((left_of[a], v))
    right_of, right_sig = {}, {}
    for b, col in sorted(cols.items()):
        sig = tuple(sorted(set(col)))
        right_of[b] = right_sig.setdefault(sig, len(right_sig))
    values = [dict() for _ in left_sig]
    for (a, b), v in pairs.items():
        values[left_of[a]][right_of[b]] = v
    groups = lambda of, n: ["".join(chr(c) for c in sorted(c for c, k in of.items() if k == i)) for i in range(n)]
    return {
        "left": groups(left_of, len(left_sig)),
        "right": groups(right_of, len(right_sig)),
        "values": [[[k, v] for k, v in sorted(row.items())] for row in values],
    }


def main():
    urls = font_urls()
    out = {"_note": "Advance widths and kerning measured from X's Chirp (NOTICE); regenerate with scripts/chirp-metrics.py.", "sources": urls, "fonts": {}}
    for key, url in urls.items():
        print(f"{key}: {url}", file=sys.stderr)
        out["fonts"][key] = metrics(load(url))
        f = out["fonts"][key]
        k = f["kern"]
        print(f"  {len(f['adv'])} code points; kerning: {len(k['left'])} left x {len(k['right'])} right classes, {sum(len(r) for r in k['values'])} values", file=sys.stderr)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
