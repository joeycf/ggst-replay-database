/**
 * Generate public/og-default.png — the site-wide OG/Twitter card, and the
 * shell's selector card for this game (the shell byte-copies each game repo's
 * og-default.png, so this file speaks the platform's card language).
 *
 * ── CHECKLIST 5d, AND WHY THIS SCRIPT DRAWS OUTLINES INSTEAD OF TEXT ──────
 * "Anything that generates a branded image must prove the typeface actually
 * drew, because the failure mode is a plausible fallback rather than an
 * error." CotW measured the failure to the byte (ffcotw scripts/og.ts): in the
 * prebuilt sharp, `font-family="Anton"`, `"DejaVu Sans"` and `"__nope__"`
 * render BYTE-IDENTICAL output — the bundled librsvg/pango resolves no named
 * family at all, and no fontconfig setting fixes that from here.
 *
 * So the type is not text. Every string is converted from the committed OFL
 * TTFs to SVG path data with opentype.js and drawn as filled outlines. There
 * is no font resolution at raster time and therefore nothing to fall back to.
 * The 5d assertion is kept and INVERTED to suit: it proves the outlines came
 * from the real face — a KNOWN glyph advance (measured on these exact files
 * 2026-09-08) and a non-trivial contour for every character drawn — so a
 * missing, swapped or corrupt TTF still fails loudly instead of drawing a
 * plausible substitute.
 *
 * THE PROBES ARE THE ONES design/fonts/fonts.conf NAMES, both of them. Every
 * roster punctuation case lives in U+0000–00FF, so a latin-only probe would
 * report green while the latin-ext subset had never loaded; `ō` (U+014D) is
 * the latin-ext witness. ASUKA is probed with ASCII `#` on purpose: the face
 * has no U+266F MUSIC SHARP SIGN (parsed from its cmap, ggst-notes/
 * fankit-licence.md), which is why the display name is "Asuka R#" and the
 * vendor's "Asuka R♯" is carried as an alias — scripts/characters.ts.
 *
 * ── THE CARD LANGUAGE ─────────────────────────────────────────────────────
 *   · a cut-corner badge in the game's PRIMARY (gold #D9A53A), carrying the
 *     platform slash
 *   · the wordmark STRIVE/REPLAY, the slash in the game's SECONDARY — the
 *     sampled logo oxblood #7B1B1E. It sits at 1.8:1 on this ground, which
 *     is why the design system demotes it to fills; a 100px display glyph is
 *     a fill, and it reads as the dark red bar it is meant to be.
 *   · "The competitive GUILTY GEAR -STRIVE- replay database", then the tagline
 *   · a footer stripe that is THE ROSTER: one segment per fighter, in roster
 *     order, each in that fighter's own accent, read from data/characters.json.
 *     Tōkon's card carries 21 segments and SF6's 30 — their roster sizes — so
 *     34 here, decided over the design handoff's 5-per-family strip
 *     (design-handoff.md, block 08): the card tracks the roster instead of
 *     going stale on the next DLC.
 *
 * ── THE NOTICE IS BAKED IN ────────────────────────────────────────────────
 * Fan Kit Article 3.1 (read firsthand 2026-09-07, ggst-notes/fankit-licence.md)
 * requires "© ARC SYSTEM WORKS" in an easily visible location on content that
 * shows the art. The site footer carries it on every page; this card travels
 * standalone — a link preview on a character page arrives with no footer —
 * so the same string is drawn on the card, small and legible, above the
 * stripe. The card shows no character art itself, so this is belt and braces;
 * it costs one line.
 *
 * Run: npm run data:og   (manual — the card changes when the brand or the
 *                         roster does; never in the cron)
 */

import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import opentype from 'opentype.js';

import type { CharacterRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'design', 'fonts');

// Before sharp's native binding initialises fontconfig. A static
// `import sharp` is hoisted above every statement in the module, which is how
// CotW's first version pointed FONTCONFIG_FILE at a config sharp had already
// stopped reading — so sharp is imported dynamically, inside main.
process.env.FONTCONFIG_FILE = join(FONT_DIR, 'fonts.conf');

