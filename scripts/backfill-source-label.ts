/**
 * ONE-OFF MIGRATION — backfill the badge label onto committed records.
 *
 * Engine v0.13.0 gave `Replay` an `event` and a `channelName`, and
 * buildTheaterRecords now sets both on every NEW record. Committed records
 * never regain a field on their own: data/videos.json is merged add-only, so
 * the 8,245 records already in it would keep printing the source's configured
 * name forever while records ingested tomorrow printed their event. This
 * closes that gap once.
 *
 * TWO SOURCES, because this intake has two arms.
 *
 *   event       — from the record's OWN title. fetch-theater synthesized it as
 *                 `GGST ▰ <p1> (<chars>) vs <p2> (<chars>) ▰ <tag>`, so the
 *                 trailing slot is the tag. Gated, not trusted: exactly 3
 *                 separator-delimited segments means tagged, exactly 2 means
 *                 untagged (this intake sets `admitUntagged`), and ANY other
 *                 shape aborts the run. Measured across every committed corpus
 *                 on the platform first — theater titles are only ever 2 or 3
 *                 segments and no tag contains the separator.
 *
 *   channelName — from `raw/replayTheater.json`, joined by id. Only the
 *                 untagged arm needs it: those records are whole videos the
 *                 catalogue merely indexed, from 65 creator channels, and
 *                 labelling them "Tournament" would be false about every one.
 *
 * THE DUMP IS NOT COMMITTED. `raw/` is gitignored, so the 20,311-row full
 * sweep this join needs exists on one machine and cannot be reproduced from
 * the repo without another 442-page crawl at 1200ms pacing. If it is missing,
 * this script says so and writes nothing rather than silently skipping the
 * uploader arm — a run that quietly covered only the tagged half would look
 * exactly like a run that worked.
 *
 * WHY normalizeText. `title` is normalized at ingest (parse-finish.ts) and
 * carries the same tag in its trailing slot, so a title-derived tag is already
 * folded. A raw-dump tag is not: 12 committed records differ between the two,
 * every one a curly apostrophe or a U+3000 that `trim()` does not touch. The
 * title-derived value is the correct one, and the go-forward builder folds its
 * tag the same way so the two arms can never disagree. The cross-check below
 * proves that number rather than asserting it.
 *
 * WHAT IT PROVES BEFORE WRITING. Record count, id order, and byte-equality of
 * every record with the new keys stripped — the only difference anywhere in
 * the file is the presence of a new key. Plus the coverage counts, hard-coded:
 * a backfill that silently covers 6,900 of 6,915 looks exactly like one that
 * worked.
 *
 * Run:  npx tsx scripts/backfill-source-label.ts          # dry run, reports
 *       npx tsx scripts/backfill-source-label.ts --write  # applies
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeText } from './roster';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const DUMP = join(ROOT, 'raw/replayTheater.json');
const SEP = '▰';
const WRITE = process.argv.includes('--write');

/** Hard-coded from the committed corpus, so drift fails loudly. */
const EXPECT = { scoped: 8245, fromTag: 6915, fromUploader: 1330, foldDiffs: 12 };

type Rec = Record<string, unknown> & {
  id: string;
  title: string;
  event?: string;
  channelName?: string;
};

const isTheater = (r: Rec): boolean => r.intake === 'replayTheater';

function tagOf(title: string, id: string): string | null {
  const segs = title.split(SEP);
  if (segs.length === 3) {
    const t = segs[2]!.trim();
    if (!t) throw new Error(`${id}: 3-segment title with an empty tag slot — refusing to guess`);
    return t;
  }
  if (segs.length === 2) return null;
  throw new Error(
    `${id}: theater title has ${segs.length} "${SEP}" segments, expected 2 or 3. The synthesized ` +
      `title grammar changed and this derivation is no longer safe. Nothing written.`,
  );
}

const fail = (msg: string): never => {
  throw new Error(`${msg}\nNothing written.`);
};

if (!existsSync(DUMP))
  fail(
    `raw/replayTheater.json is missing, and it is the only source for the untagged arm's ` +
      `${EXPECT.fromUploader} uploaders. It is gitignored, so a fresh clone does not have it: ` +
      `re-run the full sweep (npm run data:theater -- --full) before this migration.`,
  );

const raw = await readFile(join(DATA, 'videos.json'), 'utf8');
// The indent is READ, never assumed. Sibling repos write this file at 1 space
// and others at 2, and a migration that guessed would reformat every line of a
// file whose whole point is that it changes add-only — burying 8,245 real
// insertions in a 400,000-line diff nobody can review.
const INDENT = (/^\n?([ ]+)/.exec(raw.slice(raw.indexOf('\n')))?.[1] ?? '  ').length;
const before = JSON.parse(raw) as Rec[];

