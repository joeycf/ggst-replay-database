/**
 * Build the character art from Arc System Works' own Fan Kit — checklist
 * "Art", first-party manifest branch.
 *
 * ── THE SOURCE IS THE FAN KIT, FOR BOTH SURFACES ──────────────────────────
 * https://www.guiltygear.com/ggst/en/fankit/ server-renders the whole roster
 * as numbered key-art cutouts, chara01…chara34, every one a 1600×1600
 * transparent PNG with the figure centred in frame (all 33 permitted files
 * re-measured on fetch 2026-09-08: 33/33 are 1600×1600 RGBA, byte-identical to
 * the 2026-09-07 recon copies). That uniformity is why the kit feeds BOTH the
 * portrait and the splash, where CotW's SNK site fed one render to both for a
 * different reason (it only had one). The alternative — the character detail
 * pages' tall splashes — was measured and rejected (recon roster-live.md §6c,
 * §7): opaque hashed filenames that cannot be constructed, aspect ratios from
 * 0.90 to 2.07 so no one crop box fits, and eight of them carry a near-#000
 * drop-shadow silhouette baked into the alpha that reads as a hole on a dark
 * UI. The kit's cutouts are cleanly matted and all the same shape.
 *
 * ── ENUMERATE, NEVER CONSTRUCT ────────────────────────────────────────────
 * Every URL is read off the page. The kit's trailing code is a THIRD spelling
 * of the character key, agreeing with neither the /en/ page slug nor the /jp/
 * one (anji→anj, chp→chipp), and it is not even stable inside the kit: the
 * key-art set says chara02_kyk and chara05_chipp while the chibi set on the
 * same page says 02_chibi_ky and 05_chibi_chp. The assets are served from
 * /ggst/jp/ paths on the EN page; rewriting jp→en 404s. Nothing here builds a
 * filename from anything.
 *
 * The leading NN is the roster ordinal (release order), which is also
 * data/characters.json's order — but an ordinal is a POSITION, and a position
 * can be right by accident. So the mapping is verified by a second, independent
 * signal: the page pairs every download link with a <p> caption carrying the
 * character's name, and that caption has to alias-resolve (scripts/roster.ts
 * aliasKey) to the fighter the ordinal points at. Both must agree on exactly
 * one file or the build stops. The caption is what catches a re-ordered kit;
 * the ordinal is what catches a mislabelled caption.
 *
 * ── THE LICENCE, READ FIRSTHAND 2026-09-07 (notes: fankit-licence.md) ─────
 *   Article 3.1  "© ARC SYSTEM WORKS" must appear on any content that shows
 *                the art. The engine renders GameConfig.artCredit in the footer
 *                at every width; scripts/og.ts bakes it into the card.
 *   Article 3.2  trimming and resizing are expressly permitted — the crops
 *                below are that and nothing more.
 *   Article 4.1  non-commercial, individuals or unincorporated organisations.
 *   Article 5    LUCY IS CARVED OUT, and it is the REDISTRIBUTION grant that
 *                goes. Publishing a crop of her cutout on this site is
 *                redistribution, and ArcSys has not granted it — CD PROJEKT
 *                RED's guideline governs her CHARACTER, but the artwork is
 *                ArcSys's rendering. So her file is never fetched, never
 *                cropped, never written. She gets a generated tile on her own
 *                accent, and her provenance row says why with `credit: null`.
 *
 * The exception is ONE named constant, LICENCE_EXCLUDED, and it is guarded
 * both ways: the live page's Article 5 is parsed on every run and the set of
 * fighters it carves out must equal the constant's keys. Delete her entry to
 * "tidy" it and the run fails BEFORE any fetch, naming the article; amend the
 * constant when ArcSys amends the terms and it fails the other way. That is
 * the positive control scripts/verify-gates.ts injects.
 *
 * ── FAIL LOUD FOR THE OTHER 33 ────────────────────────────────────────────
 * Every roster id must end with a portrait and a splash from the kit. A
 * missing one is a throw, not a placeholder: a fighter silently wearing a
 * generated tile looks deliberate, which is exactly why Lucy's is recorded.
 *
 * Run: npm run data:art   (manual, never in the cron — the kit changes on DLC
 *                          days and the head table below needs a hand-read
 *                          for every new fighter)
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import opentype from 'opentype.js';

import type { CharacterRecord } from '../types/index';
import { aliasKey, loadCharacters } from './roster';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'design', 'fonts');

// FONTCONFIG_FILE must be set before sharp's native binding initialises
// fontconfig, and a static `import sharp` is hoisted above every statement in
// the module (CotW og.ts, lesson 2). Nothing here renders <text> — the Lucy
// tile is drawn as outlines — but the binding still reads fontconfig on load,
// and leaving it pointed at the host's config is how a future <text> would
// silently resolve DejaVu.
process.env.FONTCONFIG_FILE = join(FONT_DIR, 'fonts.conf');
const sharp = (await import('sharp')).default;

const FANKIT_PAGE = 'https://www.guiltygear.com/ggst/en/fankit/';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** Article 3.1's notice, verbatim — "Please insert a half-width space between
 *  © and ARC." The live page is asserted to still state this string. */
const CREDIT = '© ARC SYSTEM WORKS';

/** The date the terms were read in full (fankit-licence.md). Carried into the
 *  provenance file so a reader knows which reading a row was made under. */
const LICENCE_VERIFIED = '2026-09-07';

/**
 * Roster id → why this fighter's Fan Kit asset must NOT be used.
 *
 * THE ONE EXCEPTION, AND IT IS A LICENCE FACT, NOT A DESIGN CHOICE. Article 5
 * withholds the Article 3.3 redistribution grant for "materials related to the
 * character 'Lucy'", so publishing a crop of chara32_luc.png is something
 * ArcSys has not permitted. Her file is never fetched (`get` refuses the URL
 * the page pairs with her caption), and she ships a generated tile instead.
 *
 * Guarded against the live terms on every run — see checkArticle5 — so
 * deleting this row fails the build rather than quietly turning a licence
 * hole into a portrait. Add a row only when the licence text names a fighter.
 */
