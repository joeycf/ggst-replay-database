/**
 * End-to-end checks against the BUILT static output.
 *
 * Everything here reads `.vercel/output/static/ggst` — what Vercel actually
 * serves — rather than source files or a dev server. Source can be perfect
 * while the build ships the umbrella theme, an unprerendered route, a
 * provenance leak, or a footer that drops a licence notice on phones; those are
 * the failures this catches.
 *
 * ── EMPTY-CORPUS MODE, AND IT SKIPS VISIBLY ──────────────────────────────
 * A build with zero replays is a legitimate state — it is what Stage 1 of a new
 * game produces and what a fresh clone has before the first fetch. The
 * corpus-shaped checks then have nothing to assert on, so they are SKIPPED AND
 * COUNTED, never quietly passed. A suite that reports green on an empty corpus
 * is a suite that will report green on a broken one.
 *
 * ── WHAT THIS FILE ADDS TO THE PORT ──────────────────────────────────────
 * CotW's e2e covered build output, the theme, the data contract and art
 * framing. Five checks below are Strive's own, and each exists because
 * something upstream cannot see the failure:
 *
 *  · THE THEME BATTERY reads the BRACE DEPTH of the winning declaration, not
 *    just its byte offset. "Unlayered" is the actual contract (STACK §5.13) and
 *    an offset comparison cannot tell an unlayered :root from one that happens
 *    to sit late inside @layer utilities.
 *  · THE sourceChannels NAME SYNC compares scripts/channels.ts against
 *    app/app.config.ts. They are two hand-kept lists on SEPARATE TypeScript
 *    tracks — the pipeline tsconfig excludes app/, the Nuxt graph excludes
 *    scripts/ — so no typecheck can relate them, and they DID drift during this
 *    build. The built app is the only place both are visible at once.
 *  · SEGMENT SHAPE: a record with startSeconds and no videoId builds its embed
 *    URL against the record id. Pre-caught on SF6; asserted here on what
 *    shipped.
 *  · summary.json's identity key is `game`, not `id`. CotW shipped `id`, the
 *    apex shell's cutover battery read game=undefined, and the page looked
 *    perfect throughout.
 *  · THE FOOTER ART CREDIT is a LICENCE OBLIGATION, not decoration. Arc System
 *    Works' Fan Kit Article 3.1 requires "© ARC SYSTEM WORKS" in an easily
 *    visible location on any page that shows the art; engine v0.12.1 exists to
 *    render it at EVERY width, and a notice that vanishes on phones is not
 *    easily visible. So the check is on the class attribute, not merely on the
 *    string being present somewhere.
 *
 * Run: npm run test:e2e   (after `npm run build`)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'ggst';
const OUT = join(ROOT, '.vercel', 'output', 'static', SLUG);

let pass = 0;
let fail = 0;
let skipped = 0;
const failures: string[] = [];

const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const skip = (name: string, why: string): void => {
  skipped++;
  console.log(`  ⊘ ${name} — SKIPPED: ${why}`);
};

if (!existsSync(OUT)) {
  console.error(`✖ ${OUT} does not exist. Run \`npm run build\` first.`);
  process.exit(1);
}

const read = (p: string): string => readFileSync(join(OUT, p), 'utf8');
const has = (p: string): boolean => existsSync(join(OUT, p));
const src = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

// ── build output ────────────────────────────────────────────────────────────

console.log('▶ build output\n');
check('index.html prerendered', has('index.html'));
check('stats page prerendered', has('stats/index.html'));
check('characters index prerendered', has('characters/index.html'));
check('players index prerendered', has('players/index.html'));
check('404.html emitted', has('404.html'));
check('sitemap.xml emitted', has('sitemap.xml'));
check('robots.txt emitted', has('robots.txt'));
check('manifest emitted', has('manifest.webmanifest'));
check('OG card shipped', has('og-default.png'));
check('replays.json shipped under the base', has('data/replays.json'));
check('summary.json shipped (the apex selector reads this)', has('data/summary.json'));

// ── the apex card payload's CONTRACT ────────────────────────────────────────
// Both of these shipped wrong on a sibling and neither showed on the page,
// because the selector only reads `replays` for its card count.
//
//  · the identity key is `game`, not `id`. Every sibling emits {"game": …} and
//    the shell's cutover battery asserts payload.game === the game's id.
//  · `updated` is the NEWEST REPLAY's date, never the build time. The cron only
//    commits files that actually changed, so a build-time stamp makes this file
//    differ on every run and puts a deploy on the calendar daily whether or not
//    a single match arrived.
const summary = JSON.parse(read('data/summary.json')) as {
  game?: string;
  id?: string;
  name?: string;
  replays?: number;
  players?: number;
  characters?: number;
  updated?: string;
};
check(
  'summary.json identity key is `game` (the platform contract), not `id`',
  summary.game === SLUG && summary.id === undefined,
  JSON.stringify(summary),
);

// ── the theme override contract (STACK §5.13) ───────────────────────────────
//
// The failure this catches is the one the engine README calls out: an app
// stylesheet written as @theme ships raw, the browser drops it as an unknown
// at-rule, and PRODUCTION SILENTLY WEARS THE UMBRELLA DEFAULTS while `nuxt dev`
// — which compiles each CSS file on its own — looks perfect.
//
// PRESENCE OF THE UMBRELLA DEFAULT IS NOT A FAILURE. The engine ships its
// neutral palette as a FALLBACK inside `@layer theme`, and the game's unlayered
// `:root` wins the cascade over it. That is the documented contract, not a
// leak. What has to hold is the thing the cascade depends on, and it is
// STRUCTURAL rather than positional: an unlayered rule beats a layered one
// wherever it appears, and a layered rule loses even if it appears last. So the
// check reads BRACE DEPTH — ours must sit at depth 1 (a top-level `:root`),
// the umbrella's deeper (inside `@layer theme`).
console.log('\n▶ theme override (the @theme trap, and the layer contract)\n');

/** The stylesheets index.html actually loads, in document order — readdir
 *  order is not the cascade and would make the comparison below meaningless. */