const W = 1200;
const H = 630;

// design/handoff/tokens.css — the same block app/assets/theme.css transcribes.
const BG = '#0B0D11';
const SURFACE = '#12151B';
const PRIMARY = '#D9A53A';
const PRIMARY_CONTRAST = '#1A1406';
const SECONDARY = '#7B1B1E';
const TEXT = '#ECEDEF';
const TEXT_MUTED = '#A9AFBA';
const TEXT_FAINT = '#808896';

/** Article 3.1's notice, verbatim, half-width space included. The line drawn
 *  on the card is app.config.ts artCredit, which is this string with a noun
 *  in front of it, so the footer and the card say the same thing. */
const NOTICE = '© ARC SYSTEM WORKS';
const CREDIT = `Character art ${NOTICE}`;

/** The two probe strings from design/fonts/fonts.conf. */
const PROBE_LATIN = "JACK-O' ZATO=1 ASUKA R# A.B.A I-NO BEDMAN? 0123456789";
const PROBE_LATIN_EXT = 'ō';

interface Glyph {
  /** SVG path data for ONE glyph, drawn at the origin. */
  path: string;
  /** x offset of this glyph within the string, in px. */
  dx: number;
}

/**
 * Text → ONE PATH PER GLYPH, each drawn at the origin and positioned by the
 * font's own advance and kern pairs.
 *
 * The shape is forced by two defects CotW found by looking at the card, not by
 * any assertion on the data: librsvg truncates a long `d` attribute mid-string
 * (a 43-character line stopped after "character usage · ma"), and opentype.js
 * emits literal `NaN` coordinates from multi-glyph LAYOUT on a static font
 * ("Character" produces NaN while "C", "Ch" and "character" do not). Drawing
 * glyphs individually removes the composition step the second bug lives in
 * and keeps every path short enough for the first. The NaN assertion runs per
 * glyph, because a glyph that still fails must stop the build rather than
 * render as a gap that reads as letter-spacing.
 */
function glyphsOf(font: opentype.Font, text: string, size: number): Glyph[] {
  const scale = size / font.unitsPerEm;
  const out: Glyph[] = [];
  let dx = 0;
  const chars = [...text];
  for (const [i, ch] of chars.entries()) {
    const glyph = font.charToGlyph(ch);
    if (ch !== ' ') {
      const d = glyph.getPath(0, size, size).toPathData(2);
      if (d.includes('NaN') || d.includes('Infinity')) {
        throw new Error(
          `non-finite path geometry for ${JSON.stringify(ch)} at size ${size}: ` +
            `${d.slice(0, 90)}… — librsvg stops parsing a path at the first bad number, so ` +
            `this glyph would have rendered as a gap. opentype.js does this for some glyphs ` +
            `of some fonts; try another static cut.`,
        );
      }
      if (d) out.push({ path: d, dx });
    }
    dx += glyph.advanceWidth! * scale;
    const next = chars[i + 1];
    if (next) dx += font.getKerningValue(glyph, font.charToGlyph(next)) * scale;
  }
  return out;
}

/** Total advance of `text`, using the same metrics glyphsOf lays out with. */
function widthOf(font: opentype.Font, text: string, size: number): number {
  const scale = size / font.unitsPerEm;
  const chars = [...text];
  let w = 0;
  for (const [i, ch] of chars.entries()) {
    const g = font.charToGlyph(ch);
    w += g.advanceWidth! * scale;
    const next = chars[i + 1];
    if (next) w += font.getKerningValue(g, font.charToGlyph(next)) * scale;
  }
  return w;
}

/** A fact about the real file that a substitute would not reproduce. */
interface KnownMetric {
  unitsPerEm: number;
  glyph: string;
  /** advanceWidth of `glyph` in font units. */
  advance: number;
}

/**
 * Parse a committed TTF and prove it is the face this card was designed on
 * (5d, inverted): the known metric must match to the unit, and every
 * non-space character of `text` must produce contours. Per-character rather
 * than a length floor, because a font that parsed but lacks one glyph drops it
 * silently, and one missing letter in a wordmark reads as a design choice.
 */