const LICENCE_EXCLUDED: Record<string, string> = {
  lucy:
    'Fan Kit Article 5 (Special Provisions: Use of the character Lucy): her materials are ' +
    '"not subject to the provisions of this Agreement (including the copyright notice ' +
    'obligation in Article 3, Paragraph 1 and the redistribution permission in Article 3, ' +
    'Paragraph 3)"; CD PROJEKT RED\'s fan-content guideline applies instead. Publishing a ' +
    'crop is redistribution and ArcSys has not granted it, so chara32_luc.png was neither ' +
    'fetched nor written. Read firsthand ' +
    LICENCE_VERIFIED +
    '.',
};

/** Article 5's operative sentence: `materials related to the character “Lucy”`.
 *  Both curly and straight quotes are accepted; the page uses U+201C/U+201D. */
const ARTICLE_5_CARVE_OUT = /materials related to the character\s*[“"']([^”"']+)[”"']/g;

/** Every kit cutout is this square. The head table below was read on THIS
 *  frame, so a file of any other size means the kit was re-cut and the table
 *  has to be re-read — a throw, not a resize. */
const KIT_FRAME = 1600;

/** URLs whose caption resolved to a LICENCE_EXCLUDED fighter. Populated once
 *  the page is enumerated; `get` refuses them. */
const forbidden = new Set<string>();

const get = async (url: string): Promise<Response> => {
  if (forbidden.has(url)) {
    throw new Error(
      `REFUSED ${url}: this asset belongs to a LICENCE_EXCLUDED fighter and must never be fetched.`,
    );
  }
  const res = await fetch(url, { headers: { 'user-agent': UA, referer: FANKIT_PAGE } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res;
};

interface Written {
  dimensions: string;
  crop: string;
  /** How the composition landed — subject box, scale and placement. Both
   *  helpers COMPOSE, so the crop string alone does not describe the result. */
  figure?: string;
  bytes: number;
  sha256: string;
}

interface ProvenanceRow {
  id: string;
  /** The kit's chara<NN> ordinal — release order, verified against position. */
  ordinal: number;
  /** The page's own <p> label for this file — the independent mapping signal. */
  caption: string;
  /** The enumerated Fan Kit URL, or null for a fighter whose asset was never
   *  fetched. */
  source: string | null;
  /** sha256 of the SOURCE bytes as fetched, so a silently re-cut kit shows up
   *  as a diff in this file rather than as a subtly different crop. */
  sourceSha256: string | null;
  sourceDimensions: string | null;
  /** Article 3.1's notice for a kit asset; null for a generated tile, which is
   *  not ArcSys's material and owes them no credit. */
  credit: string | null;
  /** Why a fighter has no kit asset. Present ONLY on a LICENCE_EXCLUDED row. */
  reason?: string;
  portrait: Written;
  splash: Written;
}

const finish = async (out: string, webp: Buffer, extra: Omit<Written, 'bytes' | 'sha256'>) => {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, webp);
  return {
    ...extra,
    bytes: webp.length,
    sha256: createHash('sha256').update(webp).digest('hex').slice(0, 16),
  };
};

/**
 * ── THE TWO SURFACES, AND WHY BOTH ARE COMPOSED HERE ──────────────────────
 * The engine draws character art in exactly two places and neither's framing is
 * configurable (replay-engine app/pages/characters/):
 *
 *   GRID  `aspect-[3/4] w-full object-cover`, NO object-position
 *         (index.vue:21) — a 211×282 tile at desktop.
 *   HERO  a fixed 1440×340 (4.2353:1) `object-cover` letterbox ([id].vue:4,
 *         280px tall below md), framed only by GameConfig.heroFocus, which
 *         chooses WHICH SLICE of a tall render shows — never how much.
 *
 * So the art has to arrive already shaped, and for the hero that means arriving
 * already the shape of the box. Both helpers below COMPOSE rather than crop,
 * the arrangement CotW reached (ffcotw scripts/art.ts) and this game keeps:
 * app.config.ts heroFocus '100% 50%' is the value that arithmetic produces,
 * and with this file it is measured here rather than inherited.
 */

/** The desktop hero box, 1440×340. The splash canvas is exactly 2× it, so the
 *  ratio matches to the digit and `object-cover` crops NOTHING at desktop. */
const HERO_W = 2880;
const HERO_H = 680;

/** The figure's share of the hero's height. Every fighter is scaled to the SAME
 *  body height. The kit's frames are uniform but the bodies inside them are
 *  not: measured 2026-09-08 over the 33 permitted cutouts, near-opaque body
 *  heights run 1338 (Ramlethal) to 1588 (Slayer) and widths 661 (Happy Chaos)
 *  to 1594 (May, Queen Dizzy). */
const FIGURE_H = 0.92;

/** The body's RIGHT edge, as a fraction of canvas width — the figure is placed
 *  from the right, not centred on a point, and `heroFocus` ships as `'100% …'`
 *  so the window is flush right at every breakpoint. That makes the framing one
 *  invariant instead of two: the body keeps this same 3% margin whether or not
 *  the browser is cropping. Centring on 70% is WRONG here: the hero's scrim is
 *  opaque page background to 25% of the width and only reaches transparent AT
 *  70% ([id].vue:28), so a body centred there has its left half in the fade. */
const FIGURE_RIGHT = 0.97;

/** Hard cap on body width, in canvas px. The binding constraint is the NARROWEST
 *  viewport: at 360×280 the hero shows only 874 of the canvas's 2880 columns, so
 *  a body wider than `874 − 2880 × (1 − FIGURE_RIGHT)` = 788 cannot fit however
 *  it is placed. NOBODY ON THIS ROSTER IS SCALED BY IT — the widest, May, lands
 *  at 746 — but a future DLC pose with wider reach would be silently clipped on
 *  a phone without it. Height gives way, not width. */
const FIGURE_MAX_W = 788;

const FIGURE_BASELINE = 20;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The figure's bounding boxes at two alpha thresholds, plus the head estimate
 *  and WHAT THE TOPMOST OPAQUE ROWS ACTUALLY ARE.
 *
 *  `opaque` (alpha > 200) is the BODY: it is what the head table is read
 *  against and what sets the splash scale. `visible` (alpha > 8) is what a
 *  viewer actually sees, and it is what the splash EXTRACTS — the two differ by
 *  ≤ 6px on 29 of 33 cutouts, but Jack-O's halo glow reaches 267px left of her
 *  body and Eddie's low-alpha shadow 129px right of Zato's (measured
 *  2026-09-08), and cropping either at the opaque box leaves a hard edge in the
 *  hero. e2e measures fit at alpha > 8 for the same reason.
 *
 *  `topX` is the horizontal span of the body's top 12 rows (0.75% of the
 *  frame), as fractions of the body width. It is the measurement behind the
 *  head table: "the top of the figure is the head" is exactly the claim that
 *  this span contains the face, and printing it per fighter next to the
 *  table's x is what lets a reader check a row without opening the image.
 *
 *  Scanned at full resolution: the kit is 1600px square and the head fractions
 *  were read to the percent, so a 4× downscale would cost more precision than
 *  the 2.5M-pixel scan costs time. */