const dump = JSON.parse(await readFile(DUMP, 'utf8')) as {
  id: string;
  tag?: string;
  uploader?: string;
}[];
const byId = new Map(dump.map((e) => [e.id, e]));

const scoped = before.filter(isTheater);
let fromTag = 0;
let fromUploader = 0;
let unresolved = 0;
/** Title-derived vs raw-dump tag. Expected to be nonzero and small; every one
 *  should be a Unicode fold the title already applied. A thirteenth is a bug. */
const foldDiffs: string[] = [];

const after = before.map((r) => {
  if (!isTheater(r)) return r;
  const tag = tagOf(r.title, r.id);
  const { sides, ...head } = r;

  if (tag) {
    const rawTag = (byId.get(r.id)?.tag ?? '').trim();
    if (rawTag && rawTag !== tag) foldDiffs.push(`${r.id}: dump "${rawTag}" vs title "${tag}"`);
    fromTag += 1;
    // Rebuilt with the label in the slot the theater builder puts it in — just
    // before `sides` — so a backfilled record and one ingested tomorrow
    // serialize identically. `{ ...r, event }` would append it after the big
    // sides array instead, leaving the corpus in two shapes forever.
    return { ...head, event: tag, sides };
  }

  const uploader = normalizeText(byId.get(r.id)?.uploader ?? '').trim();
  if (!uploader) {
    unresolved += 1;
    return r;
  }
  fromUploader += 1;
  return { ...head, channelName: uploader, sides };
});

if (after.length !== before.length) fail(`record count moved: ${before.length} → ${after.length}`);
const ids = (rs: Rec[]) => JSON.stringify(rs.map((r) => r.id));
if (ids(after) !== ids(before)) fail('id order changed');

const strip = (r: Rec) => {
  const { event: _event, channelName: _channelName, ...rest } = r;
  return JSON.stringify(rest);
};
const drifted = after.filter((r, i) => strip(r) !== JSON.stringify(before[i]));
if (drifted.length)
  fail(`${drifted.length} record(s) changed beyond the new keys, e.g. ${drifted[0]!.id}`);

const labelled = after.filter((r) => r.event ?? r.channelName);
if (labelled.some((r) => !isTheater(r))) fail('a non-theater record gained a label');
if (labelled.some((r) => !(r.event ?? r.channelName ?? '').trim()))
  fail('an empty or blank label was written');
if (after.some((r) => r.event && r.channelName))
  fail('a record carries both labels — the arms are meant to be exclusive here');

const longest = labelled.reduce((a, r) => Math.max(a, (r.event ?? r.channelName ?? '').length), 0);
console.log(`  scoped:        ${scoped.length}\t(expected ${EXPECT.scoped})`);
console.log(`  from tag:      ${fromTag}\t(expected ${EXPECT.fromTag})`);
console.log(`  from uploader: ${fromUploader}\t(expected ${EXPECT.fromUploader})`);
console.log(`  unresolved:    ${unresolved}\t(expected 0)`);
console.log(`  distinct:      ${new Set(labelled.map((r) => r.event ?? r.channelName)).size}`);
console.log(`  longest:       ${longest} chars`);
console.log(`\n  title-vs-dump tag folds: ${foldDiffs.length} (expected ${EXPECT.foldDiffs})`);
for (const d of foldDiffs) console.log(`    ${d}`);

if (
  scoped.length !== EXPECT.scoped ||
  fromTag !== EXPECT.fromTag ||
  fromUploader !== EXPECT.fromUploader ||
  unresolved !== 0
)
  fail('coverage does not match the measured corpus');
if (foldDiffs.length !== EXPECT.foldDiffs)
  fail(
    `${foldDiffs.length} title-vs-dump tag disagreements, expected ${EXPECT.foldDiffs}. Every ` +
      `expected one is a Unicode fold normalizeText already applied to the title; an unexpected ` +
      `one means the two are drifting for a reason this migration does not understand.`,
  );

if (!WRITE) {
  console.log('\n✓ dry run — every assertion passed. Re-run with --write to apply.');
} else {
  await writeFile(join(DATA, 'videos.json'), `${JSON.stringify(after, null, INDENT)}\n`);
  console.log(`\n✓ wrote data/videos.json — ${fromTag} event(s), ${fromUploader} uploader(s).`);
  console.log('  Now run: npm run data:emit');
}