const cssHrefs = [...read('index.html').matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map((m) => m[1])
  .map((href) => href.replace(new RegExp(`^/${SLUG}/`), ''))
  .filter((p) => has(p));
const css = cssHrefs.map((p) => read(p)).join('\n');
check(
  'the home page loads at least one stylesheet',
  cssHrefs.length > 0,
  'no <link rel="stylesheet"> in index.html',
);

/** Nesting depth at `index`, quoted strings skipped. Depth 1 means a top-level
 *  block; anything deeper is inside an at-rule. */
const depthAt = (text: string, index: number): number => {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < index; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return depth;
};

// The 18 engine tokens this game shadows. app/assets/theme.css is the
// authority; the list is READ FROM IT rather than retyped, so adding a token
// there cannot leave this check asserting yesterday's set.
const shadowed = [
  ...new Set(
    [...src('app/assets/theme.css').matchAll(/^ {2}(--color-[a-z-]+):/gm)].map((m) => m[1]),
  ),
];
check(
  'app/assets/theme.css shadows 18 engine --color-* tokens',
  shadowed.length === 18,
  `${shadowed.length}: ${shadowed.join(', ')}`,
);
const missing = shadowed.filter((t) => !css.includes(`${t}:`));
check(
  'every shadowed --color-* token reaches the built CSS',
  missing.length === 0,
  missing.join(', '),
);
check(
  'no raw @theme block shipped (the browser would drop it as an unknown at-rule)',
  !css.includes('@theme'),
  'an @theme at-rule reached the bundle',
);

const OURS = '#d9a53a'; // --color-primary, metallic gold
const UMBRELLA = '#17cfc8'; // the engine's neutral default
const oursAt = css.toLowerCase().lastIndexOf(OURS);
const umbrellaAt = css.toLowerCase().lastIndexOf(UMBRELLA);
check(`the built CSS carries the Strive primary ${OURS}`, oursAt >= 0);
check('the built CSS carries the Strive page bg #0b0d11', css.toLowerCase().includes('#0b0d11'));
check(
  'the Strive :root is UNLAYERED (depth 1) — an @layer rule would lose the cascade',
  oursAt >= 0 && depthAt(css, oursAt) === 1,
  oursAt >= 0 ? `it sits at brace depth ${depthAt(css, oursAt)}` : 'the primary is absent',
);
check(
  'the umbrella default is layered (it is a fallback, not a competitor)',
  umbrellaAt < 0 || depthAt(css, umbrellaAt) > 1,
  `the umbrella primary sits at depth ${umbrellaAt < 0 ? 'n/a' : depthAt(css, umbrellaAt)}`,
);

// ── the 34 accents ──────────────────────────────────────────────────────────
// Accents are the ONE place a game's palette reaches components by character
// id. The engine's plugin injects them through useHead, so they are in the
// PRERENDERED HTML rather than only after hydration — which is what makes them
// checkable here at all.
const characters = JSON.parse(src('data/characters.json')) as {
  id: string;
  accent: string;
  name: string;
}[];
check('roster is non-empty', characters.length > 0, `${characters.length} fighters`);
const home = read('index.html');
const missingAccents = characters.filter(
  (c) => !home.toLowerCase().includes(`--accent-${c.id}:${c.accent.toLowerCase()}`),
);
check(
  `all ${characters.length} accents are injected as --accent-<id> in the prerendered HTML`,
  missingAccents.length === 0,
  missingAccents
    .slice(0, 3)
    .map((c) => `${c.id} ${c.accent}`)
    .join(', '),
);

// ── the sourceChannels NAME SYNC ────────────────────────────────────────────
//
// scripts/channels.ts (pipeline track) and app/app.config.ts (Nuxt track) each
// hold the same nine {id, name} pairs by hand. tsconfig.pipeline.json includes
// only scripts/ and types/; the Nuxt graph includes only app/ — so no compiler
// on this platform can see both, no test in the pipeline can reach the config,
// and the two lists drifted during this build with everything green.
//
// The BUILT app is where they meet: app.config.ts is bundled into the client
// chunk, and the channel list is what SourceBadge names on every card. So the
// assertion is: what the bundle SHIPS must equal what the pipeline DECLARES.
console.log('\n▶ sourceChannels name sync (two hand-kept lists, separate TS tracks)\n');

const declared = [
  ...src('scripts/channels.ts').matchAll(
    /\bid:\s*'([A-Za-z]+)',\s*\n\s*source:\s*'[A-Za-z]+',\s*\n\s*name:\s*'([^']+)'/g,
  ),
].map((m) => ({ id: m[1], name: m[2] }));
const jsChunks = readdirSync(join(OUT, '_nuxt')).filter((f) => f.endsWith('.js'));
const bundleWith = jsChunks.find((f) => read(join('_nuxt', f)).includes('sourceChannels'));
if (!bundleWith) {
  check('the built bundle carries sourceChannels', false, 'no chunk mentions it');
} else if (declared.length === 0) {
  check('scripts/channels.ts yields its {id, name} pairs', false, 'the reader matched nothing');
} else {
  const chunk = read(join('_nuxt', bundleWith));
  const list = /sourceChannels:\s*\[(.*?)\]/s.exec(chunk)?.[1] ?? '';
  const shipped = [
    ...list.matchAll(/\{\s*id:\s*["'`]([^"'`]+)["'`]\s*,\s*name:\s*["'`]([^"'`]+)["'`]\s*\}/g),
  ].map((m) => ({ id: m[1], name: m[2] }));
  check(
    'the built app ships one sourceChannel per pipeline channel',
    shipped.length === declared.length,
    `built ${shipped.length}, pipeline declares ${declared.length}`,
  );
  const drifted = declared.filter((d) => !shipped.some((s) => s.id === d.id && s.name === d.name));
  check(
    `all ${declared.length} channel ids AND display names agree between the two lists`,
    drifted.length === 0,
    drifted
      .map(
        (d) =>
          `${d.id}: pipeline "${d.name}", built "${shipped.find((s) => s.id === d.id)?.name ?? '(absent)'}"`,
      )
      .join(' · '),
  );
}

// ── character art framing ───────────────────────────────────────────────────
//
// Both surfaces that show a fighter crop the image with `object-cover`, and
// neither failure is visible to any other gate: the files exist, the build
// succeeds, the pages render.
//
//  · THE GRID has no framing knob. The engine draws imgPortrait at
//    `aspect-[3/4] w-full object-cover` with no object-position, so the browser
//    centre-crops and the art has to arrive already shaped.
//  · THE HERO is a hard-coded 1440×340 object-cover letterbox. Three things
//    have to hold and each fails silently: the RATIO (a splash off 4.2353:1 is
//    cropped again and loses feet or head with no error anywhere); the ALPHA (a
//    flattened banner paints an opaque box over the engine's diagonal stripe
//    backplate); and the FIT AT THE NARROWEST BREAKPOINT — desktop shows the
//    whole canvas, so desktop can never catch it: at 360×280 the hero shows
//    only 874 of the 2880 columns, and a pose wider than that is clipped on
//    phones only.
//
// All of these assert the SHIPPED ARTEFACTS rather than the source that made
// them, and all are corpus-independent on purpose: art is Stage 1, so they must
// hold in empty-corpus mode, where every record-shaped check below skips.
console.log('\n▶ character art framing\n');
const HERO_RATIO = 1440 / 340;
const NARROW = { w: 360, h: 280 };

const webpsIn = (dir: string): string[] =>
  existsSync(join(OUT, dir)) ? readdirSync(join(OUT, dir)).filter((f) => f.endsWith('.webp')) : [];

const portraits = webpsIn('img/char');
check(
  'portraits shipped for the whole roster',
  portraits.length === characters.length,
  `${portraits.length} files for ${characters.length} fighters`,
);
const offRatio: string[] = [];
for (const f of portraits) {
  const m = await sharp(join(OUT, 'img', 'char', f)).metadata();
  // One pixel of tolerance: 512/0.75 is 682.67, so the integer height is 683
  // and the exact shipped ratio is 0.7496.
  if (Math.abs(m.width / m.height - 0.75) > 0.75 / m.height) {
    offRatio.push(`${f} ${m.width}×${m.height}`);
  }
}
check(
  'every portrait is a 3:4 crop (the grid centre-crops anything else)',
  offRatio.length === 0,
  offRatio.slice(0, 3).join(', '),
);

const splashes = webpsIn('img/splash');
check(
  'splashes shipped for the whole roster',
  splashes.length === characters.length,
  `${splashes.length} files for ${characters.length} fighters`,
);
const offHero: string[] = [];
const opaque: string[] = [];
const clipped: string[] = [];
for (const f of splashes) {
  const img = sharp(join(OUT, 'img', 'splash', f));
  const m = await img.metadata();
  if (Math.abs(m.width / m.height - HERO_RATIO) > HERO_RATIO / m.height) {
    offHero.push(`${f} ${m.width}×${m.height}`);
  }
  if (!m.hasAlpha) opaque.push(f);

  // The visible extent, at alpha > 8 so the soft drop shadow counts too — the
  // pipeline places the body by its NEAR-opaque box (alpha > 200) and this
  // deliberately checks the wider thing the viewer actually sees.
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width;
  let x1 = -1;
  for (let y = 0; y < info.height; y++) {
    const row = y * info.width;
    for (let x = 0; x < info.width; x++) {
      if (data[(row + x) * info.channels + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }
  // object-cover scales to cover, then heroFocus's '100%' aligns the window
  // flush against the source's right edge.
  const scale = Math.max(NARROW.w / m.width, NARROW.h / m.height);
  const windowLeft = Math.round(m.width - NARROW.w / scale);
  if (x0 < windowLeft || x1 > m.width) {
    clipped.push(`${f} [${x0},${x1}] vs window [${windowLeft},${m.width}]`);
  }
}
check(
  'every splash is the hero box ratio 4.2353:1 (or object-cover re-crops it)',
  offHero.length === 0,
  offHero.slice(0, 3).join(', '),
);
check(
  'every splash keeps its alpha (the engine backplate shows through)',
  opaque.length === 0,
  opaque.slice(0, 3).join(', '),
);
check(
  `every body fits the narrowest hero window (${NARROW.w}×${NARROW.h})`,
  clipped.length === 0,
  `${clipped.slice(0, 3).join(', ')} — clipped on phones, invisible on desktop`,
);

// heroFocus is asserted on the RENDERED page, not on app.config.ts: the config
// can be right while the value never reaches the style attribute.
const heroPage = characters.map((c) => `characters/${c.id}/index.html`).find((p) => has(p));
if (heroPage) {
  check(
    'the hero carries an explicit object-position (not the wide-splash default)',
    /object-position:\s*100%\s*50%/.test(read(heroPage)),
    'heroFocus is unset, or did not reach the rendered hero',
  );
} else {
  check('a character page prerendered to carry heroFocus', false, 'no character page in the build');
}

// ── the footer art credit — a LICENCE OBLIGATION ────────────────────────────
//
// Fan Kit Article 3.1 requires "© ARC SYSTEM WORKS" in an easily visible
// location on any page that shows the art. Engine v0.12.1 exists for exactly
// this and renders GameConfig.artCredit in the footer AT EVERY WIDTH — the
// platform © beside it hides below `sm`, the credit does not.
//
// SO THE CHECK IS ON THE CLASS ATTRIBUTE, NOT ON THE STRING. A credit that is
// present but wearing `hidden sm:inline` satisfies a grep and fails the terms.
console.log('\n▶ Fan Kit Article 3.1 — the art credit at every width\n');
const CREDIT = /artCredit:\s*'([^']+)'/.exec(src('app/app.config.ts'))?.[1] ?? '';
check('app.config.ts declares an artCredit', CREDIT.length > 0);
const creditPages = ['index.html', 'characters/index.html', 'stats/index.html', heroPage]
  .filter((p): p is string => !!p && has(p))
  .concat(
    (() => {
      const dir = join(OUT, 'players');
      if (!existsSync(dir)) return [];
      const first = readdirSync(dir).find((d) => existsSync(join(dir, d, 'index.html')));
      return first ? [`players/${first}/index.html`] : [];
    })(),
  );
const creditMissing: string[] = [];
const creditHidden: string[] = [];
for (const p of creditPages) {
  const html = read(p);
  const m = new RegExp(
    `<p class="([^"]*)"><span>${CREDIT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`,
  ).exec(html);
  if (!m) creditMissing.push(p);
  else if (/\bhidden\b|\bsm:|\bmd:|\blg:/.test(m[1])) creditHidden.push(`${p} (${m[1]})`);
}
check(
  `the art credit renders on all ${creditPages.length} sampled page(s)`,
  creditMissing.length === 0,
  creditMissing.join(', '),
);
check(
  'the art credit is NOT width-gated (a notice that vanishes on phones is not "easily visible")',
  creditHidden.length === 0,
  creditHidden.join(', '),
);

// ── the public data contract ────────────────────────────────────────────────

console.log('\n▶ data contract\n');
const replays = JSON.parse(read('data/replays.json')) as {
  id: string;
  sides: { player: string; characters: string[] }[];
  date: string;
  patch?: string;
  source: string;
  videoId?: string;
  startSeconds?: number;
}[];
const EMPTY = replays.length === 0;

if (EMPTY) {
  skip('every record-shaped assertion', 'empty corpus — 0 replays in the build');
} else {
  const raw = read('data/replays.json');
  check(
    'no pipeline provenance in the public payload',
    !/"(provenance|fromTitle|fromIndex|slotOrder|intake|handle|tieBroken)"/.test(raw),
  );
  check(
    'every side has at least one character',
    replays.every((r) => r.sides.every((s) => s.characters.length >= 1)),
  );
  const charIds = new Set(characters.map((c) => c.id));
  const unknown = [...new Set(replays.flatMap((r) => r.sides.flatMap((s) => s.characters)))].filter(
    (c) => !charIds.has(c),
  );
  check(
    'every character id resolves against the roster',
    unknown.length === 0,
    unknown.slice(0, 3).join(', '),
  );
  check(
    'every record carries a patch token',
    replays.every((r) => !!r.patch),
  );
  check('record ids are unique', new Set(replays.map((r) => r.id)).size === replays.length);

  // THE INDEX INTAKE'S TWO RECORD SHAPES. A SEGMENT carries videoId AND
  // startSeconds; a whole-video record carries neither and its id IS the
  // YouTube id. The trap is `...(v.startSeconds ? {…} : {})` written for
  // startSeconds alone, which strips videoId from every offset-zero record and
  // leaves the embed building a URL against the composite id.
  const segments = replays.filter((r) => r.startSeconds !== undefined);
  check(
    'segment records carry BOTH videoId and startSeconds',
    segments.every((r) => typeof r.videoId === 'string' && r.videoId.length === 11),
    'a startSeconds with no videoId would build a URL against the record id',
  );
  const composite = replays.filter((r) => r.id.includes('@'));
  check(
    'every composite id is a segment and vice versa',
    composite.length === segments.length && composite.every((r) => r.startSeconds !== undefined),
    `${composite.length} composite ids vs ${segments.length} segments`,
  );
  check(
    'a whole-video record carries neither field (its id IS the YouTube id)',
    replays
      .filter((r) => !r.id.includes('@'))
      .every((r) => r.startSeconds === undefined && r.videoId === undefined),
  );

  // sourceGroups membership: every emitted source must belong to a group, or
  // its records are unreachable from the filter bar. Read out of app.config.ts
  // rather than restated, for the same reason as the channel list above.
  const groupsBlock =
    /sourceGroups:\s*\[([\s\S]*?)\n {4}\],/.exec(src('app/app.config.ts'))?.[1] ?? '';
  const grouped = new Set([...groupsBlock.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]));
  const ungrouped = [...new Set(replays.map((r) => r.source))].filter((s) => !grouped.has(s));
  check(
    'every emitted source belongs to a sourceGroup',
    ungrouped.length === 0,
    `${ungrouped.join(', ')} — those records cannot be reached from the filter bar`,
  );

  check(
    'summary.json replay count matches the emitted archive',
    summary.replays === replays.length,
    `summary says ${summary.replays}, archive holds ${replays.length}`,
  );
  const newestDay = replays.reduce((n, r) => (r.date > n ? r.date : n), '').slice(0, 10);
  check(
    'summary.json `updated` is the newest replay date, not the build date',
    summary.updated === newestDay,
    `summary says ${summary.updated}, newest replay is ${newestDay}`,
  );

  // A prerendered entity page must contain REAL content, not an empty shell —
  // that is the whole reason the registries are provided rather than fetched.
  const sample = characters[0];
  if (has(`characters/${sample.id}/index.html`)) {
    const html = read(`characters/${sample.id}/index.html`);
    check(
      `/characters/${sample.id} prerenders with a data-derived <title>`,
      /<title>[^<]*\w[^<]*<\/title>/.test(html),
    );
    check(
      `/characters/${sample.id} carries its accent`,
      html.toLowerCase().includes(sample.accent.toLowerCase()),
    );
  } else {
    check(`/characters/${sample.id} prerendered`, false, 'missing from the build');
  }

  const players = JSON.parse(src('data/players.json')) as { id: string }[];
  const p = players[0]?.id;
  check(
    'player pages prerendered (they must not 404 on static hosting)',
    !!p && has(`players/${p}/index.html`),
  );
}

// ── ComboForge cross-link (engine v0.11.0/v0.12.0) ──────────────────────────
console.log('\n▶ partner cross-link\n');
if (!EMPTY && characters.length) {
  const sample = characters.find((c) => c.id === 'sol-badguy') ?? characters[0];
  if (has(`characters/${sample.id}/index.html`)) {
    const html = read(`characters/${sample.id}/index.html`);
    check('character page links to ComboForge', html.includes('comboforge.gg'));
    check(
      'the deep link carries our gameId rather than a bare guess',
      /comboforge\.gg[^"']*gameId=ggst/.test(html),
    );
  }
  check(
    'the Combos nav item is a real <a href> (crawlable, copyable)',
    /href="[^"]*comboforge\.gg[^"]*"/.test(home),
  );
} else {
  skip('ComboForge band assertions', 'empty corpus');
}

console.log(
  `\n${fail === 0 ? '✓' : '✖'} ${pass} passed · ${fail} failed · ${skipped} skipped` +
    (EMPTY ? '  (EMPTY-CORPUS MODE)' : ''),
);
if (failures.length) {
  console.error('\nFailures:\n');
  for (const f of failures) console.error(`  ${f}`);
}
process.exit(fail === 0 ? 0 : 1);