async function measure(
  buf: Buffer,
): Promise<{ opaque: Box; visible: Box; headX: number; topX: [number, number] }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const alpha = (x: number, y: number): number => data[(y * W + x) * info.channels + 3]!;
  const scan = (threshold: number): Box => {
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (alpha(x, y) > threshold) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) throw new Error('the cutout has no pixel above the threshold — is it blank?');
    return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  };
  const opaque = scan(200);
  const visible = scan(8);

  // Horizontal centre of mass of the body's TOP QUARTER — the head estimate the
  // portrait falls back on when BUST_HEAD carries no row for this fighter.
  let sum = 0;
  let n = 0;
  const quarter = opaque.top + Math.round(opaque.height * 0.25);
  for (let y = opaque.top; y <= quarter; y++) {
    for (let x = opaque.left; x < opaque.left + opaque.width; x++) {
      if (alpha(x, y) > 200) {
        sum += x;
        n++;
      }
    }
  }
  // The topmost opaque rows: what a naive head-crop would centre on.
  let tx0 = W;
  let tx1 = -1;
  for (let y = opaque.top; y < Math.min(opaque.top + 12, H); y++) {
    for (let x = opaque.left; x < opaque.left + opaque.width; x++) {
      if (alpha(x, y) > 200) {
        if (x < tx0) tx0 = x;
        if (x > tx1) tx1 = x;
      }
    }
  }
  return {
    opaque,
    visible,
    headX: n ? sum / n : opaque.left + opaque.width / 2,
    topX: [(tx0 - opaque.left) / opaque.width, (tx1 - opaque.left) / opaque.width],
  };
}

/** The bust window's height, as a fraction of the figure's own height, and how
 *  far down that window the head is placed. 0.52 reaches roughly hip level on a
 *  standing fighter; the 0.10 of headroom keeps the crown off the top edge.
 *  CotW's numbers, kept: the platform's grid tiles should read as one set. */
const BUST_HEIGHT = 0.52;
const BUST_HEAD_TOP = 0.1;

/** The head's position INSIDE the near-opaque body box, as fractions of that
 *  box (x from the left, y from the top). Absent = the estimate: y 0.05 and
 *  the centre of mass of the body's top quarter.
 *
 *  ON THIS ROSTER THE ESTIMATE IS THE EXCEPTION. "The top of the figure is the
 *  head" is true for 3 of 33 kit cutouts (Sol, Ky, Unika), and where it fails
 *  it fails absurdly rather than by degrees: Bedman?'s top 40% is a machine
 *  and Delilah's head is at the geometric centre; Venom is a near-horizontal
 *  pose with his head a quarter of the way across; a giant key's cartoon face
 *  owns A.B.A's top fifth; Faust's paper bag IS the topmost thing but sits 90%
 *  across; Potemkin's gauntlet fills the top-left and drags the centroid to
 *  0.35 while his head is at 0.70. The recon's per-character reading
 *  (roster-live.md §7) was made on the DETAIL-PAGE splashes, which are
 *  different renders in different poses — so every value below was RE-READ on
 *  the kit cutouts this file actually crops (2026-09-08, on a 10%-of-body grid
 *  overlaid on each cutout), with the recon as the prior it was checked
 *  against. Where the two disagree the kit wins, because the kit is the crop.
 *
 *  THEN CHECKED AGAINST THE TILES, not just the sources: the 34 shipped
 *  portraits were laid out on one contact sheet and looked at (2026-09-08),
 *  and four rows were corrected on that pass. i-no's x had been read as 0.62,
 *  which is the centroid of hat-brim-plus-guitar rather than her face at 0.33
 *  — the crop put her on the left edge; venom's x 0.25 stood the window 9% of
 *  the body LEFT of the body (an empty accent band beside him); potemkin and
 *  faust had under 1% of headroom over the helmet spike and the bag. A grid
 *  read finds the head; only the tile shows whether the window framed it.
 *
 *  AND MEASURED, 2026-09-09: measure() reports the x-span of each body's
 *  topmost opaque rows, which is what a "top of the figure" crop centres on.
 *  Against the table's x it says WHY each row exists, in numbers — leo's top
 *  rows span 0.86–0.92 (the right axe-sword) and his head is at 0.50; jam's
 *  0.88–0.96 (the rabbit) against 0.42; johnny's 0.18–0.22 (the hat brim)
 *  against 0.52; asuka-r's 0.26–0.32 (the pages) against 0.55; potemkin's
 *  0.24–0.36 (the gauntlet) against 0.74; nagoriyuki's 0.29–0.33 (the hilt)
 *  against 0.47; testament's 0.39–0.45 (the scythe) against 0.67. Faust is the
 *  inverse case: his top rows 0.80–0.97 ARE the bag, and the row only adds the
 *  3% of headroom the estimate's 0.05 lacked. Every crosshair was then placed
 *  on its cutout and looked at once more (33/33 on the face; the three
 *  estimate-only fighters Sol, Ky and Unika too). The span is printed per
 *  fighter on every run and carried into data/art-provenance.json.
 *
 *  GUARDED, not merely declared: a key matching no fighter hard-fails below,
 *  because a stale key is not inert — the fighter it was meant for falls back
 *  to the estimate the row exists to override, and the tile is silently
 *  mis-framed. `npm run data:art` prints TABLE vs estimated per fighter, with
 *  both readings, so a deleted row is visible in the log as well as the tile.
 *  That is the positive control: remove a row and the printed line and the
 *  crop both revert to the exact estimate. */