function loadFont(fontFile: string, known: KnownMetric, text: string): opentype.Font {
  const font = opentype.parse(readFileSync(join(FONT_DIR, fontFile)).buffer as ArrayBuffer);
  const advance = font.charToGlyph(known.glyph).advanceWidth;
  const blank = [...new Set(text)].filter(
    (ch) => ch.trim() !== '' && font.charToGlyph(ch).getPath(0, 0, 100).commands.length === 0,
  );
  if (font.unitsPerEm !== known.unitsPerEm || advance !== known.advance || blank.length > 0) {
    throw new Error(
      `${fontFile} is not the face this card was designed on: unitsPerEm ${font.unitsPerEm} ` +
        `(expected ${known.unitsPerEm}), ${JSON.stringify(known.glyph)} advance ${advance} ` +
        `(expected ${known.advance})` +
        (blank.length ? `, NO glyph for ${blank.map((c) => JSON.stringify(c)).join(' ')}` : '') +
        `. The card would have shipped in a plausible substitute or with characters ` +
        `missing; design/fonts/ carries the TTFs so this cannot depend on the host.`,
    );
  }
  return font;
}

async function main(): Promise<void> {
  const sharp = (await import('sharp')).default;

  const WORD_A = 'STRIVE';
  const WORD_B = 'REPLAY';
  const L1 = 'The competitive GUILTY GEAR -STRIVE- replay database';
  const L2 = 'Character usage · matchups · meta over time';

  // Known metrics measured on the committed files 2026-09-08 with opentype.js:
  // Black Ops One 'S' = 1477/2048, Figtree Regular 'S' = 614/1000.
  const blackOps = loadFont(
    'BlackOpsOne-Regular.ttf',
    { unitsPerEm: 2048, glyph: 'S', advance: 1477 },
    `${WORD_A}/${WORD_B}${PROBE_LATIN}${PROBE_LATIN_EXT}`,
  );
  const figtree = loadFont(
    'Figtree-Regular.ttf',
    { unitsPerEm: 1000, glyph: 'S', advance: 614 },
    `${L1}${L2}${CREDIT}${PROBE_LATIN}${PROBE_LATIN_EXT}`,
  );

  // The footer stripe is the roster, in roster order.
  const roster = JSON.parse(
    readFileSync(join(ROOT, 'data', 'characters.json'), 'utf8'),
  ) as CharacterRecord[];
  if (roster.length === 0)
    throw new Error('data/characters.json is empty — the stripe would be blank.');
  // An invalid fill is dropped by librsvg without a word, and a stripe with one
  // segment missing looks like a fighter was removed from the roster.
  const badAccent = roster.filter((c) => !/^#[0-9A-Fa-f]{6}$/.test(c.accent));
  if (badAccent.length) {
    throw new Error(
      `${badAccent.length} fighter(s) carry a non-hex accent: ` +
        badAccent.map((c) => `${c.id}=${JSON.stringify(c.accent)}`).join(', '),
    );
  }
  const STRIPE = 16;
  const seg = W / roster.length;
  const stripe = roster
    // +0.5px of overlap so neighbouring segments never leave a hairline gap at
    // fractional widths (1200/34 = 35.29). Written as (seg + 0.5).toFixed(2),
    // never seg.toFixed(2) + 0.5 — that is string concatenation, it emits
    // width="35.290.5", and librsvg drops the whole stripe. CotW shipped it
    // invisible exactly once.
    .map(
      (c, i) =>
        `<rect x="${(i * seg).toFixed(2)}" y="${H - STRIPE}" width="${(seg + 0.5).toFixed(2)}" height="${STRIPE}" fill="${c.accent}"/>`,
    )
    .join('');

  // Every glyph is its own <path>, all in ONE overlay document.
  const paths: string[] = [];
  const line = (
    font: opentype.Font,
    text: string,
    size: number,
    fill: string,
    left: number,
    top: number,
  ): void => {
    for (const g of glyphsOf(font, text, size)) {
      paths.push(
        `<g transform="translate(${(left + g.dx).toFixed(2)} ${top})"><path d="${g.path}" fill="${fill}"/></g>`,
      );
    }
  };

  const BADGE = 116;
  const BX = 70;
  const BY = 168;
  const wordLeft = BX + BADGE + 34;
  // Black Ops One is a wide stencil slab and STRIVE/REPLAY is 13 glyphs where
  // CotW's wordmark was 11, so the size is FITTED to the column rather than
  // pinned at CotW's 104: the largest size at which the whole wordmark ends
  // inside the right margin, capped at 104 so a short mark never balloons.
  const wordmark = `${WORD_A}/${WORD_B}`;
  const WORD_SIZE = Math.floor(Math.min(104, (W - BX - wordLeft) / widthOf(blackOps, wordmark, 1)));
  const aW = widthOf(blackOps, WORD_A, WORD_SIZE);
  const slashW = widthOf(blackOps, '/', WORD_SIZE);
  // Baseline at top + size; keep the cap line where CotW's sits (badge-centred).
  const WORD_Y = BY + BADGE / 2 + WORD_SIZE * 0.32 - WORD_SIZE;

  line(blackOps, WORD_A, WORD_SIZE, TEXT, wordLeft, WORD_Y);
  line(blackOps, '/', WORD_SIZE, SECONDARY, wordLeft + aW, WORD_Y);
  line(blackOps, WORD_B, WORD_SIZE, TEXT, wordLeft + aW + slashW, WORD_Y);
  line(figtree, L1, 34, TEXT_MUTED, BX + 6, 330);
  line(figtree, L2, 26, TEXT_FAINT, BX + 6, 392);
  // The notice, above the stripe: 20px in the muted text colour (8.3:1 on the
  // surface), the size the site's own footer sets it at.
  line(figtree, CREDIT, 20, TEXT_MUTED, BX + 6, H - STRIPE - 42);

  // The chassis: diagonal texture, a corner wash in the primary, the badge and
  // the roster stripe. All background, so it is one SVG — the path-length
  // limit that forces the type into chunks does not apply to rects and lines.
  const base = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${SURFACE}"/>
          <stop offset="100%" stop-color="${BG}"/>
        </linearGradient>
        <radialGradient id="wash" cx="78%" cy="18%" r="62%">
          <stop offset="0%" stop-color="${PRIMARY}" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="${PRIMARY}" stop-opacity="0"/>
        </radialGradient>
        <pattern id="diag" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="14" height="14" fill="none"/>
          <rect width="5" height="14" fill="#FFFFFF" fill-opacity="0.018"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect width="100%" height="100%" fill="url(#diag)"/>
      <rect width="100%" height="100%" fill="url(#wash)"/>
      <!-- the platform badge: a cut-corner square in the game's primary,
           carrying the same slash the wordmark uses -->
      <path d="M${BX} ${BY} H${BX + BADGE - 26} L${BX + BADGE} ${BY + 26} V${BY + BADGE} H${BX} Z" fill="${PRIMARY}"/>
      <path d="M${BX + BADGE * 0.62} ${BY + BADGE * 0.2} L${BX + BADGE * 0.34} ${BY + BADGE * 0.8} l14 0 L${BX + BADGE * 0.62 + 14} ${BY + BADGE * 0.2} Z" fill="${PRIMARY_CONTRAST}"/>
      ${stripe}
    </svg>`,
  );

  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${paths.join('')}</svg>`,
  );

  const out = join(ROOT, 'public', 'og-default.png');
  await mkdir(dirname(out), { recursive: true });
  const png = await sharp(base)
    .composite([{ input: await sharp(overlay).png().toBuffer(), top: 0, left: 0 }])
    .png()
    .toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.width !== W || meta.height !== H) {
    throw new Error(`rendered ${meta.width}×${meta.height}, expected ${W}×${H}`);
  }
  await writeFile(out, png);
  console.log(
    `✓ public/og-default.png — ${W}×${H}, ${paths.length} glyph outline(s) from committed OFL ` +
      `TTFs (wordmark at ${WORD_SIZE}px), ${roster.length}-segment roster stripe, ` +
      `${JSON.stringify(NOTICE)} baked in; no font resolution at raster time`,
  );
}

main().catch((e: unknown) => {
  console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
