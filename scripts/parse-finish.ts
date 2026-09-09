/**
 * The back half of scripts/parse.ts: index merge, dedupe, the collapse guard,
 * the freeze carry, the registry invariant, players, the review queue, the
 * cross-check and data/report.md.
 *
 * Split from parse.ts for legibility only — there is one parse, and it is
 * these two files. Everything that WRITES to data/ writes from here, so the
 * order of the guards relative to the writes is visible in one place: every
 * guard runs, and only then does anything touch disk. A guard that aborts
 * after a partial write is not a guard.
 *
 * THAT SENTENCE WAS FALSE ON CotW AND IS TRUE HERE. CotW's parse-finish.ts
 * writes data/theater-cursor.json inside the index-merge step, 78 lines before
 * its collapse guard (recon/ff-gates.md §1), so a run the guard refused had
 * already advanced the committed cursor and the next morning's pull skipped the
 * pages it never ingested. Here the cursor value is COMPUTED in the merge step
 * and WRITTEN in the write step, beside videos.json, after every guard.
 *
 * THE GUARDS ARE AWAKE ON DAY ONE. Tōkon recorded that the collapse guard
 * sleeps under ~200 records per channel and recon/ff-gates.md §1 assumed the
 * same for this game; the live volumes say otherwise (recon/critic.md): four
 * intakes commit over 1,400 records each (ggHighLevel 5,850 marked,
 * guiltyGearReplays 3,560, ggstBattleCollection 3,375, ggstHq 2,994) and a
 * fifth 1,486, so a 10% loss is 148–585 records and clears both thresholds.
 * It is genuinely asleep only for guiltyGearVods (~135) and the frozen
 * ggstLowLevel, where the freeze pin is the live protection.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHANNELS, stripTheaterSponsor } from './channels';
import { crossCheck, exactAlias, formatCrossCheck, isPlaceholderHandle } from './crosscheck';
import { dueExpiries, expiryBlock, UNRELEASED } from './expiries';
import { CONFIRMED_FIGHTER_NAMED_PLAYERS, normalizeText, playerId } from './roster';
import { LAUNCH, patchForDate, patchWindows, seasonForDate, seasonToken } from './seasons';
import { MIN_MATCH_SEC, DURATION_BUCKETS } from './parse';
import type { WitnessArtifact, WitnessFile } from './crosscheck';
import type { AliasMatcher } from './roster';
import type {
  CharacterRecord,
  ChannelKey,
  MatchSide,
  MatchVideo,
  PlayerRecord,
  ReviewQueueItem,
  SlotOrder,
  SourcePins,
  TheaterRawRecord,
  VideoOverride,
} from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'raw');
const DATA = join(ROOT, 'data');

const ALLOW_COLLAPSE = process.argv.includes('--allow-collapse');

const write = (name: string, value: unknown) =>
  writeFile(join(DATA, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');

/** Catch-all fallback is FINE for these — the cursor and the witness artifact
 *  are not baselines for anything. videos.json is read by parse.ts's
 *  readCommitted, which hard-stops on an unreadable file for the reason given
 *  there. */