const BUST_HEAD: Record<string, { x: number; y: number }> = {
  may: { x: 0.6, y: 0.09 }, // hood is the top; the anchor and whale sit left of her face
  'axl-low': { x: 0.58, y: 0.05 }, // the left scythe pulls the centroid to 0.47
  'chipp-zanuff': { x: 0.63, y: 0.05 }, // hair spikes spread the top across 0.29–0.72
  // RE-READ 2026-09-09 from 0.74/0.11, which landed on EMPTY BACKGROUND: alpha 0
  // at that point and 0% opaque within 55px, so the window centred on nothing and
  // the shipped tile put his helmet ~18% from the left edge. The huge shape in the
  // top-left is his GAUNTLET, not his head; the head is the small helmeted one at
  // centre-right. 72% opaque within 55px now. This is the row the alpha guard below
  // was added for.
  potemkin: { x: 0.62, y: 0.17 },
  faust: { x: 0.85, y: 0.03 }, // stooped; the bag is topmost AND spans 77–98% across
  'millia-rage': { x: 0.58, y: 0.07 }, // hair mass drags the centroid left
  'zato-1': { x: 0.6, y: 0.19 }, // Eddie's silhouette fills the frame above him
  'ramlethal-valentine': { x: 0.48, y: 0.12 }, // hat; a greatsword hilt reaches the top-left
  // RE-READ 2026-09-09 from 0.5/0.21 (alpha 0, 21% opaque nearby — it sat in the
  // gap between the two raised axe-swords, just above the crown). 93% now.
  'leo-whitefang': { x: 0.54, y: 0.25 },
  nagoriyuki: { x: 0.47, y: 0.21 }, // the sword hilt is the top 13%
  giovanna: { x: 0.6, y: 0.16 }, // Rei sits above and left of her
  'anji-mito': { x: 0.55, y: 0.1 }, // raised arm and open fan above
  'i-no': { x: 0.36, y: 0.12 }, // face at 0.33 under a hat three heads wide; 0.62 was the brim+guitar centroid
  'goldlewis-dickinson': { x: 0.52, y: 0.08 }, // the spectral hand reaches the top edge
  'jack-o': { x: 0.48, y: 0.2 }, // halo/mask above the head
  'happy-chaos': { x: 0.57, y: 0.16 }, // halo above
  baiken: { x: 0.42, y: 0.21 }, // hair spikes and the raised katana are topmost
  testament: { x: 0.67, y: 0.12 }, // the scythe arcs across the top-left
  bridget: { x: 0.55, y: 0.12 }, // yoyo and raised hand above
  'sin-kiske': { x: 0.53, y: 0.1 }, // flagpole crosses the top band
  bedman: { x: 0.43, y: 0.46 }, // Delilah, at the centre; the top 40% is the machine
  // RE-READ 2026-09-09 from 0.55/0.13, which was in the gap between the floating
  // tome on his right and the swirling pages on his left — alpha 0, 0% opaque
  // within 55px. His head is lower and centre. 78% now. Found by the guard
  // below, not by eye: it is the fourth row of this kind and the only one the
  // adversarial review missed.
  'asuka-r': { x: 0.54, y: 0.22 }, // tome, staff ring and pages all extend above him
  johnny: { x: 0.52, y: 0.09 }, // hat and raised arm
  'elphelt-valentine': { x: 0.5, y: 0.11 }, // raised arm is topmost
  aba: { x: 0.38, y: 0.27 }, // Paracelsus's face owns the top fifth
  // RE-READ 2026-09-09 from 0.62/0.09 (alpha 0, 2.6% opaque nearby — it sat among
  // the bats above his shoulder, not on him). 86% now.
  slayer: { x: 0.49, y: 0.16 },
  'queen-dizzy': { x: 0.6, y: 0.26 }, // the two wing-spirits and their halos above
  venom: { x: 0.33, y: 0.27 }, // near-horizontal; the cue tip is the top row (x 0.43–0.46), his face a quarter down
  'jam-kuradoberi': { x: 0.42, y: 0.27 }, // dim-sum basket top-left, rabbit top-right
  'robo-ky': { x: 0.43, y: 0.27 }, // seated; the throne back is the top 24%
};

// ── the generated tile (Lucy only) ──────────────────────────────────────────

/** The card surface the engine's own missing-art ground sits on: Strive's
 *  --color-surface #12151B (app/assets/theme.css), NOT CotW's #171513. The
 *  gradient is app/utils/format.ts accentGradient rebuilt in SVG —
 *  `linear-gradient(150deg, accent, color-mix(in srgb, accent 20%, transparent))`
 *  — so the generated tile is the SAME tile the grid draws when an image fails
 *  to load, in the same colour, rather than a third design. */
const SURFACE = '#12151B';
const BG = '#0B0D11';

const accentGround = (accent: string, w: number, h: number): string =>
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0.5" y2="0.866">` +
  `<stop offset="0" stop-color="${accent}" stop-opacity="1"/>` +
  `<stop offset="1" stop-color="${accent}" stop-opacity="0.2"/></linearGradient></defs>` +
  `<rect width="${w}" height="${h}" fill="${SURFACE}"/>` +
  `<rect width="${w}" height="${h}" fill="url(#g)"/>`;

interface Glyph {
  path: string;
  dx: number;
}

/** Text → one SVG path per glyph, each at the origin, positioned by the font's
 *  own advances and kern pairs. The same shape as scripts/og.ts glyphsOf, for
 *  the same two reasons (librsvg truncates long `d` attributes; opentype.js
 *  emits NaN from multi-glyph layout). Duplicated rather than shared because
 *  both files are entry scripts that run on import and this track owns no
 *  third module. */
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
          `non-finite path geometry for ${JSON.stringify(ch)} at size ${size} — the glyph ` +
            `would have rendered as a gap, which reads as letter-spacing rather than a failure.`,
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

/** Parse the committed display TTF and prove it is the real face (checklist
 *  5d, inverted the way og.ts inverts it): a KNOWN glyph advance — 'S' is 1477
 *  units of 2048 in Black Ops One, measured 2026-09-08 — and a non-trivial
 *  outline for every character of `text`. A missing or swapped TTF fails here
 *  instead of drawing a plausible fallback into the tile. */
