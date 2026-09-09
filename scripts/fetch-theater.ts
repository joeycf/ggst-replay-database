// Stage 1 for the INDEX intake: pull Replay Theater's Guilty Gear -Strive-
// catalogue, join each entry to the YouTube metadata of the VOD it points at or
// is, and dump the result to raw/replayTheater.json.
//
// Run: npm run data:theater   (and every morning, from the cron)
//      npm run data:theater -- --full          whole-catalogue reconcile; resumes
//                                              a partial sweep if one is cached
//      npm run data:theater -- --fresh         the same, discarding any cache
//      npm run data:theater -- --full --limit=N  read at most N pages and CACHE
//                                              — no dump — so a sweep can be
//                                              driven in pieces
//      npm run data:theater -- --full --allow-shrink   accept a full sweep that
//                                              falls under the record floor
//
// THE BASE IS SF6'S FETCHER, BY DECISION, with CotW's twelve additions ported
// on top (recon/ff-theater.md, "FF ADDED") and every one of the thirteen
// things CotW removed or softened put back (rows A–M there). CotW is the
// newest sibling and the one whose catalogue shape — a whole-video untagged
// arm beside a segment tagged arm — this one shares; but it is a 391-line
// rewrite at 40% of SF6's size, and at this catalogue's scale the things it
// dropped are the things that matter:
//
//   · the cursor-gated dump (theater-delta.ts), or report.md prints the walk
//     length as the day's traffic;
//   · the HARD refusal on a cursor ahead of the catalogue — CotW warns and
//     full-sweeps, and that recovery cannot heal (parse only writes the cursor
//     forward), so a poisoned cursor there means a 442-page sweep against a
//     collaborator's API every morning forever, visible only as a console.warn
//     inside a continue-on-error step;
//   · the partial-resume cache, or a 442-page sweep is uninterruptible;
//   · the full-sweep record floor, or a renamed upstream game label zeroes the
//     dump in silence;
//   · the witness envelope and the cross-check that reads it.
//
// ── WHAT MAKES IT SAFE ─────────────────────────────────────────────────────
// Two rules that hold even when the goodwill does not:
//
//   1. ADD-ONLY. This intake can only ADD records. A committed record is
//      carried whether or not the catalogue still lists it; entries that vanish
//      are COUNTED in report.md, never removed, and the pin only grows.
//   2. THE CRON NEVER DEPENDS ON THIS SUCCEEDING. The step runs LAST and is
//      allowed to fail. On any failure — network, non-200, malformed page, a
//      refused floor — there is simply no dump, parse carries exactly as it
//      does today, and the cron stays green. A bad day upstream costs that
//      day's new entries and nothing else.
//
// replaytheater.app/robots.txt read 2026-09-03 is `User-agent: * / Disallow:`;
// requests carry a contactable user-agent and the catalogue's own 1.2s pacing.
// That is politeness to a collaborator, not rate-limit avoidance.
//
// ── WHAT THIS CATALOGUE IS, AND WHY THE SIZE CHANGES THE DESIGN ────────────
// Measured live 2026-09-07 over the whole catalogue (recon/replay-theater-live.md):
//
//   22,064 entries at the last read, 21,944 four hours earlier — IT MOVES, so
//   nothing here pins the count. ~442 pages of 50. The platform's largest by a
//   wide margin: 6× CotW, 64% of all five prior catalogues combined.
//
//   TAGGED    7,184 entries (32.74%, the highest share on the platform) across
//             509 event tags; 98.6% carry a `t=` offset. SEGMENTS — SF6's shape.
//   UNTAGGED  14,760 entries; 9.9% carry an offset. WHOLE VIDEOS — CotW's shape.
//
// So the record id follows the ENTRY: `${videoId}@${startSeconds}` when there
// is a real offset, the plain YouTube id when there is not. Both arms are
// load-bearing at 8,542 offset rows against 13,402 without — this is not the
// edge case it was on CotW, where the segment arm was 127 rows.
//
// A full sweep is ~442 paced GETs (~9 minutes at 1.2s) plus one videos.list
// unit per 50 distinct videos — 14,928 distinct at the measurement, so ~300
// units. The cursor reads ~2–3 pages on a quiet morning instead.
//
// ── THE DEAD-LINK RATE, AND WHY CotW'S SENTENCE DOES NOT PORT ──────────────
// 9.20% of rows / 12.00% of videos no longer resolve (two stratified samples,
// n=3,054 rows over 2,502 videos, plus a video-uniform n=900, live positive
// controls). NOT age-graded decay: 2025 reads 0.23%, 2026 0.47%, 2022 1.36%,
// 2021 6.43% — and 2023 reads 34.63%. The deaths sit entirely outside the
// tracked-channel corpus (0 dead of 1,571 sampled overlap rows) and cluster in
// contiguous entry-id blocks (206 of 260 probed neighbours also 404). That is a
// per-match channel that submitted its back catalogue and later deleted it — a
// 2023 cliff, not decay. The YouTube join below drops them (absence from
// videos.list IS the dead signal) and the stats file records the RATE; the
// daily cursor window is all recent rows and reads ~0%, so any alarm keyed on
// the daily number is blind and only a --full sweep sees the cliff. Re-measure
// at ingest; the number is not pinned anywhere.

import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHANNEL_BY_ID, stripTheaterSponsor } from './channels';
import { isPlaceholderHandle } from './crosscheck';
import { aliasKey } from './roster';
import { LAUNCH } from './seasons';
import { newerThanCursor } from './theater-delta';
import { fetchVideoMeta, requireApiKey, sleep } from './youtube';
import type { ChannelConfig, ChannelIndex, TheaterRawRecord } from '../types/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_DIR = join(ROOT, 'raw');
/** THE INTAKE. parse builds one record per row of this file. */
const OUT = join(RAW_DIR, 'replayTheater.json');
/** What the pull learned about ITSELF, beside the dump. parse reads it — the
 *  `mode` is LOAD-BEARING there: it is how "committed but absent from the
 *  dump" is told apart between "vanished upstream" (full) and "not in the
 *  pages we read" (cursor). Absent on a run that never pulled, which report.md
 *  states rather than printing 0. */
const STATS = join(RAW_DIR, '.replayTheater.stats.json');
/** EVERY entry of the read window that passed the per-entry game gate, tagged
 *  and untagged, in the catalogue's own shape, inside SF6's envelope. Kept OUT
 *  of the intake file and NOT cursor-gated: this file is the WITNESS — the
 *  cross-check reads it and builds nothing. */
const WITNESS = join(RAW_DIR, 'replayTheater.witness.json');
/** The cursor's committed state — `{ replayTheater: <highest id> }`, the
 *  SIBLING shape keyed by channel id, NOT CotW's `{ highestId }`. Written by
 *  parse on the pull (every data/ write is parse's), only ever forward, and
 *  READ here. A mixed port reads 0 and full-sweeps 442 pages every morning. */
const CURSOR = join(ROOT, 'data', 'theater-cursor.json');
/** Resume cache for a FULL sweep. See "PARTIAL RESUME" below. */
const PARTIAL = join(RAW_DIR, '.replayTheater.partial.json');

const found = CHANNEL_BY_ID.get('replayTheater');
if (!found?.index) throw new Error('replayTheater is not registered as an index channel');
// Re-bound as non-optional so the narrowing survives into main() and the
// signal handler — a closure cannot see a top-level type guard.
const CH: ChannelConfig = found;
const INDEX: ChannelIndex = found.index;