const readJsonLocal = async <T>(path: string, fallback: T): Promise<T> => {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

/** Dedupe precedence = the CHANNELS array order (checklist step 1/2). */
const PRECEDENCE = new Map<ChannelKey, number>(CHANNELS.map((c, i) => [c.id, i]));

const SLOT_ORDERS: SlotOrder[] = [
  'handle-outside',
  'chars-outside',
  'handle-first-bare',
  'chars-only',
];

/** Per-channel counters parse.ts fills and this file prints. */
export interface ChannelTally {
  raw: number;
  marked: number;
  parsed: number;
  excluded: number;
  /** The duration floor this channel was judged against (minDurationSec or
   *  MIN_MATCH_SEC), so the too-short column can be read next to its cause. */
  floorSec: number;
  misses: Record<string, number>;
  /** Handles refused as placeholders ("Unknown Player") on this channel. */
  placeholderHandles: number;
  /** Resolved slot order, BOTH sides tallied — 2 per record. */
  slot: Record<SlotOrder, number>;
  /** Sides where both spans resolved and the declared order decided. */
  tieBroken: number;
  versionTokens: Record<string, number>;
  /** The version-token HYPOTHESIS (parse.ts VERSION_TOKEN), per record that
   *  carried one: the token equals the date-derived patch's Battle Version,
   *  its game version, both, neither, or no window claims the date. */
  versionAgree: { battle: number; game: number; both: number; neither: number; unknown: number };
  /** Misses that name a roster character — the reject printer's precise half.
   *  Sampled to ten per channel; `rejectCount` is the whole count. */
  rejects: { id: string; title: string; kind: string }[];
  rejectCount: number;
}

/** Duration buckets (parse.ts DURATION_BUCKETS) → count, three populations. */
export interface DurationHistogram {
  records: Record<string, number>;
  /** Too-short uploads whose title DID parse as a matchup — the population a
   *  lower floor would admit. */
  matchShapedMisses: Record<string, number>;
  otherMisses: Record<string, number>;
}

export interface FinishInput {
  built: MatchVideo[];
  /** Records parsed from a FROZEN channel's dump — present only on the
   *  freeze-pin seeding path (`data:fetch --include-frozen`). */
  frozenBuilt: Map<ChannelKey, MatchVideo[]>;
  committed: MatchVideo[];
  overrides: Record<string, VideoOverride>;
  pins: SourcePins;
  residue: Map<string, number>;
  queue: ReviewQueueItem[];
  perChannel: Map<ChannelKey, ChannelTally>;
  /** Every video id any title dump held, pre-gate → which dump. */
  rawSeen: Map<string, string>;
  durations: Map<ChannelKey, DurationHistogram>;
  /** Handle word count → sides. */
  handleWords: Record<string, number>;
  matcher: AliasMatcher;
  characters: CharacterRecord[];
}

/**
 * raw/.replayTheater.stats.json — what the pull learned about itself
 * (scripts/fetch-theater.ts). THE SHARED CONTRACT: `mode` is LOAD-BEARING. It
 * is how "committed but absent from the dump" is told apart between "vanished
 * upstream" (a full sweep saw the whole catalogue) and "not in the pages we
 * read" (a cursor delta is a few hundred rows off the front of the feed).
 * CotW read only `highestId` here and so could never make that distinction
 * (recon/ff-theater.md row K); SF6 parse.ts:1289-1328 is the shape followed.
 */
export interface TheaterStats {
  mode?: 'cursor' | 'full';
  highestId?: number;
  maxEntryId?: number;
  pagesRead?: number;
  hitCursorBound?: boolean;
  seen?: number;
  records?: number;
  unresolvable?: number;
  unresolvablePct?: number;
  badLinks?: number;
  collisions?: number;
  wrongGame?: number;
}

export async function writeReportAndData(input: FinishInput): Promise<void> {
  const {
    built,
    frozenBuilt,
    committed,
    overrides,
    pins,
    residue,
    queue,
    perChannel,
    rawSeen,
    matcher,
    durations,
    handleWords,
  } = input;
  const notes: string[] = [];
  const windows = patchWindows();
  let records = [...built];

  // ── 1. the INDEX intake ──────────────────────────────────────────────────
  const idx = CHANNELS.find((c) => c.index);
  const statsFile = join(RAW, '.replayTheater.stats.json');
  const dumpFile = join(RAW, 'replayTheater.json');
  const theaterStats = await readJsonLocal<TheaterStats | null>(statsFile, null);
  /** Present only when the pull COMPLETED: fetch-theater removes both files
   *  before it fetches and writes them last, so their presence is the pull's
   *  own receipt rather than yesterday's leftovers. */
  const pullRan = theaterStats !== null && existsSync(dumpFile);
  let theater: TheaterMerge | null = null;
  let theaterCarried: number | null = null;
  if (idx) {
    const dump = existsSync(dumpFile) ? await readJsonLocal<TheaterRawRecord[]>(dumpFile, []) : [];
    if (dump.length > 0) {
      const build = buildTheaterRecords(dump, {
        records,
        committed,
        overrides,
        rawSeen,
        matcher,
        floor: idx.preReleaseFrom ?? LAUNCH,
        floorSec: idx.minDurationSec ?? MIN_MATCH_SEC,
        windows,
      });
      // ── ADD-ONLY MERGE (Rule 1) ──────────────────────────────────────────
      // The daily path reads a BOUNDED CURSOR — two clean pages, ten at most —
      // so the dump is deliberately a recent slice of a 439-page catalogue,
      // not the whole thing. Rebuilding from it alone would drop every older
      // record on every cron run: a 20,000-record archive collapsing to a
      // hundred, which the collapse guard would then refuse... on the run
      // AFTER the pin had already been overwritten.
      //
      // So: take what this run built, then carry every committed record of
      // this intake the dump did not reproduce. WHAT "did not reproduce" MEANS
      // DEPENDS ON THE MODE, and conflating the two would be the most
      // misleading number in report.md: after a FULL sweep it is "no longer
      // rebuilds from the catalogue" (the entry vanished, or its VOD died, or
      // its video is now known from a tracked channel and the ignore took it);
      // after a CURSOR run it is every record older than the pages read —
      // almost all of them — and means nothing. The split is computed here
      // and report.md prints it only after a full sweep.
      const byRecordId = new Map(build.built.map((r) => [r.id, r]));
      const survivors: MatchVideo[] = [];
      for (const v of committed) {
        if (v.intake !== 'replayTheater') continue;
        if (byRecordId.has(v.id)) continue;
        byRecordId.set(v.id, v);
        survivors.push(v);
      }
      const absorbed = survivors.filter((v) => build.known.has(v.videoId ?? v.id)).length;
      const theaterRecords = [...byRecordId.values()];
      records = records.concat(theaterRecords);
      theater = {
        ...build,
        floorSec: idx.minDurationSec ?? MIN_MATCH_SEC,
        mode: theaterStats?.mode ?? 'unknown',
        dumped: dump.length,
        carried: survivors.length,
        absorbed,
        vanished: survivors.length - absorbed,
        total: theaterRecords.length,
      };
      // THE PIN ONLY EVER GROWS: this intake is add-only. A rebuild that
      // falls below it dropped records inside the run.
      const before = pins.replayTheater ?? 0;
      if (theaterRecords.length < before) {
        throw new Error(
          `Replay Theater built ${theaterRecords.length} records but the pin says ${before}. ` +
            `This intake is add-only, so a falling count means records were dropped inside the ` +
            `run. Nothing written. Investigate, then edit data/source-pins.json deliberately.`,
        );
      }
      pins.replayTheater = theaterRecords.length;
    } else {
      // CARRY. The cron works from a fresh checkout and raw/ is gitignored, so
      // a run whose pull failed has no dump — and the pipeline must not
      // publish that as a deletion. An EMPTY dump is the same case by design
      // (types/index.ts cronFetchedWithCarry): on the cursor path a quiet
      // morning writes `[]`, and rebuilding from it would be a rebuild to
      // zero. Carry the committed records and hard-assert the pin.
      const carried = committed.filter((v) => v.intake === 'replayTheater');
      const pin = pins.replayTheater;
      if (pin === undefined && carried.length > 0) {
        throw new Error(
          `Replay Theater carried ${carried.length} committed record(s) but data/source-pins.json ` +
            `has no pin for it. "No expectation" is the exact state the pin exists to prevent. ` +
            `Run \`npm run data:theater\` then \`npm run data:parse\` to rebuild and pin. Nothing written.`,
        );
      }
      if (pin !== undefined && carried.length !== pin) {
        throw new Error(
          `Replay Theater carry expected ${pin} committed records, found ${carried.length}. ` +
            `The committed file is both the source and the target of this carry, so one bad run ` +
            `would poison every later run silently. Nothing written.`,
        );
      }
      pins.replayTheater = carried.length;
      records = records.concat(carried);
      theaterCarried = carried.length;
    }
  }

  // ── the cursor value: COMPUTED here, WRITTEN in step 10 ──────────────────
  // Written by parse on the PULL, never by the fetcher: a fetcher that wrote it
  // would advance the cursor for a pull whose records parse then refused, and
  // the next run would skip those pages forever. FORWARD-ONLY: a bounded
  // cursor read sees a lower highest-id than a full sweep did, and letting
  // that move the committed cursor backwards would re-read pages every
  // morning. And keyed on the pull having HAPPENED (stats + dump present), not
  // on the dump holding rows — a quiet cursor morning writes an empty dump and
  // must still advance, or the same pages are re-read daily forever.
  //
  // The SIBLING shape, `{ replayTheater: N }` keyed by channel id — NOT CotW's
  // `{ highestId }`. fetch-theater.ts reads `cursorFile[CH.id]`; a mixed port
  // reads 0 and full-sweeps 439 pages every morning (recon/critic.md).
  //
  // The value is the stats file's `maxEntryId` — the highest entry id the pull
  // OBSERVED, pre-game-gate, seeded by the fetcher with the committed cursor —
  // never the highest id among the records it BUILT: a gated-out entry still
  // has to advance the cursor, or the next morning re-reads it forever.
  const cursorPath = join(DATA, 'theater-cursor.json');
  const cursorFile = await readJsonLocal<Record<string, number>>(cursorPath, {});
  const cursorPrev = typeof cursorFile.replayTheater === 'number' ? cursorFile.replayTheater : null;
  const cursorSeen = pullRan
    ? Number(theaterStats?.maxEntryId ?? theaterStats?.highestId ?? 0) || 0
    : 0;
  const cursorNext = Math.max(cursorPrev ?? 0, cursorSeen);
  // Seeded at 0 when absent: the cron names this path in its `git add`, and a
  // path that does not exist fails the commit step under `set -e`. 0 is what
  // fetch-theater reads an absent file as, so seeding changes nothing it does.
  const cursorWrite = cursorPrev === null || cursorNext > cursorPrev ? cursorNext : null;

  // ── 2. frozen channels: carry byte-stable, assert the pin ────────────────
  // UNLIKE CotW, THIS BRANCH HAS A CONSUMER ON DAY ONE: ggstLowLevel ships
  // frozen with `records: -1`, a sentinel no carried count can ever equal, so
  // the assert throws on the first parse until a human has seeded the pin
  // through the ritual below (the alternative — an empty freeze that looks
  // like a working one — is the failure the sentinel exists to prevent).
  for (const ch of CHANNELS) {
    if (!ch.frozen) continue;
    const pin = ch.frozen.records;
    const fromDump = frozenBuilt.get(ch.id);
    const ritual = [
      `  The pin is seeded ONCE, with the freeze lifted for one fetch:`,
      `    1. npm run data:fetch -- --only=${ch.id} --include-frozen`,
      `    2. npm run data:parse -- --seed-freeze-pins      (prints the count, writes nothing)`,
      `    3. set frozen.records on ${ch.id} in scripts/channels.ts to that count`,
      `    4. npm run data:parse                            (asserts the parse against the pin`,
      `                                                      and writes the records)`,
      `  Every later run carries the committed records and re-asserts the pin.`,
    ];
    if (fromDump) {
      // A dump for a frozen channel exists only on the seeding path. The
      // parse is asserted against the pin — not the committed count, which is
      // 0 the first time — and the BUILT records are what ships.
      if (pin < 0) {
        throw new Error(
          [
            `${ch.id} is frozen with the placeholder pin ${pin} and raw/${ch.id}.json parsed to ` +
              `${fromDump.length} record(s). The pin must be set before anything is written.`,
            ...ritual,
            `  You are at step 3: set frozen.records: ${fromDump.length}. Nothing written.`,
          ].join('\n'),
        );
      }
      if (fromDump.length !== pin) {
        throw new Error(
          `${ch.id} is frozen at ${pin} records but its dump parsed to ${fromDump.length}. ` +
            `A frozen dump that parses to a different count than the pin means either the pin ` +
            `was seeded from a different parse or the parser changed under it. Re-run ` +
            `\`npm run data:parse -- --seed-freeze-pins\` and set the pin deliberately. Nothing written.`,
        );
      }
      records = records.concat(fromDump);
      notes.push(
        `${ch.id}: frozen since ${ch.frozen.since}; ${fromDump.length} record(s) parsed from a ` +
          `frozen dump (the seeding path) and asserted against the pin.`,
      );
      continue;
    }
    const carried = committed.filter((v) => v.intake === ch.id);
    if (pin < 0) {
      throw new Error(
        [
          `${ch.id} is frozen with the placeholder pin ${pin}, which no carried count can equal ` +
            `(${carried.length} committed). This is deliberate: it stops an unseeded freeze ` +
            `shipping an empty channel that looks like a working one.`,
          ...ritual,
          `  Nothing written.`,
        ].join('\n'),
      );
    }
    if (carried.length !== pin) {
      throw new Error(
        `${ch.id} is frozen at ${pin} records but the committed file holds ${carried.length}. ` +
          `Editing the pin IS the deliberate-prune mechanism; a mismatch that nobody edited means ` +
          `the archive moved on its own. Nothing written.`,
      );
    }
    records = records.concat(carried);
    notes.push(`${ch.id}: frozen since ${ch.frozen.since}, ${carried.length} record(s) carried.`);
  }

  // ── 3. hand overrides ────────────────────────────────────────────────────
  // A hand verdict beats every automatic tier. `sides` overrides are applied
  // here, AFTER the intakes have produced their candidates, so an override can
  // correct any of them.
  for (const r of records) {
    const ov = overrides[r.id];
    if (!ov) continue;
    if (ov.sides) r.sides = ov.sides as [MatchSide, MatchSide];
    if (ov.channel) r.channel = ov.channel;
    if (ov.season !== undefined) r.season = ov.season;
    if (ov.patch) r.patch = ov.patch;
  }

  // ── 4. dedupe on the INTAKE key ──────────────────────────────────────────
  // Checklist step 2: precedence is the CHANNELS array order, and ONLY a
  // hand-authored `sides` override protects a record. Testing for the mere
  // presence of `sides` would make every override-bearing record win, which
  // inverts declared precedence silently.
  const byId = new Map<string, MatchVideo>();
  let dropped = 0;
  const protectedBy = (v: MatchVideo) => overrides[v.id]?.resolvedBy === 'human';
  for (const r of records) {
    const prev = byId.get(r.id);
    if (!prev) {
      byId.set(r.id, r);
      continue;
    }
    const winner =
      protectedBy(r) && !protectedBy(prev)
        ? r
        : protectedBy(prev) && !protectedBy(r)
          ? prev
          : (PRECEDENCE.get(r.intake) ?? 99) < (PRECEDENCE.get(prev.intake) ?? 99)
            ? r
            : prev;
    byId.set(r.id, winner);
    dropped++;
  }
  records = [...byId.values()];
  records.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));

  // ── 5. THE COLLAPSE GUARD — before any write ─────────────────────────────
  // Parsed-vs-committed, per intake. >10% AND >20 records lost. Awake on day
  // one for the four biggest intakes — see the header.
  const beforeByIntake = new Map<ChannelKey, number>();
  for (const v of committed) beforeByIntake.set(v.intake, (beforeByIntake.get(v.intake) ?? 0) + 1);
  const afterByIntake = new Map<ChannelKey, number>();
  for (const v of records) afterByIntake.set(v.intake, (afterByIntake.get(v.intake) ?? 0) + 1);

  const collapses: string[] = [];
  for (const [intake, before] of beforeByIntake) {
    if (before === 0) continue;
    const after = afterByIntake.get(intake) ?? 0;
    const lost = before - after;
    if (lost > 20 && lost / before > 0.1) {
      collapses.push(
        `  ${intake}: ${before} → ${after} (lost ${lost}, ${((lost / before) * 100).toFixed(1)}%)`,
      );
    }
  }
  if (collapses.length && !ALLOW_COLLAPSE) {
    throw new Error(
      [
        `✖ COLLAPSE GUARD: ${collapses.length} intake(s) lost more than 10% AND more than 20 records.`,
        ...collapses,
        ``,
        `  Nothing has been written — not videos.json, not the pins, not the theater cursor. A`,
        `  channel collapses because it was deleted, renamed, made private, or rebranded to`,
        `  another game and unlisted its back catalogue — all observed on this platform. If`,
        `  this loss is REAL and intended, re-run with --allow-collapse.`,
      ].join('\n'),
    );
  }

  // ── 6. players: vote the casing, then the REGISTRY INVARIANT ─────────────
  // 421 case-only collision groups exist in the catalogue alone
  // (recon/replay-theater-live.md §8.6: `Tatuma`/`tatuma` 365/229,
  // `UMISHO`/`Umisho` 372/32, `NitroNY`/`NITRONY`/`Nitrony`), and the eight
  // channels add their own house styles — guiltyGearVods uppercases every
  // handle. playerId() already folds them to ONE id; what is decided here is
  // the DISPLAY spelling, by vote over side appearances in the assembled
  // record, with the tie broken toward mixed case (ALL-CAPS is a styling
  // choice, not how a player writes their own name — CotW's rule, demoted
  // from an override to a tie-break because on this corpus the majority
  // spelling is the better evidence). The losing spellings are kept as
  // aliases so search still finds them.
  const spellings = new Map<string, Map<string, number>>();
  const evidence = new Map<string, string>();
  for (const r of records) {
    for (const s of r.sides) {
      const m = spellings.get(s.player) ?? new Map<string, number>();
      m.set(s.handle, (m.get(s.handle) ?? 0) + 1);
      spellings.set(s.player, m);
      if (!evidence.has(s.player)) evidence.set(s.player, r.id);
    }
  }
  const casingRank = (h: string): number => {
    const up = h.toUpperCase();
    const lo = h.toLowerCase();
    if (up === lo) return 1; // no case (CJK, digits)
    if (h === up) return 2; // ALL-CAPS
    if (h === lo) return 1; // all-lower
    return 0; // mixed — the spelling a person most likely typed
  };
  const players = new Map<string, PlayerRecord>();
  let multiSpelling = 0;
  for (const [id, m] of spellings) {
    const ranked = [...m.entries()].sort(
      (a, b) => b[1] - a[1] || casingRank(a[0]) - casingRank(b[0]) || a[0].localeCompare(b[0]),
    );
    const [handle] = ranked[0] as [string, number];
    const aliases = ranked.slice(1).map(([h]) => h);
    if (aliases.length) multiSpelling++;
    players.set(id, {
      id,
      handle,
      ...(aliases.length ? { extra: { aliases } } : {}),
    });
  }

  // THE REGISTRY INVARIANT (checklist 5n), AT PARSE TIME, THROUGH THE MATCHER.
  // No player-registry entry may resolve to a roster character unless a human
  // has vouched for it with a video id (roster.ts
  // CONFIRMED_FIGHTER_NAMED_PLAYERS). The failure it prevents is a fighter
  // filed as a person — 67 titles on the recon did exactly that — and it has
  // to run HERE, before the write, because the only sibling implementation
  // (tokon e2e.ts) runs after `npm run generate` against data already on disk
  // and compares bare names, which under this roster's full-name ids never
  // catches a player called "SOL" (recon/orientation-precedents.md §2).
  //
  // A HARD STOP, with the evidence a human needs to add the row: the id, the
  // handle, the character(s) it resolves to, and a record it appears in. All
  // offenders are printed at once — a 21,944-row catalogue can surface several
  // on its first full sweep, and one stop per handle would be a bad morning.
  const confirmedById = new Map(CONFIRMED_FIGHTER_NAMED_PLAYERS.map((p) => [p.id, p]));
  const collisions: string[] = [];
  const confirmedSeen: string[] = [];
  for (const p of players.values()) {
    const ids = matcher.ids(p.handle);
    if (ids.length === 0) continue;
    if (confirmedById.has(p.id)) {
      confirmedSeen.push(p.id);
      continue;
    }
    const seen = spellings.get(p.id);
    const n = seen ? [...seen.values()].reduce((a, b) => a + b, 0) : 0;
    collisions.push(
      `  ${p.id.padEnd(24)} "${p.handle}" → ${ids.join(', ')}  (${n} side(s), e.g. ${evidence.get(p.id) ?? '?'})`,
    );
  }
  if (collisions.length) {
    throw new Error(
      [
        `✖ REGISTRY INVARIANT: ${collisions.length} player handle(s) resolve to a roster character and`,
        `  are not on CONFIRMED_FIGHTER_NAMED_PLAYERS (scripts/roster.ts).`,
        ...collisions,
        ``,
        `  Each line is either a fighter filed as a person (a slot-order defect — fix the parse)`,
        `  or a person named after a fighter (watch the video, then add the row WITH its id as`,
        `  evidence). Nothing written until every line is one or the other.`,
      ].join('\n'),
    );
  }
  const confirmedUnseen = CONFIRMED_FIGHTER_NAMED_PLAYERS.filter((p) => !players.has(p.id));
  const confirmedNoEvidence = CONFIRMED_FIGHTER_NAMED_PLAYERS.filter((p) => p.video === null);

  // ── 7. review queue — regenerated, and pending items never ship ──────────
  const publishedIds = new Set(records.map((r) => r.id));
  const pending = queue.filter((q) => !overrides[q.id] && !publishedIds.has(q.id));

  // ── 8. residue, and the unreleased-fighter early warning ─────────────────
  // The residue gate is also how an UNRELEASED fighter announces themselves:
  // uploaders put the name in titles the day they ship, long before anyone
  // checks a calendar. See scripts/expiries.ts on why this is the real
  // detector and the date row is only the backstop.
  const residueRows = [...residue.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const unreleasedHits = UNRELEASED.filter((u) => {
    const needle = u.id.replace(/-/g, ' ');
    return residueRows.some(([text]) => text.toLowerCase().includes(needle));
  });

  // ── 9. the cross-check — a second reading, producing NO field ────────────
  // crosscheck.ts is the theater track's file; this is the call SF6 parse.ts
  // :1206-1246 makes, against this repo's signature (the roster matcher in
  // place of SF6's alias map, so the witness and the parser share one
  // vocabulary). The witness file is SF6's envelope and NOT cursor-gated; only
  // a FULL sweep writes the committed artifact, because a cursor morning's
  // window is a different WINDOW, not a different corpus, and rendering it
  // would churn report.md daily (crosscheck.ts WitnessArtifact).
  const witnessPath = join(RAW, 'replayTheater.witness.json');
  const witness = await readJsonLocal<WitnessFile | null>(witnessPath, null);
  const artifactPath = join(DATA, 'theater-disagreements.json');
  const loaded = await readJsonLocal<Partial<WitnessArtifact>>(artifactPath, {});
  let artifact: WitnessArtifact = {
    ...(loaded.measured ? { measured: loaded.measured } : {}),
    blindSpots: loaded.blindSpots ?? [],
    disagreements: loaded.disagreements ?? [],
  };
  const witnessResult = witness
    ? crossCheck(witness, records, matcher, playerId, stripTheaterSponsor, 4, artifact.blindSpots)
    : null;
  let writeArtifact = !existsSync(artifactPath);
  if (witnessResult && witness?.mode === 'full') {
    artifact = {
      measured: {
        atEntryId: Number(theaterStats?.maxEntryId ?? witness?.maxEntryId ?? 0) || 0,
        compared: witnessResult.compared,
        unmatched: witnessResult.unmatched,
        segmented: witnessResult.segmented,
        players: witnessResult.players,
        characters: witnessResult.characters,
      },
      blindSpots: witnessResult.blindSpots,
      disagreements: witnessResult.disagreements,
    };
    writeArtifact = true;
  }

  // ── 10. WRITE (everything above passed) ──────────────────────────────────
  await write('videos.json', records);
  await write(
    'players.json',
    [...players.values()].sort((a, b) => a.id.localeCompare(b.id)),
  );
  await write('review-queue.json', pending);
  await write('source-pins.json', pins);
  if (cursorWrite !== null) await write('theater-cursor.json', { replayTheater: cursorWrite });
  if (writeArtifact) await write('theater-disagreements.json', artifact);

  // ── the report ───────────────────────────────────────────────────────────
  const mirrors = records.filter((r) =>
    r.sides[0].characters.some((c) => r.sides[1].characters.includes(c)),
  ).length;
  const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
  const missKinds = [
    'no-marker',
    'before-floor',
    'live',
    'too-short',
    'no-vs',
    'vs-count',
    'no-char',
    'no-handle',
    'slot-ambiguous',
  ];
  const titleChannels = CHANNELS.filter((c) => !c.index);

  const due = dueExpiries();
  const lines: string[] = [];
  if (due.length) lines.push(...expiryBlock(due), '');
  if (unreleasedHits.length) {
    lines.push(
      '## ⚠ AN UNRELEASED FIGHTER MAY HAVE SHIPPED',
      '',
      ...unreleasedHits.map(
        (u) => `- **${u.id}** appears in parser residue. Promote it — see scripts/expiries.ts.`,
      ),
      '',
    );
  }
  lines.push(
    '# GGST pipeline report',
    '',
    `- **${records.length}** published records · **${players.size}** players · ` +
      `**${input.characters.length}** fighters`,
    `- **${mirrors}** mirror match(es) (${pct(mirrors, records.length)}) — the stat unit is side ` +
      'appearances, so each adds 2 to one character (scripts/stats.ts)',
    `- **${pending.length}** pending review item(s) — absent from the site, never guessed`,
    `- **${dropped}** duplicate id(s) resolved by intake precedence`,
    `- **${confirmedSeen.length}** of ${CONFIRMED_FIGHTER_NAMED_PLAYERS.length} confirmed ` +
      'fighter-named players present in the registry; every other handle resolves to no fighter',
    '',
    '## Per intake',
    '',
    'A whole-video record on the YouTube channels is a SET (ggst-notes/hydration.md: every set',
    "channel's median duration is 5–10 min against a ~3 min game); the catalogue's offset",
    'segments are MATCHES. `too-short` is judged against the floor in brackets — ggstHq keeps',
    'its Shorts (types/index.ts minDurationSec). There is no `gone` column: an uploads-playlist',
    'walk cannot return a deleted video (0 of 18,509 on the hydration pass), so a vanished upload',
    'is only ever visible as a smaller `raw` count — which is what the collapse guard reads.',
    '',
    '| intake | source | raw | Strive-marked | parsed | published | too-short (floor) | live | rejects naming a fighter |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...CHANNELS.map((c) => {
      const pub = afterByIntake.get(c.id) ?? 0;
      if (c.index) {
        const mode = theater ? theater.mode : theaterCarried !== null ? 'carried' : '—';
        const parsed = theater && theater.mode === 'full' ? String(theater.built.length) : '—';
        return `| ${c.id} _(index, ${mode})_ | ${c.source} | — | — | ${parsed} | ${pub} | — | — | — |`;
      }
      const p = perChannel.get(c.id);
      const tag = c.frozen ? ' _(frozen)_' : '';
      if (!p) return `| ${c.id}${tag} | ${c.source} | — | — | — | ${pub} | — | — | — |`;
      return (
        `| ${c.id}${tag} | ${c.source} | ${p.raw} | ${p.marked} | ${p.parsed} | ${pub} | ` +
        `${p.misses['too-short'] ?? 0} (${p.floorSec}s) | ${p.misses['live'] ?? 0} | ${p.rejectCount} |`
      );
    }),
    '',
  );

  // ── the index intake ─────────────────────────────────────────────────────
  lines.push(
    '### Index intake — Replay Theater',
    '',
    'Fetched by the daily cron and ADD-ONLY: a committed record is carried whether or not the',
    'catalogue still lists it, so this count can only rise. The cron does not depend on the',
    'pull succeeding — on any failure there is no dump, the committed records are carried',
    'against the pin, and the run stays green.',
    '',
  );
  if (theater) {
    const t = theater;
    if (t.mode === 'full') {
      lines.push(
        `Rebuilt from a **full sweep** of ${theaterStats?.pagesRead ?? '—'} page(s): ${t.dumped} row(s) dumped, ` +
          `${t.knownCount} already known here (${pct(t.knownCount, t.dumped)}), ${t.built.length} built, ` +
          `${t.carried} carried (add-only), **${t.total}** total; pin ${pins.replayTheater}.`,
        '',
        `Of the carried, **${t.vanished}** no longer rebuild from the catalogue (the entry vanished,`,
        `or its VOD died — ${theaterStats?.unresolvable ?? '—'} of the sweep's videos did not resolve, ` +
          `${theaterStats?.unresolvablePct ?? '—'}%) and **${t.absorbed}** are now known from a tracked channel.`,
        `Sweep hygiene: ${theaterStats?.badLinks ?? '—'} unusable link(s), ${theaterStats?.collisions ?? '—'} ` +
          `record-id collision(s), ${theaterStats?.wrongGame ?? '—'} wrong-game row(s).`,
        '',
      );
    } else {
      // PER-RUN WINDOW NUMBERS ARE WITHHELD ON A CURSOR MORNING (SF6's rule):
      // dumped/skipped describe this morning's window, not the corpus, and
      // printing them made report.md differ daily whether or not a record
      // changed — which retires the cron's no-change-no-commit rule.
      lines.push(
        `Rebuilt from a **cursor delta**: ${t.built.length} built this run, ${t.carried} carried ` +
          `(add-only), **${t.total}** total; pin ${pins.replayTheater}. "Not in this pull" is withheld: ` +
          'on a cursor morning it is every record older than the pages read and means nothing.',
        '',
      );
    }
    lines.push(
      `Rows the build refused, counted never guessed: ${t.placeholder} placeholder handle(s) ` +
        `(\`Unknown Player\`, \`GG Player\`, …), ${t.beforeFloor} before the ${idx?.preReleaseFrom ?? LAUNCH} floor, ` +
        `${t.live} live, ${t.tooShort} whole-video row(s) under ${t.floorSec}s, ${t.excluded} excluded by hand, ` +
        `${t.dupIds} duplicate record id(s) inside the dump.`,
      ...(t.unresolvedChars.size
        ? [
            '',
            'Character strings the roster could not resolve EXACTLY (an alias-table candidate, or a',
            'renamed fighter upstream — Dizzy → Queen Dizzy is the live case):',
            ...[...t.unresolvedChars.entries()]
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .slice(0, 20)
              .map(([s, n]) => `- ${n}× \`${s}\``),
          ]
        : []),
      '',
    );
  } else if (theaterCarried !== null) {
    lines.push(
      pullRan
        ? `The pull ran and found nothing newer than the cursor, so the committed catalogue was ` +
            `carried unchanged: **${theaterCarried}** record(s), pin ${pins.replayTheater}. A quiet ` +
            'morning is the ordinary case here, not a failed one.'
        : `No pull produced a dump this run, so the committed catalogue was carried against its pin: ` +
            `**${theaterCarried}** record(s). That is the designed fallback, not a failure of this run; ` +
            '`npm run data:theater` refreshes it.',
      '',
    );
  }
  if (theaterStats?.hitCursorBound) {
    lines.push(
      '_⚠ The cursor hit its page bound this run — entries may be unreached._',
      '_Nothing is lost (add-only); `npm run data:theater -- --full` reconciles._',
      '',
    );
  }

  // ── misses, per channel ──────────────────────────────────────────────────
  lines.push(
    '## Misses, per intake',
    '',
    'Four fifths of the recon miss rate was the gate working (recon/channels-live.md §5): lab',
    'shorts, tournament index pages and character-only clips are correct rejections. The columns',
    'that name a parser problem are `no-char`, `no-handle` and `slot-ambiguous`.',
    '',
    `| intake | ${missKinds.join(' | ')} | excluded |`,
    `| --- | ${missKinds.map(() => '---:').join(' | ')} | ---: |`,
    ...titleChannels.flatMap((c) => {
      const p = perChannel.get(c.id);
      if (!p) return [];
      return [
        `| ${c.id} | ${missKinds.map((k) => p.misses[k] ?? 0).join(' | ')} | ${p.excluded} |`,
      ];
    }),
    '',
  );

  // ── slot order ───────────────────────────────────────────────────────────
  lines.push(
    '## Slot order, per intake — both sides tallied',
    '',
    'The parser resolves by roster membership and only RECORDS which slot held the fighter',
    '(types/index.ts SlotOrder). `tie-broken` is the one branch where the declared order decided:',
    'both spans resolved to a fighter. A channel whose resolved majority disagrees with its',
    'declared order, or whose tie-broken rate climbs, is drifting. CotW collected this and never',
    'printed it.',
    '',
    `| intake | declared | ${SLOT_ORDERS.join(' | ')} | tie-broken | sides |`,
    `| --- | --- | ${SLOT_ORDERS.map(() => '---:').join(' | ')} | ---: | ---: |`,
    ...titleChannels.flatMap((c) => {
      const p = perChannel.get(c.id);
      if (!p) return [];
      const sides = SLOT_ORDERS.reduce((n, k) => n + p.slot[k], 0);
      const top = [...SLOT_ORDERS].sort((a, b) => p.slot[b] - p.slot[a])[0] ?? c.slotOrder;
      const bracketed = c.slotOrder === 'handle-outside' || c.slotOrder === 'chars-outside';
      const drift = sides > 0 && bracketed && top !== c.slotOrder ? ` ⚠ resolves ${top}` : '';
      return [
        `| ${c.id} | ${c.slotOrder}${drift} | ${SLOT_ORDERS.map((k) => p.slot[k]).join(' | ')} | ` +
          `${p.tieBroken} (${pct(p.tieBroken, sides)}) | ${sides} |`,
      ];
    }),
    '',
    '_On a `handle-first-bare` channel a `chars-outside` share is the "Zato Brian" shape —_',
    "_side 2 written character-first — and is expected; it is the channel's own inconsistency,_",
    '_read rather than guessed._',
    '',
  );

  // ── duration histogram ───────────────────────────────────────────────────
  const bucketNames = DURATION_BUCKETS.map(([name]) => name);
  lines.push(
    '## Duration histogram, per intake',
    '',
    `The floor (${MIN_MATCH_SEC}s default, per-channel where declared) is re-derived from this table, not from`,
    'a comment: `match-shaped misses` are too-short uploads whose TITLE parsed as a matchup — the',
    'population a lower floor would admit. Measured 2026-09-08 (ggst-notes/hydration.md): clips',
    'and lab shorts everywhere below 120s except ggstHq, whose Shorts are titled matchups.',
    '',
    `| intake · population | ${bucketNames.join(' | ')} |`,
    `| --- | ${bucketNames.map(() => '---:').join(' | ')} |`,
    ...titleChannels.flatMap((c) => {
      const h = durations.get(c.id);
      if (!h) return [];
      const row = (label: string, m: Record<string, number>) =>
        `| ${c.id} · ${label} | ${bucketNames.map((b) => m[b] ?? 0).join(' | ')} |`;
      return [
        row('records', h.records),
        row('match-shaped misses', h.matchShapedMisses),
        row('other misses', h.otherMisses),
      ];
    }),
    '',
  );

  // ── handles ──────────────────────────────────────────────────────────────
  const placeholderTitles = [...perChannel.values()].reduce((n, p) => n + p.placeholderHandles, 0);
  lines.push(
    '## Handles',
    '',
    `- word count per side: ${Object.entries(handleWords)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, n]) => `${k} → ${n}`)
      .join(
        ' · ',
      )} — the cap is 5 words (parse.ts MAX_HANDLE_WORDS: measured 2026-09-09, the 4-word band is real and the 5-word band is where decoration leaks show first; CotW measured 4)`,
    `- ${multiSpelling} player(s) seen under more than one spelling; the display casing is the majority` +
      ' spelling, tie-broken toward mixed case, and the rest are kept as aliases',
    `- placeholder handles refused: ${placeholderTitles} on the channels, ${theater?.placeholder ?? 0} in the catalogue`,
    '',
  );

  // ── version tokens ───────────────────────────────────────────────────────
  const withTokens = titleChannels.filter((c) => {
    const p = perChannel.get(c.id);
    return p && Object.keys(p.versionTokens).length > 0;
  });
  if (withTokens.length) {
    lines.push(
      '## Version tokens — counted, never a patch',
      '',
      'ggstHq opens 2,864 of its 2,994 titles with a bare version ("5.2", "5.1"); ggstBattleCollection',
      'glues one to the marker ("GGST2.0"). They are NOT parsed into Replay.patch: ArcSys publishes two',
      'version spaces (game X.YY, Battle Version), "5.2" exists in neither as a patch-note title, and a',
      'token that appears in no source may not be minted (scripts/seasons.ts). The HYPOTHESIS is that',
      'they are Battle Versions; the columns test it against the date-derived patch, per record.',
      '',
      '| intake | tokens | = battle version | = game version | = both | neither | no window |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
      ...withTokens.map((c) => {
        const p = perChannel.get(c.id);
        if (!p) return '';
        const mix = Object.entries(p.versionTokens)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 6)
          .map(([t, n]) => `${t}×${n}`)
          .join(', ');
        const a = p.versionAgree;
        return `| ${c.id} | ${mix} | ${a.battle} | ${a.game} | ${a.both} | ${a.neither} | ${a.unknown} |`;
      }),
      '',
    );
  }

  // ── registry invariant ───────────────────────────────────────────────────
  lines.push(
    '## Registry invariant — no player is a fighter',
    '',
    `Every handle in players.json was resolved through the roster matcher at parse time. ` +
      `${confirmedSeen.length} resolve to a fighter and are on the confirmed list (scripts/roster.ts): ` +
      (confirmedSeen.length ? confirmedSeen.map((id) => `\`${id}\``).join(', ') : '—') +
      '.',
    ...(confirmedUnseen.length
      ? [
          `Confirmed rows NOT present in this registry (stale, or a spelling the parser now reads ` +
            `differently): ${confirmedUnseen.map((p) => `\`${p.id}\``).join(', ')}.`,
        ]
      : []),
    ...(confirmedNoEvidence.length
      ? [
          `⚠ Rows still carrying \`video: null\` — a guess until a human watches one: ` +
            `${confirmedNoEvidence.map((p) => `\`${p.id}\``).join(', ')}.`,
        ]
      : []),
    '',
  );

  // ── rejects (checklist 5e) ───────────────────────────────────────────────
  lines.push(
    '## Rejects — titles that name a fighter but did not parse, per intake',
    '',
    'Grammar variants are found by reading REJECTS, not successes (checklist 5e). Ten samples per',
    'intake; the count is the whole population. Tōkon and 2XKO print this at fetch time from an',
    'approximate shape; this is the precise version, straight from the parser.',
    '',
    ...titleChannels.flatMap((c) => {
      const p = perChannel.get(c.id);
      if (!p || p.rejectCount === 0) return [];
      return [
        `**${c.id}** — ${p.rejectCount}`,
        '',
        ...p.rejects.map((r) => `- \`${r.id}\` ${r.kind}: ${r.title.slice(0, 110)}`),
        '',
      ];
    }),
  );

  // ── residue, and the RANK_PREFIX leak measured against it ────────────────
  // The residue gate is the coverage test for parse.ts RANK_PREFIX: a rank
  // spelling the strip did not catch survives into the text no roster span
  // covered, so it is counted here by shape rather than asserted by the regex
  // that was supposed to remove it. Residue is only collected from MISSES, so
  // this reads the leak on the rows the parser could not read; a leak on a
  // parsed row shows up in the handle word-count table instead, as a handle
  // one or two words longer than the channel's norm.
  const RANK_SHAPED =
    /(?:^|[^\p{L}\p{N}])(?:#?\d+(?:st|nd|rd|th)?\s*ranked?|ranked?\s*(?:#?\d+|top)|top\s*ranked?|high\s*rank|#\d+)(?![\p{L}\p{N}])/iu;
  const rankLeaks = residueRows.filter(([text]) => RANK_SHAPED.test(text));
  const rankLeakRows = rankLeaks.reduce((n, [, c]) => n + c, 0);
  lines.push(
    '## Residue — text no roster span covered',
    '',
    'A new nickname, a DLC fighter or an uploader typo surfaces here as a counted',
    'line with its literal text, instead of vanishing into a silently shorter side.',
    '',
    `RANK_PREFIX leak (parse.ts): **${rankLeaks.length}** residue line(s) over ${rankLeakRows} miss(es) still ` +
      'carry a rank-shaped token ("#1 Ranked", "Rank 1st", "Rank TOP", "HIGH RANK", a bare "#2"). ' +
      'Zero means every measured spelling was stripped on the rows the parser rejected; a non-zero ' +
      'line names the spelling to add.',
    ...(rankLeaks.length
      ? ['', ...rankLeaks.slice(0, 10).map(([text, n]) => `- leak ${n}× \`${text}\``)]
      : []),
    '',
    ...residueRows.slice(0, 40).map(([text, n]) => `- ${n}× \`${text}\``),
    ...(residueRows.length > 40 ? [`- … ${residueRows.length - 40} more`] : []),
    '',
    ...formatCrossCheck(artifact),
    ...notes.map((n) => `> ${n}`),
    '',
    `_Generated ${new Date().toISOString()}_`,
  );
  await writeFile(join(DATA, 'report.md'), `${lines.filter((l) => l !== undefined).join('\n')}\n`);

  if (witnessResult && witness?.mode !== 'full') {
    const c = witnessResult.characters;
    console.log(
      `  cross-check (cursor window, not committed): ${witnessResult.compared} record(s), ` +
        `${witnessResult.players.both} both-handles, ${c.agree}/${c.sides} character sides agree, ` +
        `${witnessResult.disagreements.length} disagreement(s)`,
    );
  }
  console.log(
    `✓ ${records.length} records · ${players.size} players · ${pending.length} pending · ` +
      `${residueRows.length} residue line(s) · ${mirrors} mirror(s)` +
      (cursorWrite !== null ? ` · theater cursor → ${cursorWrite}` : ''),
  );
  if (due.length) {
    console.error(
      `\n⚠ ${due.length} expiry(s) due — see the ACTION REQUIRED block in data/report.md`,
    );
  }
}