function loadDisplayFont(text: string): opentype.Font {
  const file = 'BlackOpsOne-Regular.ttf';
  const font = opentype.parse(readFileSync(join(FONT_DIR, file)).buffer as ArrayBuffer);
  const KNOWN = { unitsPerEm: 2048, glyph: 'S', advance: 1477 };
  const advance = font.charToGlyph(KNOWN.glyph).advanceWidth;
  const blank = [...new Set(text)].filter(
    (ch) => ch.trim() !== '' && font.charToGlyph(ch).getPath(0, 0, 100).commands.length === 0,
  );
  if (font.unitsPerEm !== KNOWN.unitsPerEm || advance !== KNOWN.advance || blank.length) {
    throw new Error(
      `${file} is not the face this tile was designed on: unitsPerEm ${font.unitsPerEm} ` +
        `(expected ${KNOWN.unitsPerEm}), '${KNOWN.glyph}' advance ${advance} (expected ` +
        `${KNOWN.advance})` +
        (blank.length ? `, no glyph for ${blank.map((c) => JSON.stringify(c)).join(' ')}` : '') +
        `. design/fonts/ carries the TTF so this cannot depend on the host.`,
    );
  }
  return font;
}

/** The name, set in the display face at a size that fills `fraction` of `w`,
 *  with its cap height centred on `cy`. Returns the <g> elements. Fill is the
 *  engine's own fallback ink — text-bg/70, i.e. --color-bg at 0.7 — so the tile
 *  matches what the grid draws for a fighter whose image failed to load. */
function nameOutlines(
  font: opentype.Font,
  text: string,
  w: number,
  fraction: number,
  cx: number,
  cy: number,
): string {
  const size = (w * fraction) / widthOf(font, text, 100) / 0.01;
  // Cap height from the font's own 'H' bounds, so the optical centre is the
  // centre of the letters rather than of the em box.
  const capH = (font.charToGlyph('H').getBoundingBox().y2 / font.unitsPerEm) * size;
  const left = cx - widthOf(font, text, size) / 2;
  const top = cy + capH / 2 - size; // glyphsOf draws the baseline at y = size
  return glyphsOf(font, text, size)
    .map(
      (g) =>
        `<g transform="translate(${(left + g.dx).toFixed(2)} ${top.toFixed(2)})">` +
        `<path d="${g.path}" fill="${BG}" fill-opacity="0.7"/></g>`,
    )
    .join('');
}

/**
 * THE GENERATED TILE, for a LICENCE_EXCLUDED fighter only. The same ground as
 * the engine's missing-art fallback, the fighter's name in the display face as
 * outlines, at both output shapes. NOT a placeholder for a missing asset — a
 * fighter whose kit file failed to enumerate or fetch is a throw, never this.
 */
async function generatedTiles(
  c: CharacterRecord,
  font: opentype.Font,
): Promise<{ portrait: Written; splash: Written }> {
  const name = c.name.toUpperCase();

  // Portrait: 512×683, the ground full-bleed, the name on the accent-strong
  // upper half (the gradient is dark by the bottom-right corner).
  const PW = 512;
  const PH = Math.round(PW / 0.75);
  const portraitSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">` +
      accentGround(c.accent, PW, PH) +
      nameOutlines(font, name, PW, 0.72, PW / 2, PH * 0.42) +
      `</svg>`,
  );
  const portraitWebp = await sharp(portraitSvg).webp({ quality: 82 }).toBuffer();
  const portrait = await finish(join(ROOT, 'public/img/char', `${c.id}.webp`), portraitWebp, {
    dimensions: `${PW}×${PH}`,
    crop: `generated: accent ground ${c.accent} with "${name}" as display-face outlines`,
  });

  // Splash: the hero canvas, transparent, with a cut-corner slab standing where
  // a body would — the portrait tile's own 3:4, FIGURE_H tall, flush right at
  // FIGURE_RIGHT like every real figure, so the engine's stripe backplate still
  // shows around it. NOT FIGURE_MAX_W wide: a slab that wide sits with 0px to
  // spare against the 360×280 window (e2e's narrowest-viewport check passed on
  // rounding alone, measured 2026-09-09), and the real bodies carry 42–522px.
  const SH = Math.round(HERO_H * FIGURE_H);
  const SW = Math.round(SH * 0.75);
  const sx = Math.round(HERO_W * FIGURE_RIGHT) - SW;
  const sy = HERO_H - FIGURE_BASELINE - SH;
  const CUT = 40;
  const slab =
    `<clipPath id="slab"><path d="M${sx} ${sy} H${sx + SW - CUT} L${sx + SW} ${sy + CUT} ` +
    `V${sy + SH} H${sx} Z"/></clipPath>` +
    `<g clip-path="url(#slab)"><g transform="translate(${sx} ${sy})">` +
    accentGround(c.accent, SW, SH) +
    `</g></g>`;
  const splashSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${HERO_W}" height="${HERO_H}">` +
      slab +
      nameOutlines(font, name, SW, 0.6, sx + SW / 2, sy + SH * 0.42) +
      `</svg>`,
  );
  const splashWebp = await sharp(splashSvg).webp({ quality: 82, alphaQuality: 100 }).toBuffer();
  const splash = await finish(join(ROOT, 'public/img/splash', `${c.id}.webp`), splashWebp, {
    dimensions: `${HERO_W}×${HERO_H}`,
    crop: `generated: ${SW}×${SH} cut-corner slab on ${c.accent} at x${sx}, transparent canvas`,
  });
  return { portrait, splash };
}

// ── the kit crops ───────────────────────────────────────────────────────────

/**
 * THE PORTRAIT IS A BUST CROP OF THE CUTOUT, ON THE FIGHTER'S ACCENT.
 *
 * The grid is a hard 3:4 `object-cover` box with no object-position, so the
 * art arrives already 3:4 with the head where the box will show it. The window
 * is BUST_HEIGHT of the body, 3:4, with the head BUST_HEAD_TOP down it — and
 * the head is LOCATED, from BUST_HEAD or the estimate, which is the one thing
 * that cannot be derived on this roster (see the table).
 */