// ── flags ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FRESH = argv.includes('--fresh');
/** THE DAILY PATH is the cursor. `--full` forces the whole-catalogue sweep,
 *  which is what a periodic reconcile wants and what the first run ever must
 *  be: a cursor run against an empty cursor reads its ten-page bound, dumps
 *  500 entries, and reports the bound. */
const FULL = argv.includes('--full') || FRESH;
const CURSOR_MODE = !FULL;
const ALLOW_SHRINK = argv.includes('--allow-shrink');
/** Two clean pages, not one. The catalogue orders `upload_date DESC, id ASC`
 *  (verified across a page boundary on SF6, 2026-08-31), so a day's
 *  submissions can straddle a page boundary and a single clean page is not
 *  proof there is nothing behind it. */
const CLEAN_PAGES_TO_STOP = 2;
/** A hard ceiling on the daily path, so a catalogue-side reordering can never
 *  turn the cron into a sweep. At ~442 pages this bound is 2.3% of the
 *  catalogue — far tighter than CotW's 10-of-70 — and it WILL bite on an
 *  upstream reorder or on a burst (the catalogue took 120 rows in four hours
 *  on 2026-09-07). That is what it is for. Hitting it is reported, not silent:
 *  `hitCursorBound` goes in the stats file, and under add-only nothing is
 *  lost, only late — the reconcile is `npm run data:theater -- --full`. */
const CURSOR_MAX_PAGES = 10;
/** How often a full sweep checkpoints its cache. Every page would be ~440
 *  rewrites of a file that grows to ~8MB; every five bounds a crash's loss to
 *  four pages of re-reads. An interrupt (SIGINT/SIGTERM) flushes regardless. */
const CACHE_EVERY_PAGES = 5;

/** `--limit=N` or `--limit N`: the highest page number this run may read.
 *  A flag that is present must carry a usable number or stop the run —
 *  `Number(undefined)` is NaN, `Math.min(pages, NaN)` is NaN, and the walk
 *  would then silently read page 1 alone. */
const LIMIT = ((): number => {
  const eq = argv.find((a) => a.startsWith('--limit='));
  const bare = argv.indexOf('--limit');
  if (!eq && bare === -1) return Infinity;
  const raw = eq ? eq.slice('--limit='.length) : argv[bare + 1];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`✖ --limit needs a positive integer (got ${JSON.stringify(raw)}).`);
    process.exit(1);
  }
  return n;
})();

/** THE TEST SEAM. The endpoint is committed config (channels.ts) and the live
 *  catalogue moves — 21,944 → 22,064 rows in four hours — so a positive
 *  control that needs two pulls to be byte-identical cannot be run against
 *  it. verify:gates serves a frozen fixture and points this here. Logged
 *  loudly whenever it is in effect, so a stray shell variable cannot quietly
 *  turn the cron into a fixture read. */
const ENDPOINT = process.env.REPLAY_THEATER_ENDPOINT ?? INDEX.endpoint;

const UA = 'replay-database/ggst (+https://github.com/joeycf) data:theater';

requireApiKey('data:theater');

const pct = (n: number, total: number) => (total === 0 ? '0.0' : ((n / total) * 100).toFixed(1));

// ── the index API ───────────────────────────────────────────────────────────

/** One entry exactly as the catalogue publishes it. Everything is nullable:
 *  this is someone else's schema and we do not get to assume. */
interface TheaterEntry {
  id?: number;
  game?: string | null;
  video_link?: string | null;
  tag?: string | null;
  upload_date?: string | null;
  p1_name?: string | null;
  p2_name?: string | null;
  p1_char?: string | null;
  p1_char2?: string | null;
  p1_char3?: string | null;
  p1_char4?: string | null;
  p2_char?: string | null;
  p2_char2?: string | null;
  p2_char3?: string | null;
  p2_char4?: string | null;
}
interface TheaterPage {
  matches?: TheaterEntry[];
  total_count?: number | string;
}

async function getPage(page: number, retries = 4): Promise<TheaterPage> {
  const url = `${ENDPOINT}?game=${encodeURIComponent(INDEX.slug)}&page=${page}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
      if (res.ok) return (await res.json()) as TheaterPage;
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status} (not retryable)\n${await res.text().catch(() => '')}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= retries || msg.includes('not retryable')) {
        throw new Error(`Replay Theater page ${page} failed: ${msg}`, { cause: err });
      }
      const wait = Math.min(1500 * 2 ** (attempt - 1), 10_000);
      console.warn(
        `  ⚠ page ${page} (attempt ${attempt}/${retries}): ${msg}; retrying in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw new Error(`Exhausted retries for page ${page}`);
}