// ── the index intake ────────────────────────────────────────────────────────

interface TheaterBuild {
  built: MatchVideo[];
  /** The known-anywhere map the build skipped against — video id → where. */
  known: Map<string, string>;
  /** Rows skipped because the video is known anywhere. */
  knownCount: number;
  placeholder: number;
  beforeFloor: number;
  live: number;
  tooShort: number;
  excluded: number;
  dupIds: number;
  unresolvedChars: Map<string, number>;
}
interface TheaterMerge extends TheaterBuild {
  /** The duration floor whole-video rows were judged against. */
  floorSec: number;
  mode: 'cursor' | 'full' | 'unknown';
  dumped: number;
  carried: number;
  absorbed: number;
  vanished: number;
  total: number;
}

export function buildTheaterRecords(
  dump: TheaterRawRecord[],
  ctx: {
    records: MatchVideo[];
    committed: MatchVideo[];
    overrides: Record<string, VideoOverride>;
    rawSeen: Map<string, string>;
    matcher: AliasMatcher;
    floor: string;
    /** The duration floor for WHOLE-VIDEO rows (the index has no
     *  minDurationSec today, so this is MIN_MATCH_SEC). */
    floorSec: number;
    windows: ReturnType<typeof patchWindows>;
  },
): TheaterBuild {
  // IGNORE-IF-KNOWN, AND IT RUNS FIRST. If this repo has already ruled on a
  // video IN ANY CAPACITY, the catalogue entry is ignored — not merged, not
  // preferred, ignored. FOUR ARMS: every id any title dump held (pre-gate, so
  // an upload the marker refused stays refused), every record this run built,
  // every committed record from ANOTHER intake, and every override. It keys on
  // the VIDEO id, not the record id, and it is doing the heavy lifting here
  // rather than catching an edge case: 77.70% of the catalogue's 14,928 videos
  // are already ours (recon/replay-theater-live.md §5).
  //
  // THE INDEX INTAKE'S OWN COMMITTED RECORDS ARE EXCLUDED — the third arm
  // reads "committed minus THIS intake's rows" — and that is not an
  // optimisation: 13,402 of this catalogue's rows are whole videos whose
  // record id IS the video id. Note them here and on run 2 every one of them
  // matches itself, every candidate is skipped as "already known", the run
  // builds ZERO, and the add-only ratchet throws. The siblings get this for
  // free because all their ids are `vid@start`; CotW found it the hard way
  // (parse-finish.ts:403-417).
  const known = new Map<string, string>();
  const note = (id: string, where: string) => {
    if (!known.has(id)) known.set(id, where);
  };
  for (const [id, where] of ctx.rawSeen) note(id, where);
  for (const v of ctx.records) note(v.videoId ?? v.id, `this run (${v.intake})`);
  for (const v of ctx.committed) {
    if (v.intake === 'replayTheater') continue;
    note(v.videoId ?? v.id, `videos.json (${v.intake})`);
  }
  for (const [id, ov] of Object.entries(ctx.overrides)) {
    note(id, ov.exclude === true ? 'overrides.json (excluded)' : 'overrides.json');
  }

  const out: MatchVideo[] = [];
  const seenHere = new Set<string>();
  const unresolvedChars = new Map<string, number>();
  const counts = {
    knownCount: 0,
    placeholder: 0,
    beforeFloor: 0,
    live: 0,
    tooShort: 0,
    excluded: 0,
    dupIds: 0,
  };
  for (const r of dump) {
    if (known.has(r.videoId)) {
      counts.knownCount++;
      continue;
    }
    // An override keyed on the RECORD id — a segment's `vid@start` — is not in
    // `known` (that map is keyed by video id), so the exclude verdict is read
    // here as well.
    if (ctx.overrides[r.id]?.exclude) {
      counts.excluded++;
      continue;
    }
    if (seenHere.has(r.id)) {
      counts.dupIds++;
      continue;
    }
    seenHere.add(r.id);
    const day = r.publishedAt.slice(0, 10);
    if (day < ctx.floor) {
      counts.beforeFloor++;
      continue;
    }
    if (r.liveBroadcastContent !== 'none') {
      counts.live++;
      continue;
    }
    // The duration floor applies where a duration is KNOWN: a whole-video row
    // carries the VOD's own; a segment carries 0 (fetch-theater.ts — there is
    // nothing honest to derive one from) and passes. A whole-video row here is
    // a SET like any channel record; a segment is a MATCH, and no floor is
    // asked of it (ggst-notes/hydration.md).
    if (r.durationSec > 0 && r.durationSec < ctx.floorSec) {
      counts.tooShort++;
      continue;
    }

    // PLACEHOLDER HANDLES NEVER MINT A PLAYER. `Unknown Player` ×504, `GG
    // Player`, `GG PLAYER`, `Honest Player`, `GG player` — 645 side appearances
    // — are a witness that declined to name the player. The row is dropped and
    // counted; the shared predicate is crosscheck.ts's, so the intake and the
    // witness cannot disagree about what a placeholder is.
    const handles = r.players.map((p) => normalizeText(stripTheaterSponsor(p)));
    if (handles.some((h) => !h || isPlaceholderHandle(h))) {
      counts.placeholder++;
      continue;
    }

    // Characters resolve on the roster's OWN matcher, EXACTLY — one alias span
    // covering the whole string (crosscheck.ts exactAlias). The catalogue's
    // spellings are not automatically ours (`Queen Dizzy`, `Asuka R♯`,
    // `Bedman?`, `Jack-O'` all resolve through the flexible-punctuation class
    // without an alias entry) and an unresolved string is COUNTED, never
    // minted as a fighter that does not exist. Exact rather than a scan, so
    // "Sol Badguy Player" can never read as Sol.
    const sides = ([0, 1] as const).map<MatchSide | null>((i) => {
      const ids: string[] = [];
      for (const name of r.characters[i] ?? []) {
        const id = exactAlias(ctx.matcher, name);
        if (id === undefined) {
          unresolvedChars.set(name, (unresolvedChars.get(name) ?? 0) + 1);
          continue;
        }
        if (!ids.includes(id)) ids.push(id);
      }
      const handle = handles[i] ?? '';
      const player = playerId(handle);
      if (!player || ids.length === 0) return null;
      return {
        player,
        handle,
        characters: ids,
        provenance: {
          tier: 'index',
          tiers: ['index'],
          fromTitle: [],
          fromIndex: ids,
          complete: true,
        },
      };
    });
    const [s0, s1] = sides;
    if (!s0 || !s1) continue;

    const season = seasonForDate(day);
    const w = patchForDate(day, ctx.windows);
    out.push({
      id: r.id,
      channel: 'replayTheater',
      intake: 'replayTheater',
      title: normalizeText(r.title),
      publishedAt: r.publishedAt,
      durationSec: r.durationSec,
      ...(r.viewCount ? { viewCount: r.viewCount } : {}),
      season,
      patch: w && w.season === season ? w.version : seasonToken(season),
      // A record is only a SEGMENT when the catalogue gave it an offset. On the
      // untagged arm the entry IS the whole video, so it carries neither field
      // and the engine treats it exactly like a channel record. Both arms are
      // load-bearing here — 8,542 offset rows against 13,402 without
      // (types/index.ts ChannelIndex).
      ...(r.startSeconds !== undefined && r.startSeconds > 0
        ? { videoId: r.videoId, startSeconds: r.startSeconds }
        : {}),
      sides: [s0, s1],
    });
  }
  return { built: out, known, unresolvedChars, ...counts };
}