async function savePortrait(
  c: CharacterRecord,
  buf: Buffer,
  m: Awaited<ReturnType<typeof measure>>,
  out: string,
): Promise<Written> {
  const box = m.opaque;
  const head = BUST_HEAD[c.id];
  const estX = m.headX;
  const estY = box.top + 0.05 * box.height;
  const hx = head ? box.left + head.x * box.width : estX;
  const hy = head ? box.top + head.y * box.height : estY;

  // THE CROSSHAIR MUST LAND ON THE FIGURE. A hand-read row is a pair of numbers
  // typed by a person looking at a picture, and the failure mode is silent: the
  // window centres on empty background, the crop still succeeds, and the tile
  // renders with the fighter shoved against an edge. Three of the 30 table rows
  // shipped that way on 2026-09-09 — potemkin at alpha 0 with NOTHING opaque
  // within 55px, slayer 2.6%, leo-whitefang 21% — and none of the existing
  // checks noticed, because every one of them asks about dimensions or aspect
  // rather than about where the point is.
  //
  // So: probe the source alpha AROUND the crosshair. Cheap, and it turns "I
  // looked at it" into something the build re-asserts on every run.
  //
  // IT MEASURES A NEIGHBOURHOOD, NOT A PIXEL, and the first version of this
  // guard got that wrong. A single-pixel alpha test failed four rows whose
  // crosshair is fine — may, zato-1, anji-mito and goldlewis-dickinson all land
  // in a one-pixel gap between hair strands or inside a costume cut-out. The
  // separation is unambiguous once you look at the density instead
  // (measured 2026-09-09 over all 30 table rows, 55px radius):
  //      genuinely off the figure   potemkin 0.0%  asuka-r 0.0%  slayer 2.6%
  //                                 leo-whitefang 21.0%
  //      a gap inside the figure    goldlewis 51.2%  may 52.3%  zato-1 58.7%
  //                                 anji-mito 85.4%
  // Nothing lands between 21% and 51%, so the threshold sits in the middle of a
  // real gap rather than being tuned to the failures.
  const R = 55;
  const px = Math.round(hx);
  const py = Math.round(hy);
  const win = {
    left: Math.max(0, px - R),
    top: Math.max(0, py - R),
    width: Math.min(KIT_FRAME, px + R) - Math.max(0, px - R),
    height: Math.min(KIT_FRAME, py + R) - Math.max(0, py - R),
  };
  const near = await sharp(buf).ensureAlpha().extract(win).raw().toBuffer();
  let opaque = 0;
  for (let i = 3; i < near.length; i += 4) if (near[i]! > 200) opaque++;
  const density = opaque / (win.width * win.height);
  if (density < 0.35) {
    throw new Error(
      `${c.id}: the head crosshair (${head ? `BUST_HEAD ${head.x}, ${head.y}` : 'estimate'}) ` +
        `is at source pixel (${px}, ${py}), where only ${(density * 100).toFixed(1)}% of the ` +
        `surrounding ${R}px is opaque. The window would centre on empty background and the ` +
        `fighter would sit against an edge. Re-read the position ON THE CUTOUT — the biggest ` +
        `shape near the top is often a weapon, a prop or a gauntlet, not the head.`,
    );
  }

  // Fit the window to the image before placing it, so a short render shrinks
  // the crop rather than silently sliding it off the figure.
  let winH = Math.min(box.height * BUST_HEIGHT, KIT_FRAME, KIT_FRAME / 0.75);
  let winW = winH * 0.75;
  if (winW > KIT_FRAME) {
    winW = KIT_FRAME;
    winH = winW / 0.75;
  }
  const left = Math.round(Math.min(Math.max(0, hx - winW / 2), KIT_FRAME - winW));
  const top = Math.round(Math.min(Math.max(0, hy - winH * BUST_HEAD_TOP), KIT_FRAME - winH));

  const OUT_W = 512;
  const OUT_H = Math.round(OUT_W / 0.75);
  const figure = await sharp(buf)
    .extract({ left, top, width: Math.round(winW), height: Math.round(winH) })
    .resize(OUT_W, OUT_H, { fit: 'fill' })
    .png()
    .toBuffer();

  const ground = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}">` +
      accentGround(c.accent, OUT_W, OUT_H) +
      `</svg>`,
  );
  const webp = await sharp(ground)
    .composite([{ input: figure }])
    .webp({ quality: 82 })
    .toBuffer();

  const pct = (v: number, from: number, span: number) =>
    `${(((v - from) / span) * 100).toFixed(0)}%`;
  return finish(out, webp, {
    dimensions: `${OUT_W}×${OUT_H}`,
    crop: `bust ${Math.round(winW)}×${Math.round(winH)} at ${left},${top} on ${c.accent}`,
    figure:
      `head ${head ? 'TABLE' : 'estimated'} at ${pct(hx, box.left, box.width)},` +
      `${pct(hy, box.top, box.height)} of body ${box.width}×${box.height} (` +
      [
        ...(head
          ? [`estimate ${pct(estX, box.left, box.width)},${pct(estY, box.top, box.height)}`]
          : []),
        `top rows span x ${(m.topX[0] * 100).toFixed(0)}–${(m.topX[1] * 100).toFixed(0)}%`,
      ].join('; ') +
      ')',
  });
}

/**
 * THE SPLASH IS THE WHOLE FIGURE COMPOSED AT THE HERO'S OWN RATIO, on
 * transparency: 2× the 1440×340 box, body scaled to FIGURE_H of the height and
 * stood flush right at FIGURE_RIGHT. object-cover then crops nothing at desktop
 * and heroFocus '100% 50%' keeps the body in the window below it. The engine's
 * diagonal-stripe backplate paints under the img and its accent radial over it,
 * so both still show through as designed — which is why the alpha is kept.
 */