// ── video link → (videoId, startSeconds?) ───────────────────────────────────
//
// THE LINKS ARE CONCATENATED, NOT BUILT. The submission form does
// `video_link = base + "&t=" + t + "s"` regardless of what `base` looks like,
// so a youtu.be submission produces `https://youtu.be/<id>&t=554s` — a PATH
// with no query string at all. 686 of this catalogue's links are that shape,
// 53× CotW's 13 and more than 2XKO's 463. A URL-parsing extractor reads the id
// as "abcdefghijk&t=554s"; this matches the id SHAPE explicitly and refuses
// anything else rather than guessing.
const VIDEO_ID =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/(?:live|shorts|embed)\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;
// GLOBAL, and the LAST match wins. The form appends its own offset last, so an
// earlier `t=` is whatever the submitter's clipboard carried in — a share link
// already carrying a timestamp. SF6 found five entries on one VOD reading
// `...&t=747s&pp=...&t=0s|293s|847s|1267s`; first-wins collapses all five.
const START_ALL = /[?&]t=([^&#]*)/g;
const START_VALUE = /^(\d+)s?$/;

interface Link {
  videoId: string;
  /** Absent when the entry carried no `t=` or a `t=0`: the record is then the
   *  WHOLE video, which is the engine's own reading of a missing startSeconds
   *  and the shape 13,402 of this catalogue's rows take. */
  startSeconds?: number;
  /** How many `t=` params the link carried; >1 is worth seeing in recon. */
  tCount: number;
}

function parseLink(link: string): Link | { error: string } {
  const id = VIDEO_ID.exec(link ?? '');
  if (!id) return { error: 'no extractable YouTube id' };
  const values = [...(link ?? '').matchAll(START_ALL)].map((m) => m[1] ?? '');
  if (values.length === 0) return { videoId: id[1]!, tCount: 0 };
  const last = values[values.length - 1]!;
  const m = START_VALUE.exec(last);
  // A `t=` we cannot read is NOT the same as no `t=`. Falling through to
  // "whole video" would publish a three-hour VOD as one match and render
  // exactly like a correct record.
  if (!m) return { error: `unreadable t= value ${JSON.stringify(last)}` };
  const secs = Number(m[1]);
  return secs > 0
    ? { videoId: id[1]!, startSeconds: secs, tCount: values.length }
    : { videoId: id[1]!, tCount: values.length };
}

/** THE RECORD ID FOLLOWS THE ENTRY. `vid@start` for a real offset, the bare
 *  video id otherwise. Both arms are load-bearing (types/index.ts
 *  ChannelIndex): `vid@0` for a whole video could never dedupe by id against
 *  the same upload arriving from a channel, and a bare id for a segment would
 *  collapse a VOD's nine matches into one. */
const recId = (l: Link): string =>
  l.startSeconds === undefined ? l.videoId : `${l.videoId}@${l.startSeconds}`;

/** A side's declared fighters, in slot order, blanks dropped. Four columns are
 *  read and the length is OBSERVED, never assumed: 70 of 21,944 entries use a
 *  second column (0.319%), 5 a third — a counter-pick inside a set. */
const chars = (e: TheaterEntry, side: 1 | 2): string[] =>
  ([`p${side}_char`, `p${side}_char2`, `p${side}_char3`, `p${side}_char4`] as const)
    .map((k) => (e as unknown as Record<string, unknown>)[k])
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map((c) => c.trim());

// ── chapters, derived from the description (RECON ONLY) ────────────────────
//
// This produces no field and gates nothing. It is the trust measurement this
// intake was admitted on — the catalogue's offsets against the uploaders' own
// chapter markers — re-run on every pull rather than trusted from the day it
// was first taken. Measured 2026-09-07 on 150 VODs: 94.2% of offsets within
// 30s of a chapter, 88.8% exact, median delta 0s. Handle agreement read 86.5%
// RAW and the residue was two benign classes — sponsor prefixes (`AHS |
// Crantum` vs `Crantum`) and one-sided chapters (`Sol vs. lastcody (May)`) —
// so BOTH the raw and the sponsor-stripped figure are printed here; the raw
// one is a floor, not the answer.
//
// READ THE OFFSET NUMBER PER VOD SHAPE. Uploaders chapter per SET; the
// catalogue logs 157 of its 668 multi-row VODs game by game (recon §6), and on
// those only a set's first game can sit on a chapter start. Control run
// 2026-09-08 over the 43-row Combo Breaker 2025 Top 8 VOD: 45 offsets inside
// a chapter, 10 within 30s, 1 exact — and 14 of 14 matchup chapters agreeing
// on both handles. A low within-30s figure with high handle agreement is
// game-logging, not drift.
//
// The rule YouTube applies: timestamped lines, at least three, the first at
// 0:00. The last test matters — a description that merely mentions a time is
// not a chapter list.
const CHAPTER_LINE =
  /^\s*(?:\[|\()?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\]|\))?\s*[-–—:|]?\s*(.+?)\s*$/;

interface Chapter {
  start: number;
  title: string;
}

function chaptersOf(description: string): Chapter[] {
  const out: Chapter[] = [];
  for (const line of (description ?? '').split('\n')) {
    const m = CHAPTER_LINE.exec(line);
    if (!m) continue;
    const [, a, b, c, title] = m;
    const start = c ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
    if (title?.trim()) out.push({ start, title: title.trim() });
  }
  if (out.length < 3 || out[0]!.start !== 0) return [];
  return out.sort((x, y) => x.start - y.start);
}

// ── PARTIAL RESUME ──────────────────────────────────────────────────────────
//
// A 442-page sweep has to be interruptible, and a resumed sweep has to produce
// THE SAME DUMP an uninterrupted one would — byte for byte — or the resume is
// a second source of truth. Three things make that hold:
//
//   1. The cache is the raw pages as served, keyed by entry id and by page
//      number. Resuming re-fetches page 1 (the cursor bound and total_count
//      live there) and then only the pages not yet cached.
//   2. Nothing downstream depends on READ ORDER. The catalogue is sorted by
//      entry id before any processing, every tie-break below is total, and the
//      dump carries no timestamp and no per-process counter.
//   3. `pagesRead` in the stats and the witness is the number of pages the
//      dump is DRAWN FROM (cached + fetched), not the number this process
//      fetched; `pagesFetched` carries the latter for the log.
//
// THE POSITIVE CONTROL (verify:gates, against a frozen fixture endpoint via
// REPLAY_THEATER_ENDPOINT): `--full --limit=2` caches two pages and writes no
// dump; `--full` resumes at page 3 and writes the dump; `--fresh` discards the
// cache and writes it again from scratch; the two dumps must compare equal
// with `cmp`, and so must the two witness files. A SIGTERM mid-walk is the
// same control by another door — the handler below flushes the cache first.
//
// WHAT A PAGE-NUMBER CACHE CANNOT PROMISE, stated rather than hidden. The
// catalogue grows at the FRONT, so between the two halves every cached page
// shifts down by however many entries arrived; that costs re-reads at the seam
// and loses nothing (new pages 2..N cover only ranks the cache already holds).
// A DELETION upstream between the halves shifts entries UP, and up to that
// many entries can slide from the first unread page onto the last cached one,
// where this run will not look. Under add-only that is late, never lost — the
// next --fresh collects it — and the stats say `resumed: true` so a stitched
// sweep is never mistaken for a clean one. SF6 retired this cache for the
// daily path because a page-number cache against a front-growing catalogue
// skipped real pages there; that failure needs the cache to outlive a
// successful run, and here a completed full sweep deletes it.
//
// The cache is REFUSED, not merely ignored, when it was cut from a different
// slug or game label: a Tōkon `--full` once resumed a cache left over from an
// era when this endpoint returned everything and wrote 15,286 SF6 rows into a
// 266-entry witness.
interface PartialCache {
  slug: string;
  gameLabel: string;
  /** The newest id on page 1 when the cache was cut — for the log, so the
   *  seam's drift is visible. */
  newestOnPage1: number;
  pages: number[];
  entries: TheaterEntry[];
}

const byTheaterId = new Map<number, TheaterEntry>();
const seenPages = new Set<number>();
let cacheNewestOnPage1 = 0;
let walking = false;

const cacheShape = (): PartialCache => ({
  slug: INDEX.slug,
  gameLabel: INDEX.gameLabel,
  newestOnPage1: cacheNewestOnPage1,
  pages: [...seenPages].sort((a, b) => a - b),
  entries: [...byTheaterId.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => e),
});

const flushCache = (): void => {
  writeFileSync(PARTIAL, JSON.stringify(cacheShape()), 'utf8');
};

// Flush on interrupt, synchronously, then exit with the conventional code. A
// SIGKILL cannot be caught and loses at most CACHE_EVERY_PAGES - 1 pages.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (FULL && walking) {
      flushCache();
      console.error(
        `\n  interrupted by ${sig} — cached ${seenPages.size} page(s), ${byTheaterId.size} entr(ies). ` +
          `Resume with: npm run data:theater -- --full`,
      );
    }
    process.exit(sig === 'SIGINT' ? 130 : 143);
  });
}