async function saveSplash(
  buf: Buffer,
  m: Awaited<ReturnType<typeof measure>>,
  out: string,
): Promise<Written> {
  const body = m.opaque;
  const seen = m.visible;
  // Height sets the scale, from the BODY; the width cap, on what is VISIBLE,
  // only ever reduces it.
  const scale = Math.min((HERO_H * FIGURE_H) / body.height, FIGURE_MAX_W / seen.width);
  const figW = Math.max(1, Math.round(seen.width * scale));
  const figH = Math.max(1, Math.round(seen.height * scale));
  const left = Math.max(0, Math.round(HERO_W * FIGURE_RIGHT) - figW);
  const top = Math.max(0, HERO_H - FIGURE_BASELINE - figH);

  const figure = await sharp(buf)
    .extract(seen)
    .resize(figW, figH, { fit: 'fill' })
    .png()
    .toBuffer();
  const webp = await sharp({
    create: {
      width: HERO_W,
      height: HERO_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: figure, left, top }])
    .webp({ quality: 82, alphaQuality: 100 })
    .toBuffer();

  return finish(out, webp, {
    dimensions: `${HERO_W}×${HERO_H}`,
    crop:
      `full figure composed onto the hero's own ${HERO_W}×${HERO_H} ratio ` +
      `(2× the 1440×340 box, so object-cover crops nothing at desktop)`,
    figure:
      `body ${body.width}×${body.height}, visible ${seen.width}×${seen.height} → ` +
      `${figW}×${figH} at x${left}` +
      (figW >= FIGURE_MAX_W ? ' (width-capped)' : ''),
  });
}

// ── the page ────────────────────────────────────────────────────────────────

interface KitAsset {
  ordinal: number;
  code: string;
  caption: string;
  url: string;
}

/** Every chara<NN>_<code>.png the page links, each with the caption the page
 *  pairs it with. Two regexes on purpose: the broad one finds every asset the
 *  page references in any attribute, the narrow one reads caption→link pairs,
 *  and every asset the broad one finds must appear in the narrow one — so a
 *  markup change that drops the caption cannot silently drop the second
 *  mapping signal along with it. */
function enumerateKit(html: string): KitAsset[] {
  const abs = (href: string): string => new URL(href, FANKIT_PAGE).toString();
  const every = new Set(
    [...html.matchAll(/(?:href|src|srcset)="([^"]*\/fankit\/chara\d+_[^"]+\.png)"/g)].map((m) =>
      abs(m[1]!),
    ),
  );
  const PAIR =
    /<p[^>]*>([^<]+)<\/p>\s*<a[^>]*\bhref="([^"]*\/fankit\/chara(\d+)_([a-z0-9]+)\.png)"/g;
  const assets = new Map<string, KitAsset>();
  for (const m of html.matchAll(PAIR)) {
    const url = abs(m[2]!);
    assets.set(url, { ordinal: Number(m[3]), code: m[4]!, caption: m[1]!.trim(), url });
  }
  const uncaptioned = [...every].filter((u) => !assets.has(u));
  if (every.size === 0 || uncaptioned.length) {
    throw new Error(
      every.size === 0
        ? `${FANKIT_PAGE} lists no chara<NN>_<code>.png at all — the page shape changed.`
        : `${uncaptioned.length} kit asset(s) carry no caption, so the ordinal→fighter mapping ` +
            `cannot be verified for them:\n    ${uncaptioned.join('\n    ')}`,
    );
  }
  return [...assets.values()].sort((a, b) => a.ordinal - b.ordinal || a.code.localeCompare(b.code));
}

/** Resolve a name the page uses (a caption, or an Article 5 carve-out) to a
 *  roster id through the same key the parser uses, or null. */
function resolveName(name: string, characters: CharacterRecord[]): string | null {
  const key = aliasKey(name);
  const hit = characters.find(
    (c) => aliasKey(c.name) === key || (c.extra?.aliases ?? []).some((a) => aliasKey(a) === key),
  );
  return hit?.id ?? null;
}

/**
 * THE LICENCE CROSS-CHECK. The fighters the LIVE Article 5 carves out must be
 * exactly the keys of LICENCE_EXCLUDED — in both directions, before any asset
 * is fetched. A carve-out the roster cannot resolve is also a stop: a licence
 * fact we cannot map is one we cannot honour.
 */
function checkArticle5(html: string, characters: CharacterRecord[]): void {
  const named = [...html.matchAll(ARTICLE_5_CARVE_OUT)].map((m) => m[1]!.trim());
  if (named.length === 0) {
    throw new Error(
      `could not read Article 5 from ${FANKIT_PAGE} — the carve-out sentence no longer matches. ` +
        `Re-read the terms by hand before running this again; LICENCE_EXCLUDED may be stale.`,
    );
  }
  const live = new Set<string>();
  for (const name of named) {
    const id = resolveName(name, characters);
    if (!id) throw new Error(`Article 5 carves out "${name}", which resolves to no roster id.`);
    live.add(id);
  }
  const declared = new Set(Object.keys(LICENCE_EXCLUDED));
  const missing = [...live].filter((id) => !declared.has(id));
  const extra = [...declared].filter((id) => !live.has(id));
  if (missing.length || extra.length) {
    throw new Error(
      `LICENCE_EXCLUDED disagrees with the live Fan Kit Article 5.` +
        (missing.length
          ? `\n    carved out by the licence but NOT excluded here: ${missing.join(', ')} — ` +
            `their kit assets must not be fetched; restore the row.`
          : '') +
        (extra.length
          ? `\n    excluded here but NOT carved out by the licence: ${extra.join(', ')} — ` +
            `the terms changed; re-read them before touching the row.`
          : ''),
    );
  }
  if (!html.includes(CREDIT)) {
    throw new Error(
      `the live page no longer states the Article 3.1 notice ${JSON.stringify(CREDIT)} — ` +
        `re-read the terms; app.config.ts artCredit and og.ts carry this string.`,
    );
  }
}

async function main(): Promise<void> {
  const characters = await loadCharacters();
  const rosterIds = new Set(characters.map((c) => c.id));

  // A key matching no fighter does NOTHING — and nothing is the failure. For
  // BUST_HEAD the fighter falls back to the estimate the row overrides; for
  // LICENCE_EXCLUDED the fighter's asset would be fetched. Checked before any
  // network so a typo fails in under a second.
  for (const [table, keys] of [
    ['BUST_HEAD', Object.keys(BUST_HEAD)],
    ['LICENCE_EXCLUDED', Object.keys(LICENCE_EXCLUDED)],
  ] as const) {
    const orphans = keys.filter((id) => !rosterIds.has(id));
    if (orphans.length) {
      throw new Error(
        `${table} has ${orphans.length} row(s) matching no fighter: ${orphans.join(', ')}. ` +
          `A stale key is not inert.`,
      );
    }
  }

  // ── 1. the page: enumerate, then verify the licence before any asset ────
  const html = await (await get(FANKIT_PAGE)).text();
  checkArticle5(html, characters);
  const kit = enumerateKit(html);
  const ordinals = new Set(kit.map((a) => a.ordinal));
  console.log(
    `▶ ${FANKIT_PAGE}: ${kit.length} captioned cutout(s) over ${ordinals.size} ordinal(s) ` +
      `for a roster of ${characters.length}`,
  );
  if (ordinals.size !== characters.length) {
    throw new Error(
      `the kit numbers ${ordinals.size} fighters and data/characters.json ${characters.length}. ` +
        `The roster is what changed if ArcSys shipped art for a new fighter — run ` +
        `\`npm run data:characters\` and re-read BUST_HEAD for the new row.`,
    );
  }

  // ── 2. ordinal + caption must agree on ONE file per fighter ─────────────
  const assetOf = new Map<string, KitAsset>();
  const problems: string[] = [];
  for (const [i, c] of characters.entries()) {
    const byOrdinal = kit.filter((a) => a.ordinal === i + 1);
    const byBoth = byOrdinal.filter((a) => resolveName(a.caption, characters) === c.id);
    if (byBoth.length !== 1) {
      problems.push(
        `${c.id}: ordinal ${i + 1} lists [${byOrdinal.map((a) => `"${a.caption}"`).join(', ')}], ` +
          `of which ${byBoth.length} caption(s) resolve to this fighter`,
      );
      continue;
    }
    assetOf.set(c.id, byBoth[0]!);
    if (LICENCE_EXCLUDED[c.id]) forbidden.add(byBoth[0]!.url);
  }
  if (problems.length) {
    throw new Error(
      `the kit's ordinal and caption do not agree on one file for ${problems.length} fighter(s):\n` +
        problems.map((p) => `    ${p}`).join('\n'),
    );
  }

  // ── 3. build ─────────────────────────────────────────────────────────────
  const font = loadDisplayFont(
    characters
      .filter((c) => LICENCE_EXCLUDED[c.id])
      .map((c) => c.name.toUpperCase())
      .join(''),
  );
  const rows: ProvenanceRow[] = [];
  const missing: string[] = [];
  for (const c of characters) {
    const asset = assetOf.get(c.id)!;
    const reason = LICENCE_EXCLUDED[c.id];
    if (reason) {
      const tiles = await generatedTiles(c, font);
      rows.push({
        id: c.id,
        ordinal: asset.ordinal,
        caption: asset.caption,
        source: null,
        sourceSha256: null,
        sourceDimensions: null,
        credit: null,
        reason,
        ...tiles,
      });
      console.log(
        `  ${c.id.padEnd(20)} ${tiles.portrait.dimensions.padEnd(9)} GENERATED — ${reason.slice(0, 60)}…`,
      );
      continue;
    }

    // ONE fetch feeds both files.
    let bytes: Buffer;
    try {
      bytes = Buffer.from(await (await get(asset.url)).arrayBuffer());
    } catch (e) {
      missing.push(`${c.id}: ${(e as Error).message}`);
      continue;
    }
    const meta = await sharp(bytes).metadata();
    if (meta.width !== KIT_FRAME || meta.height !== KIT_FRAME || !meta.hasAlpha) {
      missing.push(
        `${c.id}: ${asset.url} is ${meta.width}×${meta.height}${meta.hasAlpha ? '' : ' with no alpha'} ` +
          `— the kit was re-cut; BUST_HEAD was read on ${KIT_FRAME}×${KIT_FRAME} and must be re-read`,
      );
      continue;
    }
    const m = await measure(bytes);
    const portrait = await savePortrait(c, bytes, m, join(ROOT, 'public/img/char', `${c.id}.webp`));
    const splash = await saveSplash(bytes, m, join(ROOT, 'public/img/splash', `${c.id}.webp`));
    rows.push({
      id: c.id,
      ordinal: asset.ordinal,
      caption: asset.caption,
      source: asset.url,
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      sourceDimensions: `${meta.width}×${meta.height}`,
      credit: CREDIT,
      portrait,
      splash,
    });
    console.log(
      `  ${c.id.padEnd(20)} ${portrait.dimensions.padEnd(9)} ${(portrait.figure ?? '').padEnd(66)}` +
        (asset.code !== c.extra?.siteSlug ? `  ← kit code "${asset.code}" ≠ siteSlug` : ''),
    );
  }

  // ── 4. FAIL LOUD ─────────────────────────────────────────────────────────
  if (missing.length) {
    console.error(
      `\n✖ ${missing.length} fighter(s) have no art:\n${missing.map((m) => `    ${m}`).join('\n')}`,
    );
    console.error(
      `\n  Nothing partial was published for them, and nothing generated: the only fighter\n` +
        `  who ships a generated tile is the one the licence excludes (LICENCE_EXCLUDED).`,
    );
    process.exit(1);
  }

  const tableCount = rows.filter((r) => r.portrait.figure?.includes('TABLE')).length;
  const estimated = rows.filter((r) => r.portrait.figure?.includes('estimated')).map((r) => r.id);
  await writeFile(
    join(ROOT, 'data', 'art-provenance.json'),
    `${JSON.stringify(
      {
        source: FANKIT_PAGE,
        credit: CREDIT,
        licenceVerified: LICENCE_VERIFIED,
        fetched: new Date().toISOString().slice(0, 10),
        files: rows,
      },
      null,
      2,
    )}\n`,
  );
  const total = rows.reduce((n, p) => n + p.portrait.bytes + p.splash.bytes, 0);
  console.log(
    `\n✓ ${rows.length} fighter(s) — ${rows.length * 2} files, ${(total / 1024 / 1024).toFixed(1)} MB; ` +
      `${rows.length - Object.keys(LICENCE_EXCLUDED).length} from the kit, ` +
      `${Object.keys(LICENCE_EXCLUDED).length} generated (${Object.keys(LICENCE_EXCLUDED).join(', ')}); ` +
      `heads: ${tableCount} TABLE, ${estimated.length} estimated (${estimated.join(', ')}); ` +
      `provenance in data/art-provenance.json`,
  );
}

main().catch((e: unknown) => {
  console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