// ── the pull ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });

  // CLEAR THE PREVIOUS RUN'S ARTIFACTS BEFORE FETCHING ANYTHING. parse reads
  // the stats file to learn what this pull did — its mode, its page count, the
  // cursor it reached — and a file left over from yesterday would answer those
  // questions about the wrong run: a pull that dies on the first request would
  // otherwise leave parse reading "the pull found no new entries" instead of
  // "no pull this run", and re-advancing the cursor off a number this run
  // never observed. The dump goes too, so a failed local pull looks exactly
  // like a failed CI pull (rule 2: no dump), rather than leaving yesterday's
  // rows beside no stats to describe them. Invisible in CI, where a fresh
  // checkout has no raw/ at all — which is exactly why it is done here.
  await rm(STATS, { force: true });
  await rm(WITNESS, { force: true });
  await rm(OUT, { force: true });

  if (ENDPOINT !== INDEX.endpoint) {
    console.warn(
      `  ⚠ REPLAY_THEATER_ENDPOINT is set — reading ${ENDPOINT}, not the live catalogue`,
    );
  }

  // THE CURSOR. Entry ids increase with submission and the feed is newest-first,
  // so "have I seen everything new?" is answerable from the front of the feed:
  // keep paging until CLEAN_PAGES_TO_STOP consecutive pages offer no id above
  // the cursor.
  //
  // WHY NOT `?since=` OR A REAL CURSOR: there isn't one. Probed on SF6
  // 2026-08-31 — `since`, `limit`, `per_page`, `sort`, `order` and `after_id`
  // are all accepted and silently IGNORED. Only `game` and `page` are honoured,
  // and `game` is validated (`ggst`, `gg`, `guiltygear`, `ggs` all return HTTP
  // 400 "Invalid game"; the slug is `strive`), so the per-entry game gate below
  // is a second line, not the only one.
  //
  // WHAT THE CURSOR CANNOT SEE, stated rather than hidden: the ordering key is
  // the VIDEO's upload date, not the submission's. Someone submitting a 2022
  // VOD today lands deep in the feed, behind the bound, and this run will not
  // reach it. Under add-only that is late, never lost — the entry keeps its id
  // and a --full sweep collects it.
  const cursorFile = await readFile(CURSOR, 'utf8')
    .then((t) => JSON.parse(t) as Record<string, number>)
    .catch(() => ({}) as Record<string, number>);
  const cursorAt = Number(cursorFile[CH.id] ?? 0) || 0;

  let resumed = false;
  if (FRESH) {
    await rm(PARTIAL, { force: true });
  } else if (FULL && existsSync(PARTIAL)) {
    const cache = JSON.parse(await readFile(PARTIAL, 'utf8')) as Partial<PartialCache>;
    if (cache.slug !== INDEX.slug || cache.gameLabel !== INDEX.gameLabel) {
      console.warn(
        `  ⚠ ignoring raw/.replayTheater.partial.json: cut for game=${JSON.stringify(cache.slug)} ` +
          `${JSON.stringify(cache.gameLabel)}, this run is game=${INDEX.slug} ${JSON.stringify(INDEX.gameLabel)}`,
      );
      await rm(PARTIAL, { force: true });
    } else {
      for (const p of cache.pages ?? []) if (Number.isInteger(p) && p >= 1) seenPages.add(p);
      for (const e of cache.entries ?? []) if (typeof e.id === 'number') byTheaterId.set(e.id, e);
      cacheNewestOnPage1 = Number(cache.newestOnPage1 ?? 0) || 0;
      resumed = seenPages.size > 0;
      if (resumed) {
        console.log(
          `  resuming a partial sweep: ${seenPages.size} page(s), ${byTheaterId.size} entr(ies) cached`,
        );
      }
    }
  } else if (CURSOR_MODE && existsSync(PARTIAL)) {
    console.log(
      '  (a partial full-sweep cache is present and untouched by this cursor run; ' +
        '`--full` resumes it, `--fresh` discards it)',
    );
  }

  console.log(`\n▶ Pulling the Replay Theater index (${ENDPOINT}, game=${INDEX.slug})…`);
  const first = await getPage(1);

  // ── THE CURSOR CANNOT BE AHEAD OF THE CATALOGUE ───────────────────────────
  // Page 1 holds the newest entries, so the highest id ON IT is the highest id
  // the catalogue has. A committed cursor above that is not "nothing new today"
  // — it is impossible, and it is SILENT: every page reads as clean, the stop
  // rule fires after two, and this intake never ingests another entry for as
  // long as the file says so. The cron stays green the whole time.
  //
  // Not hypothetical. On 2026-09-01 a verification harness wrote synthetic
  // maxEntryId values (900002) into data/theater-cursor.json through the real
  // parse path in three repos and restored raw/ afterwards, not data/. Nothing
  // anywhere would have said a word.
  //
  // REFUSE RATHER THAN CLAMP, AND RATHER THAN FALL BACK. CotW warns and runs a
  // full sweep instead; that recovery cannot heal, because parse only writes
  // the cursor when the pull's highest id is ABOVE the committed one, and a
  // real sweep's highest id never is. So a poisoned cursor there is a 442-page
  // sweep every morning forever, and the only trace is a console.warn inside a
  // continue-on-error step that is already expected to be yellow. Here it is
  // red until a human fixes the file, on the daily path AND on --full, because
  // --full is exactly the run that would otherwise mask it.
  const newestOnPage1 = (first.matches ?? []).reduce((m, e) => Math.max(m, e.id ?? 0), 0);
  if (cursorAt > 0 && newestOnPage1 > 0 && cursorAt > newestOnPage1) {
    console.error(
      [
        `\n✖ The committed cursor is AHEAD of the catalogue.`,
        ``,
        `  data/theater-cursor.json  ${cursorAt}`,
        `  newest id on page 1       ${newestOnPage1}`,
        ``,
        `  Page 1 is the newest entries, so nothing in the catalogue can be above it.`,
        `  Left alone this is silent: every page reads as already-seen, the pull stops`,
        `  after two, and this intake never ingests again while the file says so.`,
        ``,
        `  Set data/theater-cursor.json to the highest id this repo has actually SEEN`,
        `  — the maxEntryId of its last full sweep — and re-run. If in doubt, 0 is`,
        `  always safe: a full sweep re-reads everything and the intake is add-only.`,
      ].join('\n'),
    );
    process.exit(1);
  }
  if (resumed && cacheNewestOnPage1 > 0 && cacheNewestOnPage1 !== newestOnPage1) {
    console.log(
      `  the catalogue moved since the cache was cut (page-1 newest ${cacheNewestOnPage1} → ${newestOnPage1}); ` +
        `pages re-read at the seam, and a deletion in between stays invisible until --fresh`,
    );
  }
  cacheNewestOnPage1 = newestOnPage1;

  const total = Number(first.total_count ?? 0) || 0;
  const fullPages = Math.ceil(total / INDEX.pageSize);
  const pages = CURSOR_MODE
    ? Math.min(CURSOR_MAX_PAGES, fullPages, LIMIT)
    : Math.min(fullPages, LIMIT);
  console.log(
    CURSOR_MODE
      ? `  catalogue reports ${total} match(es) (${fullPages} page(s) of ${INDEX.pageSize}); cursor at entry id ${cursorAt || '—'}, reading at most ${pages}`
      : `  catalogue reports ${total} match(es) → ${pages} of ${fullPages} page(s) of ${INDEX.pageSize}`,
  );
  let noId = 0;
  const add = (rows: TheaterEntry[]): void => {
    for (const e of rows) {
      if (typeof e.id === 'number') byTheaterId.set(e.id, e);
      else noId++;
    }
  };
  add(first.matches ?? []);
  seenPages.add(1);

  // cleanRun is SEEDED FROM PAGE 1, as SF6 does. CotW starts it at 0 and never
  // lets page 1 count, so a fully quiet morning there is always three pages;
  // here it is two, which is the number the stop rule was argued for.
  let cleanRun = (first.matches ?? []).some((e) => (e.id ?? 0) > cursorAt) ? 0 : 1;
  let pagesFetched = 1;
  let stoppedEarly = false;
  walking = true;
  for (let page = 2; page <= pages; page++) {
    if (CURSOR_MODE && cleanRun >= CLEAN_PAGES_TO_STOP) {
      stoppedEarly = true;
      break;
    }
    if (seenPages.has(page)) continue;
    await sleep(INDEX.pacingMs);
    const body = await getPage(page);
    const rows = body.matches ?? [];
    add(rows);
    seenPages.add(page);
    pagesFetched++;
    cleanRun = rows.some((e) => (e.id ?? 0) > cursorAt) ? 0 : cleanRun + 1;
    // An empty page is the end of the catalogue, not a clean page to count.
    if (rows.length === 0) {
      stoppedEarly = true;
      break;
    }
    if (FULL && (page % CACHE_EVERY_PAGES === 0 || page % 50 === 0)) {
      flushCache();
      if (page % 50 === 0) console.log(`  page ${page}/${pages} — ${byTheaterId.size} entr(ies)`);
    }
  }
  walking = false;
  if (CURSOR_MODE && cleanRun >= CLEAN_PAGES_TO_STOP) stoppedEarly = true;
  // Checkpoint once more at the END of the walk. The join below is ~300
  // videos.list calls on a full sweep, and the signal handler above only
  // flushes while walking — so an interrupt or a quota error during the join
  // would otherwise resume with up to CACHE_EVERY_PAGES - 1 pages of re-reads.
  // With the cache complete, the resume re-fetches page 1 and goes straight to
  // the join. A completed sweep still retires the cache at the very end.
  if (FULL) flushCache();

  // ── a PARTIAL sweep stops here, with the cache and without a dump ─────────
  // A truncated full sweep written as a dump would be a lie in either mode
  // label: as `full`, parse would read every committed row it does not contain
  // as vanished upstream; as `cursor`, the delta gate would apply to a window
  // it was never meant for. So --limit on the full path is a checkpoint, not a
  // deliverable. Exit 0: the run did what it was asked.
  if (FULL && pages < fullPages && !stoppedEarly) {
    flushCache();
    console.log(
      `\n  partial sweep: ${seenPages.size} of ${fullPages} page(s) cached (${byTheaterId.size} entr(ies)), no dump written.\n` +
        `  Resume with: npm run data:theater -- --full`,
    );
    return;
  }

  // EVERYTHING BELOW IS ORDER-INDEPENDENT. Sorted by the catalogue's own entry
  // id — a total order that does not depend on which pages were cached and
  // which were fetched — so a resumed sweep and a clean one process identical
  // sequences.
  const catalogue = [...byTheaterId.values()].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  /** The highest id THIS RUN observed, pre-game-gate: the cursor is a position
   *  in the feed and a wrong-game row it passed was still passed. 0 if the
   *  window was empty. parse writes it into the cursor file when it is above
   *  the committed value (CotW's addition: on the PULL, never on the rebuild). */
  const highestId = catalogue.reduce((m, e) => Math.max(m, e.id ?? 0), 0);
  /** The cursor this run reached — SF6's semantics, seeded with the committed
   *  cursor so a bounded window cannot report a value below it. */
  const maxEntryId = Math.max(highestId, cursorAt);
  const hitBound = CURSOR_MODE && !stoppedEarly && pagesFetched >= pages && fullPages > pages;
  console.log(
    CURSOR_MODE
      ? `  read ${pagesFetched} page(s), ${catalogue.length} entr(ies); ${catalogue.filter((e) => (e.id ?? 0) > cursorAt).length} newer than the cursor → new cursor ${maxEntryId}`
      : `  ${catalogue.length} unique entr(ies) over ${seenPages.size} page(s)${resumed ? ` (${pagesFetched} fetched this run, the rest resumed)` : ''}`,
  );
  if (noId)
    console.log(
      `  ⚠ ${noId} row(s) carried no entry id and were dropped — not resumable, not cursorable`,
    );
  if (hitBound) {
    console.warn(
      `  ⚠ the cursor hit its ${pages}-page bound without going quiet — entries may be\n` +
        `    unreached this run. Nothing is lost (add-only); run \`npm run data:theater -- --full\`\n` +
        `    to reconcile. Recorded as hitCursorBound in the stats file.`,
    );
  }

  // ── the game gate, PER ENTRY ──────────────────────────────────────────────
  // `?game=strive` is a query someone else answers, and an index is a strictly
  // weaker guarantee than a channel: a mistagged submission would arrive
  // looking exactly like a real one. Every entry states its own game, so check
  // that instead of the query — exactly, against the committed label. 21,944 of
  // 21,944 passed on 2026-09-07.
  const wrongGame = catalogue.filter((e) => (e.game ?? '').trim() !== INDEX.gameLabel);
  const rightGame = catalogue.filter((e) => (e.game ?? '').trim() === INDEX.gameLabel);
  if (wrongGame.length) {
    console.log(
      `  ⚠ ${wrongGame.length} entr(ies) rejected — entry.game is not ${JSON.stringify(INDEX.gameLabel)}:`,
    );
    for (const e of wrongGame.slice(0, 5)) {
      console.log(`      #${e.id} game=${JSON.stringify(e.game)} ${e.video_link ?? ''}`);
    }
    if (wrongGame.length > 5) console.log(`      … ${wrongGame.length - 5} more`);
  }

  // ── scope: IN CURSOR MODE, ONLY WHAT IS NEWER THAN THE CURSOR ─────────────
  // See theater-delta.ts. The walk window is fixed-size whether or not anything
  // in it is new; an ungated dump makes the intake's reported number a function
  // of the walk length.
  const delta = newerThanCursor(rightGame, CURSOR_MODE, cursorAt);

  // ── scope: WHICH ARMS ENTER THE INTAKE — read off the config, not assumed ─
  // `admitUntagged` (channels.ts) decides whether the untagged arm is a SOURCE
  // here or only a witness. On CotW the flag was set, typed and documented and
  // NOTHING READ IT (recon/ff-theater.md row M): the fetcher admitted both arms
  // unconditionally, so flipping it would have changed nothing. Here it gates
  // what gets BUILT and nothing else — the witness, written below from
  // `rightGame`, holds both arms regardless, because evidence is not the same
  // question as ingestion. With it true, parse's known-anywhere ignore is what
  // keeps the untagged arm from re-minting our own uploads: 11,604 of its
  // 14,760 rows point at a tracked channel's video (recon/replay-theater-live.md §5).
  const isTagged = (e: TheaterEntry): boolean => (e.tag ?? '').trim() !== '';
  const inScope = INDEX.admitUntagged ? delta : delta.filter(isTagged);
  const taggedInDelta = delta.filter(isTagged).length;
  console.log(
    `  ${delta.length} entr(ies)${CURSOR_MODE ? ` newer than the cursor, of ${rightGame.length} read` : ''}: ` +
      `${taggedInDelta} tagged, ${delta.length - taggedInDelta} untagged` +
      (INDEX.admitUntagged
        ? ' — both arms admitted (admitUntagged)'
        : ` — untagged arm is witness only (admitUntagged: false), ${inScope.length} in scope`),
  );

  // ── links ─────────────────────────────────────────────────────────────────
  // COUNTED, NOT FATAL. SF6 exits on one unusable link, which is right when the
  // catalogue has none and would fail every run of this one: the malformed
  // youtu.be shape alone is 686 rows here, and while the id regex reads those,
  // a catalogue this size will always carry a handful of links no reader
  // should guess at. A bad link costs its own row and nothing else; the count
  // is in the stats file and five examples are in the log.
  const linked: Array<{ e: TheaterEntry; link: Link }> = [];
  const badLinks: Array<{ e: TheaterEntry; why: string }> = [];
  for (const e of inScope) {
    const got = parseLink(e.video_link ?? '');
    if ('error' in got) badLinks.push({ e, why: got.error });
    else linked.push({ e, link: got });
  }
  if (badLinks.length) {
    console.log(
      `  ⚠ ${badLinks.length} entr(ies) have an unusable video link — dropped, not guessed:`,
    );
    for (const u of badLinks.slice(0, 5)) {
      console.log(`      #${u.e.id} ${u.why} — ${JSON.stringify(u.e.video_link)}`);
    }
    if (badLinks.length > 5) console.log(`      … ${badLinks.length - 5} more`);
  }

  // ── the same match, submitted twice ───────────────────────────────────────
  //
  // The record id is unique by construction, so two entries sharing one would
  // be two records competing for it and one silently overwriting the other.
  // SF6 found 35 of these with ONE cause — the same event submitted twice under
  // two tag spellings — and collapses them first, deterministically, then
  // exits on anything left. Here the tie is broken on the tag spelling and
  // then on the ENTRY ID, so the survivor never depends on read order (a
  // resumed sweep must collapse the same way a clean one does).
  //
  // WHAT IS LEFT IS COUNTED, NOT FATAL. Measured 2026-09-07: four genuine
  // collisions, three of them true duplicates and ONE A REAL DATA ERROR — VOD
  // `tmyR-G1zxqs` has RT #292436 `UA Rang13 (Goldlewis) vs Kal (Nagoriyuki)`
  // and #292437 `TempestNYC (Leo) vs Consomme (Potemkin)` at the same EVO
  // Japan 2024 offset. Two different matches at one offset is upstream's to
  // fix, not a reason to refuse 22,000 rows every morning; the lower entry id
  // survives, the loser is counted, and the report names the count.
  const byKey = new Map<string, Array<{ e: TheaterEntry; link: Link }>>();
  for (const l of linked) {
    const key = recId(l.link);
    byKey.set(key, [...(byKey.get(key) ?? []), l]);
  }
  const deduped: Array<{ e: TheaterEntry; link: Link }> = [];
  const collapsedTags = new Map<string, number>();
  let collapsed = 0;
  const collisions: string[] = [];
  const matchKey = (e: TheaterEntry): string =>
    [
      (e.p1_name ?? '').trim(),
      (e.p2_name ?? '').trim(),
      chars(e, 1).join('/'),
      chars(e, 2).join('/'),
    ].join(' ');
  for (const [key, group] of byKey) {
    if (group.length === 1) {
      deduped.push(group[0]!);
      continue;
    }
    const sorted = [...group].sort(
      (a, b) =>
        (a.e.tag ?? '').trim().localeCompare((b.e.tag ?? '').trim()) ||
        (a.e.id ?? 0) - (b.e.id ?? 0),
    );
    const sameMatch = group.every((g) => matchKey(g.e) === matchKey(group[0]!.e));
    if (sameMatch) {
      deduped.push(sorted[0]!);
      collapsed += group.length - 1;
      const pair = [...new Set(group.map((g) => (g.e.tag ?? '').trim()))].sort().join('  ||  ');
      collapsedTags.set(pair, (collapsedTags.get(pair) ?? 0) + group.length - 1);
      continue;
    }
    collisions.push(
      [
        `  ${key}`,
        ...sorted.map(
          (g) => `    #${g.e.id}  ${g.e.p1_name} vs ${g.e.p2_name}  [${(g.e.tag ?? '').trim()}]`,
        ),
      ].join('\n'),
    );
    deduped.push([...group].sort((a, b) => (a.e.id ?? 0) - (b.e.id ?? 0))[0]!);
  }
  if (collapsed > 0) {
    console.log(
      `\n  collapsed ${collapsed} double-submitted entr(ies) — same match, two submissions:`,
    );
    for (const [pair, n] of [...collapsedTags].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`      ${n}×  ${pair || '(untagged)'}`);
    }
  }
  if (collisions.length) {
    console.log(
      `\n  ⚠ ${collisions.length} record-id collision(s) the collapse cannot explain — two different matches ` +
        `at one id; the lower entry id survives, the rest are counted:`,
    );
    console.log(collisions.slice(0, 5).join('\n'));
    if (collisions.length > 5) console.log(`      … ${collisions.length - 5} more`);
  }

  // ── join to the VODs ──────────────────────────────────────────────────────
  // LIVENESS IS THIS JOIN. videos.list silently omits a deleted or private id,
  // so absence from the map IS the dead signal — no HEAD, no oEmbed. Reported
  // as a RATE, never enumerated: at 9.20% of a full sweep that would be ~2,000
  // log lines, and the shape (a 2023 cliff, see the header) is a fact about the
  // source, not a list to read.
  const vodIds = [...new Set(deduped.map((l) => l.link.videoId))].sort();
  console.log(`\n▶ Resolving ${vodIds.length} video(s) on YouTube…`);
  const vods = await fetchVideoMeta(vodIds);
  const missing = vodIds.filter((id) => !vods.has(id));
  const unresolvablePct = vodIds.length
    ? Number(((missing.length / vodIds.length) * 100).toFixed(1))
    : 0;

  const records: TheaterRawRecord[] = [];
  for (const { e, link } of deduped) {
    const vod = vods.get(link.videoId);
    if (!vod) continue; // unresolvable video — counted above, never built
    const c1 = chars(e, 1);
    const c2 = chars(e, 2);
    // TRIMMED, AND OTHERWISE VERBATIM. 43 rows across 3 tags carry a trailing
    // newline and an untrimmed tag keys a phantom event; 3 more spelling groups
    // (STRIVE CUP / StriveCup / STRIVECUP) collapse only under parse's key
    // normalisation, which is parse's to apply. Ten tags and one p2_name carry
    // an interior U+3000 IDEOGRAPHIC SPACE — String.prototype.trim strips it
    // only at the ends, and roster.ts normalizeText folds the interior ones to
    // a plain space downstream. Handles keep their sponsor prefixes for the
    // parser to strip, and the 645 placeholder handles (`Unknown Player`, `GG
    // Player`, …) pass through untouched: dropping them is parse's rule, and a
    // dump that silently strips rows cannot be audited against the catalogue.
    const tag = String(e.tag ?? '').trim();
    const p1 = String(e.p1_name ?? '').trim();
    const p2 = String(e.p2_name ?? '').trim();
    records.push({
      id: recId(link),
      channel: 'replayTheater',
      // SYNTHESIZED — the catalogue carries no title. It follows this corpus's
      // dominant ▰ grammar ("GGST ▰ HANDLE (Char) vs HANDLE (Char)", the
      // handle-outside shape channels.ts declares for this intake) so cards
      // read consistently, and it carries the event tag in the trailing slot
      // because `title` is the engine's search haystack: that placement is what
      // makes "Combo Breaker 2025 Top 8" findable with no new facet, field or
      // render surface.
      title:
        `GGST ▰ ${p1 || '?'} (${c1.join('/')}) vs ${p2 || '?'} (${c2.join('/')})` +
        (tag ? ` ▰ ${tag}` : ''),
      description: '',
      // The VOD's real publish time. Deliberately NOT offset by startSeconds:
      // that would shift a record by up to eleven hours (the deepest offset
      // here is 11:30:20 into an EVO 2022 stream) and could cross a day-grained
      // patch boundary, which is the authority season and patch are derived
      // from. Segments inside one VOD therefore share a timestamp, which is why
      // the sort below carries a tie-break.
      publishedAt: vod.publishedAt,
      // The catalogue publishes no per-match duration. For a whole-video entry
      // the video's own duration IS the record's (CotW's addition); for a
      // segment there is nothing honest to derive one from — the gap to the
      // next entry includes the downtime between them — so 0 means unknown and
      // emit omits it. That lands on 8,542 records here, not CotW's 127, so
      // anything downstream that lists zero-duration records must print a rate.
      durationSec: link.startSeconds === undefined ? vod.durationSec : 0,
      // The VOD's own value, not a constant: an entry pointing at a stream that
      // is still live is footage parse should exclude, and 'none' would hide it.
      liveBroadcastContent: vod.liveBroadcastContent,
      theaterId: e.id!,
      videoId: link.videoId,
      ...(link.startSeconds !== undefined ? { startSeconds: link.startSeconds } : {}),
      tag,
      uploader: vod.uploader,
      players: [p1, p2],
      characters: [c1, c2],
    });
  }

  // Stable, TOTAL order: newest VOD first, then by offset within the VOD, then
  // by id. Segments inside one VOD share a publishedAt, so a comparator without
  // the final tie-break would be free to return a different permutation per
  // run — and a resumed sweep that changed nothing would still produce a diff.
  records.sort(
    (a, b) =>
      b.publishedAt.localeCompare(a.publishedAt) ||
      (a.startSeconds ?? 0) - (b.startSeconds ?? 0) ||
      a.id.localeCompare(b.id),
  );

  // ── the floor, on a FULL sweep only ───────────────────────────────────────
  // A cursor run's dump is a DELTA and is legitimately tiny, so "materially
  // smaller than the pin" means nothing there — parse merges it, and add-only
  // does the protecting. A FULL sweep is different: it claims to be the whole
  // catalogue, so a collapse in it is a claim that most of the catalogue is
  // gone.
  //
  // The shape this guards against is not hypothetical. `records` is filtered by
  // the per-entry game gate, and the gate compares against a string the
  // catalogue controls: the day "Guilty Gear -Strive-" is respelled upstream,
  // `rightGame` is 0, `records` is 0, and CotW's code writes `[]` over a good
  // dump without comment. Add-only means nothing is lost downstream — but the
  // CAUSE is never named, and the intake is quietly dead. Refuse here, where
  // the cause is visible. The same floor catches a join that stopped
  // resolving, which is the other way a sweep goes to zero.
  if (FULL) {
    const pins = await readFile(join(ROOT, 'data', 'source-pins.json'), 'utf8')
      .then((t) => JSON.parse(t) as Record<string, number>)
      .catch(() => ({}) as Record<string, number>);
    const pinned = Number(pins[CH.id] ?? 0) || 0;
    if (pinned > 0 && records.length < pinned * 0.9) {
      console.error(
        [
          `\n✖ A full sweep produced ${records.length} record(s) against a committed pin of ${pinned}.`,
          `  That is a claim that ${pinned - records.length} matches left the catalogue at once.`,
          ``,
          `  The likeliest cause is not deletion. Every entry is checked against`,
          `  gameLabel ${JSON.stringify(INDEX.gameLabel)}, and ${wrongGame.length} of ${catalogue.length} entr(ies) failed that check`,
          `  this run — if the catalogue respelled the game, every row fails and this`,
          `  file would be overwritten with almost nothing. The other cause is the`,
          `  YouTube join: ${missing.length} of ${vodIds.length} video(s) did not resolve this run.`,
          ``,
          `  Refusing to write. The committed records are untouched and the cron`,
          `  carries them exactly as it does on a day this never ran.`,
          `  If the drop is real: npm run data:theater -- --full --allow-shrink`,
        ].join('\n'),
      );
      if (!ALLOW_SHRINK) process.exit(1);
      console.error('  --allow-shrink given: writing anyway.');
    }
  }

  await writeFile(OUT, JSON.stringify(records) + '\n', 'utf8');

  // ── the witness ───────────────────────────────────────────────────────────
  // EVERY entry of the read window, tagged and untagged, in the catalogue's
  // own shape, inside SF6's envelope — the shape crosscheck.ts reads. NOT
  // cursor-gated: the cross-check compares whatever the window holds against
  // whatever we hold, and the delta gate is about what gets BUILT.
  //
  // BEHIND THE PER-ENTRY GAME GATE, not the raw catalogue. The gate is this
  // intake's only real defence against a response that is not what was asked
  // for, and the witness has to sit behind it too — it feeds a comparison
  // whose whole claim is that it is reading THIS game.
  await writeFile(
    WITNESS,
    JSON.stringify({
      mode: CURSOR_MODE ? 'cursor' : 'full',
      maxEntryId,
      pagesRead: seenPages.size,
      hitBound,
      entries: rightGame,
    }) + '\n',
    'utf8',
  );

  const tagged = records.filter((r) => r.tag !== '').length;
  const placeholderSides = records.reduce(
    (n, r) => n + r.players.filter((p) => isPlaceholderHandle(p)).length,
    0,
  );
  const preLaunchRows = rightGame.filter((e) => (e.upload_date ?? '') < LAUNCH).length;
  const belowFloorRows = CH.preReleaseFrom
    ? rightGame.filter((e) => (e.upload_date ?? '9999') < CH.preReleaseFrom!).length
    : 0;
  const stats = {
    // THE MODE IS LOAD-BEARING, not a diagnostic. parse reads it to decide
    // whether this dump is the whole catalogue or a delta, which decides
    // whether "committed but absent from the dump" means "vanished upstream"
    // or "simply not in the pages we read".
    mode: CURSOR_MODE ? 'cursor' : 'full',
    highestId,
    maxEntryId,
    pagesRead: seenPages.size,
    hitCursorBound: hitBound,
    seen: catalogue.length,
    records: records.length,
    unresolvable: missing.length,
    unresolvablePct,
    badLinks: badLinks.length,
    collisions: collisions.length,
    wrongGame: wrongGame.length,
    // Beyond the shared contract — for the log, the report and the gates.
    cursorAt,
    totalReported: total,
    fullPages,
    pagesFetched,
    resumed,
    noId,
    rightGame: rightGame.length,
    delta: delta.length,
    admitUntagged: INDEX.admitUntagged,
    inScope: inScope.length,
    videos: vodIds.length,
    tagged,
    untagged: records.length - tagged,
    collapsed,
    collapsedTags: Object.fromEntries([...collapsedTags].sort((a, b) => a[0].localeCompare(b[0]))),
    placeholderSides,
    preLaunchRows,
    belowFloorRows,
  };
  await writeFile(STATS, JSON.stringify(stats, null, 2) + '\n', 'utf8');

  // A completed FULL sweep retires its cache: the cursor is the daily resume
  // mechanism, and two that disagree would be worse than one. A cursor run
  // leaves a partial cache alone — it belongs to a sweep somebody is driving.
  if (FULL && existsSync(PARTIAL)) await rm(PARTIAL, { force: true });

  console.log(
    `\n✓ raw/replayTheater.json — ${records.length} record(s)${CURSOR_MODE ? ', a delta' : ''} ` +
      `(${tagged} tagged, ${records.length - tagged} untagged; ${records.filter((r) => r.startSeconds !== undefined).length} segment(s), ` +
      `${records.filter((r) => r.startSeconds === undefined).length} whole video(s))`,
  );
  console.log(
    `  → raw/replayTheater.witness.json (${rightGame.length} of ${catalogue.length} catalogue entr(ies), this game, ${seenPages.size} page(s))`,
  );
  console.log(
    `  ${missing.length}/${vodIds.length} video(s) no longer resolve (${unresolvablePct}%) — dropped, not published` +
      (CURSOR_MODE
        ? ' (a cursor window is all recent rows; only a --full sweep sees the 2023 cliff)'
        : ''),
  );

  // ── reconnaissance ────────────────────────────────────────────────────────
  console.log(`\n${'█'.repeat(72)}`);
  console.log('  RECON — nothing below gates anything; it is what the pull learned.');
  console.log('█'.repeat(72));

  const perVod = new Map<string, TheaterRawRecord[]>();
  for (const r of records) perVod.set(r.videoId, [...(perVod.get(r.videoId) ?? []), r]);
  const shared = records.filter((r) => (perVod.get(r.videoId)?.length ?? 0) > 1).length;
  const counts = [...perVod.values()].map((v) => v.length).sort((a, b) => b - a);
  console.log(`\n  records / source VODs:                 ${records.length} / ${perVod.size}`);
  console.log(
    `  a moment inside a shared VOD:          ${shared} (${pct(shared, records.length)}%), max ${counts[0] ?? 0} per VOD, median ${counts[Math.floor(counts.length / 2)] ?? 0}`,
  );
  console.log(
    `  distinct event tags:                   ${new Set(records.filter((r) => r.tag).map((r) => r.tag)).size}`,
  );

  const malformed = deduped.filter((l) => {
    const s = l.e.video_link ?? '';
    if (!s.includes('youtu.be/')) return false;
    const tail = s.split('youtu.be/')[1] ?? '';
    return tail.includes('&t=') && !tail.includes('?');
  }).length;
  const multiT = deduped.filter((l) => l.link.tCount > 1).length;
  console.log(
    `\n  concatenated youtu.be/<id>&t=Ns links: ${malformed} (${pct(malformed, deduped.length)}%) — 686 on the 2026-09-07 sweep`,
  );
  console.log(`  links carrying more than one t=:       ${multiT} (last one wins)`);

  // The catalogue's own hygiene, so the parse-side rules stay measured rather
  // than remembered: trailing whitespace on tags (43 rows on 2026-09-07),
  // U+3000 anywhere in a keyed field (11), placeholder handles (645 sides).
  const tagUntrimmed = rightGame.filter(
    (e) => typeof e.tag === 'string' && e.tag !== e.tag.trim(),
  ).length;
  const u3000 = rightGame.filter((e) =>
    [e.tag, e.p1_name, e.p2_name].some((s) => typeof s === 'string' && s.includes('　')),
  ).length;
  console.log(`\n  tags with leading/trailing whitespace: ${tagUntrimmed} (trimmed in the dump)`);
  console.log(
    `  rows with U+3000 in tag or a handle:   ${u3000} (kept; normalizeText folds it downstream)`,
  );
  console.log(
    `  placeholder handles (sides):           ${placeholderSides} of ${records.length * 2} (${pct(placeholderSides, records.length * 2)}%) — passed through, parse drops them`,
  );
  console.log(
    `  rows dated before launch ${LAUNCH}:  ${preLaunchRows} (221 on 2026-09-07; admitted by preReleaseFrom=${CH.preReleaseFrom ?? '—'})`,
  );
  console.log(`  rows below the channel's date floor:   ${belowFloorRows} (parse drops these)`);

  const dates = records.map((r) => r.publishedAt.slice(0, 10)).sort();
  console.log(
    `  VOD publish dates:                     ${dates[0] ?? '—'} → ${dates[dates.length - 1] ?? '—'}`,
  );

  // THE COUNTER-PICK TEST. A side with ≥2 characters is a within-row character
  // change; 0.319% on 2026-09-07 against 21.0% for hand-validated Evo SETS and
  // 1.8% on SF6, which was ruled MATCHES. These are matches, not sets.
  const occ = new Map<number, number>();
  let sides = 0;
  let multi = 0;
  for (const r of records)
    for (const side of r.characters) {
      occ.set(side.length, (occ.get(side.length) ?? 0) + 1);
      sides++;
      if (side.length > 1) multi++;
    }
  console.log(
    `\n  characters per side: ${[...occ.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, n]) => `${k}→${n}`)
      .join(
        ' · ',
      )} — counter-pick rate ${pct(multi, sides)}% (0.319% on the full catalogue; sets read ~21%)`,
  );

  // ── trust, re-measured every pull ─────────────────────────────────────────
  let inChapter = 0;
  let exact = 0;
  let within30 = 0;
  let vsChapters = 0;
  let namesAgreeRaw = 0;
  let namesAgreeStripped = 0;
  let chaptered = 0;
  for (const [id, meta] of vods) {
    const cs = chaptersOf(meta.description);
    if (!cs.length) continue;
    chaptered++;
    for (const r of perVod.get(id) ?? []) {
      if (r.startSeconds === undefined) continue;
      let hit: Chapter | undefined;
      for (const c of cs) {
        if (c.start <= r.startSeconds) hit = c;
        else break;
      }
      if (!hit) continue;
      inChapter++;
      const d = r.startSeconds - hit.start;
      if (d === 0) exact++;
      if (Math.abs(d) <= 30) within30++;
      // Condition on the chapter naming a MATCHUP, not on a name having already
      // hit: the looser denominator silently excludes total disagreement, which
      // is the one failure that matters.
      if (/\bvs\.?\b/i.test(hit.title)) {
        vsChapters++;
        const t = aliasKey(hit.title);
        const [r1, r2] = r.players.map(aliasKey);
        if (r1 && r2 && t.includes(r1) && t.includes(r2)) namesAgreeRaw++;
        const [s1, s2] = r.players.map((p) => aliasKey(stripTheaterSponsor(p)));
        if (s1 && s2 && t.includes(s1) && t.includes(s2)) namesAgreeStripped++;
      }
    }
  }
  console.log(`\n  VODs carrying a chapter list: ${chaptered}/${vods.size}`);
  console.log(
    `  offsets inside a chapter:     ${inChapter} — ${within30} within 30s (${pct(within30, inChapter)}%), ${exact} exact (${pct(exact, inChapter)}%)`,
  );
  console.log(
    `  chapters naming a matchup:    ${vsChapters} — both handles agree ${namesAgreeRaw} raw (${pct(namesAgreeRaw, vsChapters)}%), ` +
      `${namesAgreeStripped} sponsor-stripped (${pct(namesAgreeStripped, vsChapters)}%)`,
  );
  console.log(
    `  segments with no chapter to check against: ${records.filter((r) => r.startSeconds !== undefined).length - inChapter}`,
  );

  const uploaders = new Map<string, number>();
  for (const r of records) uploaders.set(r.uploader, (uploaders.get(r.uploader) ?? 0) + 1);
  console.log(`\n  source VOD uploaders (${uploaders.size}):`);
  for (const [u, n] of [...uploaders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`      ${String(n).padStart(5)}  ${u}`);
  }

  console.log('\n  Next: npm run data:parse');
}

main();
