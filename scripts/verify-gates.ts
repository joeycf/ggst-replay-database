/**
 * THE POSITIVE-CONTROL SUITE — checklist step 10.
 *
 * "Inject the failure each gate exists to catch and confirm it exits non-zero,
 * then confirm the clean run exits 0. A gate that cannot fail is
 * indistinguishable from a gate that passes, and you will trust it."
 *
 * Every control below injects a REAL defect into a REAL file, runs the REAL
 * command, and requires a non-zero exit. Six of them are not hypothetical:
 * the shared-start-date control reproduces the CMS error that mis-filed 950
 * records on CotW; the battle-version control reproduces the FROM/TO
 * transcription defect scripts/patch-check.ts caught on this table on
 * 2026-09-08; the banned-alias control reproduces the "Griffon" collision as
 * "Jack", a prolific handle on two of these channels; the registry-invariant
 * control reproduces the 67 titles the recon parsed confidently wrong into
 * player pages named after fighters; the crosshair control reproduces the four
 * BUST_HEAD rows that shipped pointing at empty background on 2026-09-09; and
 * the frozen-pin control exercises the branch that has NEVER executed on any
 * sibling.
 *
 * ── WHAT THIS PORT FIXES IN CotW's HARNESS (recon/ff-gates.md §10) ─────────
 *
 * 1. `r.status !== 0` COUNTED `null` AS A PASS. spawnSync returns status null
 *    when the child is killed by a signal or never spawns (missing npx, OOM),
 *    so a control that never ran reported PASS — the one outcome a positive
 *    control exists to make impossible. `verdict()` below requires an actual
 *    non-zero NUMBER and names the signal when there is none.
 *
 * 2. SEVEN OF CotW's CONTROLS DEGRADED TO A SOFT SKIP on a fresh checkout (no
 *    raw/ dumps, empty corpus), and verify:gates is not in CI, so they only
 *    ever exercised on a machine that had just fetched. A skip here is legal
 *    ONLY for a precondition that is genuinely absent, it must NAME which one,
 *    and it is counted and reprinted at the end. Everything else — an anchor
 *    that no longer matches, a run that tripped a DIFFERENT gate — is a
 *    FAILURE. All eight raw dumps and a 24,706-record videos.json are present
 *    in this repo, so nothing below skips on a normal run.
 *
 * 3. THE INJECTED RUN HAD TO EXIT NON-ZERO AND NOTHING MORE, so a control
 *    could trip a neighbouring gate and still report PASS. That is not a
 *    theoretical risk: CotW's collapse-guard injection, ported here verbatim,
 *    drops the NEWEST 40% of the marked rows and therefore trips the
 *    STALE-RAW guard instead — measured 2026-09-09, "raw/ggHighLevel.json is
 *    stale", never a word about a collapse. Every control now declares the
 *    rule its run must NAME, and the collapse control drops from the OLD end.
 *
 * 4. RESTORE WROTE A ZERO-LENGTH FILE where a file had not existed. `restore()`
 *    unlinks instead, so `data/player-redirects.json` — which
 *    scripts/redirects.ts seeds on first run — is left exactly as found.
 *
 * ── 10c: THIS SUITE MUST NOT REPAIR THE CONDITION IT TESTS ────────────────
 * A suite that snapshots data and restores it in a `finally` also refreshes
 * MTIMES, so a guard keyed on mtime can never fire again after the first run.
 * That trap cannot be sprung here, and it is worth saying why rather than
 * relying on luck: this repo's stale-raw guard reads ONLY DATA — the newest
 * publishedAt in the dump against the newest committed record for that intake
 * (scripts/parse.ts assertRawIsFresh). It consults no filesystem metadata at
 * all, so `cp`, `git checkout`, a fresh clone and this suite's own restore are
 * invisible to it. The suite still restores byte-exactly and asserts a clean
 * run afterwards, so a control that corrupted state shows up immediately.
 *
 * ── COST, MEASURED 2026-09-09 ─────────────────────────────────────────────
 * parse 2.2s · emit 0.6s · seasons/characters/expiries/redirects <1s each ·
 * art 3.1s (it fetches the Fan Kit PAGE and, for the crosshair control, six
 * cutouts) · patch-check 1.5s (ArcSys's WordPress feed, read-only) · each
 * theater control ~5s (a local fixture plus one YouTube videos.list batch).
 *
 * Run: npm run verify:gates
 *      npm run verify:gates -- --only=<substring>
 *      npm run verify:gates -- --no-network   (skip the vendor/API controls,
 *                                              named rather than silent)
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const NO_NETWORK = process.argv.includes('--no-network');

// ── file helpers ────────────────────────────────────────────────────────────

const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const write = (p: string, s: string): void => writeFileSync(join(ROOT, p), s);
const readJson = <T>(p: string): T => JSON.parse(read(p)) as T;

/** Replace exactly once, asserting the anchor still exists — a control whose
 *  anchor has drifted silently becomes a no-op that reports PASS. Returning
 *  false is a FAILURE below, never a skip. */
const sub = (p: string, from: string, to: string): boolean => {
  const s = read(p);
  if (!s.includes(from)) return false;
  write(p, s.replace(from, to));
  return true;
};

/** Delete a whole declaration — `from` through the next `};` — and replace it
 *  with `to`. Both ends are asserted, because a half-matched cut is a syntax
 *  error that fails for the wrong reason and proves nothing. Used by the Lucy
 *  control, whose defect is the REMOVAL of a licence row rather than an edit
 *  to one. */
const cutBlock = (p: string, from: string, to: string): boolean => {
  const s = read(p);
  const i = s.indexOf(from);
  if (i < 0) return false;
  const j = s.indexOf('\n};', i);
  if (j < 0) return false;
  write(p, s.slice(0, i) + to + s.slice(j + '\n};'.length));
  return true;
};

// ── the runner ──────────────────────────────────────────────────────────────

interface Run {
  /** null when the child was signalled or never spawned — see verdict(). */
  status: number | null;
  signal: NodeJS.Signals | null;
  /** stdout and stderr concatenated: a gate may name its rule on either. */
  out: string;
  error?: Error;
}

const run = (cmd: string[], env: NodeJS.ProcessEnv = {}): Run => {
  const r = spawnSync('npx', cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  return {
    status: r.status,
    signal: r.signal,
    out: `${r.stdout ?? ''}\n${r.stderr ?? ''}`,
    ...(r.error ? { error: r.error } : {}),
  };
};

/**
 * The ASYNCHRONOUS runner, and it is not a stylistic alternative to run().
 *
 * The Replay Theater controls serve their fixture from an http server INSIDE
 * this process, and spawnSync blocks the event loop: the child's first request
 * is never answered, it retries four times with backoff and dies. Measured
 * 2026-09-09 — the first cut of this file hung on that for two minutes per
 * control before failing for the wrong reason.
 *
 * It also spawns DETACHED, in its own process group, so `killAfterMs` can
 * signal the node child rather than only the npx wrapper — see the
 * partial-resume control, where killing the wrapper writes no cache and the
 * control proves nothing.
 */
function runAsync(cmd: string[], env: NodeJS.ProcessEnv, killAfterMs?: number): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn('npx', cmd, {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      out += d.toString();
    });
    // NEGATIVE PID = the whole process group. `kill(child.pid)` would hit npx
    // only; tsx would keep walking, never flush its cache, and the resume half
    // of the control would have nothing to resume from.
    const timer =
      killAfterMs === undefined
        ? undefined
        : setTimeout(() => {
            try {
              if (child.pid) process.kill(-child.pid, 'SIGTERM');
            } catch {
              /* already gone */
            }
          }, killAfterMs);
    child.on('exit', (status, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ status, signal, out });
    });
    child.on('error', (error: Error) => {
      if (timer) clearTimeout(timer);
      resolve({ status: null, signal: null, out, error });
    });
  });
}

// ── verdicts ────────────────────────────────────────────────────────────────

type Verdict =
  | { kind: 'pass'; detail?: string }
  | { kind: 'fail'; detail: string }
  | { kind: 'skip'; detail: string }
  /** A control that CAN inject its defect and finds no gate to fire. Not a
   *  pass (nothing was proven) and not an anchor drift (the injection worked)
   *  — a named hole in the pipeline, reprinted at the end. */
  | { kind: 'gap'; detail: string };

const pass = (detail?: string): Verdict => ({ kind: 'pass', ...(detail ? { detail } : {}) });
const fail = (detail: string): Verdict => ({ kind: 'fail', detail });
const skip = (detail: string): Verdict => ({ kind: 'skip', detail });
const gap = (detail: string): Verdict => ({ kind: 'gap', detail });

const head = (r: Run, n = 4): string =>
  r.out
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, n)
    .join(' / ')
    .slice(0, 300);

/**
 * The default assertion: the run must exit with a REAL non-zero number AND
 * name the rule it was supposed to trip.
 *
 * `status === null` is the fix for CotW weakness 1. A signalled or unspawnable
 * child reports `status: null`, `null !== 0` is true, and the control that
 * never ran printed PASS.
 */
const verdict = (r: Run, names: RegExp): Verdict => {
  if (r.error) return fail(`the command never ran: ${r.error.message}`);
  if (r.status === null) {
    return fail(
      `no exit status — the child was killed by ${r.signal ?? 'an unknown signal'}. ` +
        `\`status !== 0\` would have called this a PASS.`,
    );
  }
  if (r.status === 0) return fail(`exited 0 with the defect present`);
  if (!names.test(r.out)) {
    return fail(
      `exited ${r.status}, but on a DIFFERENT rule — nothing in the output matches ${names}. ` +
        `A control that trips the wrong gate proves nothing. Got: ${head(r)}`,
    );
  }
  return pass(`exit ${r.status}`);
};

// ── controls ────────────────────────────────────────────────────────────────

/** `true` injected · a string is a NAMED skip (a genuinely absent
 *  precondition) · `false` is anchor drift, which is a FAILURE. */
type Injected = true | false | string;

interface Control {
  /** What the gate protects, phrased as the failure it refuses. */
  name: string;
  /** Files this control edits; each is snapshotted and restored byte-exactly
   *  (or unlinked, if it did not exist). */
  files: string[];
  /** Apply the defect. */
  inject: () => Injected;
  /** The command that must exit non-zero. */
  cmd: string[];
  /** The rule the run must NAME. See fix 3 in the header. Required unless the
   *  control brings its own `assert`. */
  names?: RegExp;
  /** Replaces the default assertion, for a gate that is a MEASUREMENT rather
   *  than an exit code (the marker and the normalisation controls). */
  assert?: (r: Run) => Verdict;
  /** Extra environment for the run. */
  env?: NodeJS.ProcessEnv;
  /** This control talks to the network (the vendor, the Fan Kit, YouTube). */
  network?: boolean;
}

/** The clean marked-upload count, MEASURED by a clean parse at the top of the
 *  run rather than remembered from a comment — see measureBaseline(). */
let markedBaseline: number | null = null;

// Everything scripts/parse.ts and scripts/emit.ts write. Listed so a control
// whose run COMPLETES (the marker and normalisation controls do) restores the
// committed artifacts byte-exactly rather than leaving a defective corpus on
// disk for the next control to read as its baseline.
const PARSE_OUTPUTS = [
  'data/videos.json',
  'data/players.json',
  'data/review-queue.json',
  'data/source-pins.json',
  'data/report.md',
  'data/theater-cursor.json',
  'data/theater-disagreements.json',
];

// ── report.md readers, for the two controls whose gate is a measurement ─────
//
// report.md is the only place the parse states what it SAW rather than what it
// kept, which is what a marker regression and a slot-order flip move. Both are
// read out of the committed report as a baseline and re-read after the defect;
// the baseline is MEASURED by a clean run at the top of each control, never
// remembered from a comment, so an unrelated corpus change cannot make either
// control quietly meaningless.

const section = (md: string, heading: string): string => {
  const i = md.indexOf(heading);
  if (i < 0) return '';
  const j = md.indexOf('\n## ', i + heading.length);
  return md.slice(i, j < 0 ? undefined : j);
};

const rows = (md: string, heading: string): string[][] =>
  section(md, heading)
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| ---'))
    .map((l) => l.split('|').map((c) => c.trim()));

/** Total of the `Strive-marked` column of the per-intake table — the number of
 *  uploads the marker gate admitted, across every YouTube intake. */
const markedTotal = (md: string): number => {
  let total = 0;
  for (const cells of rows(md, '## Per intake')) {
    const n = Number(cells[4]);
    if (Number.isFinite(n)) total += n;
  }
  return total;
};

// ── the fixture endpoint for the Replay Theater controls ────────────────────
//
// CotW shipped ZERO controls over its index intake (recon/ff-theater.md row I):
// its parse-finish comment says the carry is "caught by the clean half of
// verify:gates", i.e. by the pin on a run where nothing was injected. These
// four inject.
//
// THE FIXTURE IS BUILT FROM raw/replayTheater.witness.json, not from a file in
// somebody's scratch directory. The witness is EVERY catalogue entry of the
// read window in the catalogue's own shape (scripts/fetch-theater.ts writes
// it, scripts/crosscheck.ts reads it), so it is exactly what the endpoint
// serves — which makes these controls self-contained, reproducible from a
// checkout that has run `npm run data:theater` once, and honest: they replay
// real rows rather than invented ones.
const WITNESS = 'raw/replayTheater.witness.json';
const FIXTURE_PAGE_SIZE = 50;
const FIXTURE_PAGES = 4;

interface WitnessEntry {
  id?: number;
  video_link?: string | null;
  [k: string]: unknown;
}

interface Fixture {
  endpoint: string;
  stop: () => void;
  entries: WitnessEntry[];
}

/**
 * Serve the newest `FIXTURE_PAGES × FIXTURE_PAGE_SIZE` witness entries as the
 * catalogue does: newest first, `?game=strive&page=N`, an empty `matches` past
 * the last page, HTTP 400 on any other slug (the live endpoint validates
 * `game` — probed 2026-09-07).
 *
 * NEWEST FIRST IS LOAD-BEARING, not cosmetic: the cursor-plausibility bound
 * reads the highest id on PAGE 1 and calls anything above it impossible.
 */
async function startFixture(mutate?: (entries: WitnessEntry[]) => void): Promise<Fixture | string> {
  if (!existsSync(join(ROOT, WITNESS))) {
    return `no ${WITNESS} — run \`npm run data:theater\` once to cut one`;
  }
  const file = readJson<{ entries?: WitnessEntry[] }>(WITNESS);
  const all = [...(file.entries ?? [])].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  const entries = all.slice(0, FIXTURE_PAGES * FIXTURE_PAGE_SIZE);
  if (entries.length < FIXTURE_PAGES * FIXTURE_PAGE_SIZE) {
    return `${WITNESS} holds ${entries.length} entr(ies), fewer than the ${
      FIXTURE_PAGES * FIXTURE_PAGE_SIZE
    } the fixture pages`;
  }
  mutate?.(entries);
  const total = entries.length;
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture');
    if (url.pathname !== '/api/matches') {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    if (url.searchParams.get('game') !== 'strive') {
      res.writeHead(400);
      res.end('Invalid game');
      return;
    }
    const page = Number(url.searchParams.get('page') ?? '1');
    const slice = entries.slice((page - 1) * FIXTURE_PAGE_SIZE, page * FIXTURE_PAGE_SIZE);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ matches: slice, total_count: total }));
  });
  // AWAIT THE `listening` EVENT. `server.address()` read straight after
  // listen() returns null — the bind has not happened yet — and the first cut
  // of this file therefore reported four NAMED SKIPS that looked entirely
  // plausible ("the fixture server would not bind"). A skip that is really a
  // bug is the same lie as a pass that is really a bug.
  const port = await new Promise<number | null>((resolve) => {
    server.once('error', () => resolve(null));
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(addr && typeof addr !== 'string' ? addr.port : null);
    });
  });
  if (port === null) {
    server.close();
    return 'the fixture server would not bind on 127.0.0.1';
  }
  return {
    endpoint: `http://127.0.0.1:${port}/api/matches`,
    stop: () => server.close(),
    entries,
  };
}

/** Everything a theater pull touches. Snapshotted around every theater
 *  control: `fetch-theater --fresh` DELETES raw/replayTheater.json before its
 *  first request, so a control that forgot this file would destroy an 8 MB
 *  committed dump and the clean run would then be measuring the fixture. */
const THEATER_FILES = [
  'raw/replayTheater.json',
  'raw/replayTheater.witness.json',
  'raw/.replayTheater.stats.json',
  'raw/.replayTheater.partial.json',
  'data/theater-cursor.json',
  'data/source-pins.json',
];

const CONTROLS: Control[] = [
  // ── the patch table (scripts/seasons.ts) ─────────────────────────────────
  {
    name: 'patches: two patches share a start date (the CMS error that mis-filed 950 records on CotW)',
    cmd: ['tsx', 'scripts/seasons.ts', '--check'],
    files: ['scripts/seasons.ts'],
    names: /both start 2026-05-14/,
    inject: () =>
      sub(
        'scripts/seasons.ts',
        "    version: '2.02',\n    start: '2026-07-02',",
        "    version: '2.02',\n    start: '2026-05-14',",
      ),
  },
  {
    name: 'patches: a future-dated patch (a typo year mints an empty window and asserts clean)',
    cmd: ['tsx', 'scripts/seasons.ts', '--check'],
    files: ['scripts/seasons.ts'],
    names: /in the FUTURE/,
    inject: () =>
      sub(
        'scripts/seasons.ts',
        "    version: '2.02',\n    start: '2026-07-02',",
        "    version: '2.02',\n    start: '2027-07-02',",
      ),
  },
  {
    name: 'patches: an era whose first patch is not its opener',
    cmd: ['tsx', 'scripts/seasons.ts', '--check'],
    files: ['scripts/seasons.ts'],
    names: /S5 opens 2026-04-09 but its first patch/,
    inject: () =>
      sub(
        'scripts/seasons.ts',
        "    version: '2.00',\n    start: '2026-04-09',",
        "    version: '2.00',\n    start: '2026-04-10',",
      ),
  },
  {
    name: 'patches: version order and date order disagree (the transposed digit)',
    cmd: ['tsx', 'scripts/seasons.ts', '--check'],
    files: ['scripts/seasons.ts'],
    names: /version order and date order disagree/,
    inject: () =>
      sub(
        'scripts/seasons.ts',
        "{ version: '1.51', start: '2025-10-22',",
        "{ version: '1.51', start: '2026-03-01',",
      ),
  },
  {
    name: 'patches: an era gap (seasonForDate then throws on a real record at parse time)',
    cmd: ['tsx', 'scripts/seasons.ts', '--check'],
    files: ['scripts/seasons.ts'],
    names: /era gap\/overlap: S1 ends/,
    inject: () =>
      sub(
        'scripts/seasons.ts',
        "    season: 1,\n    start: LAUNCH,\n    end: '2022-06-10',",
        "    season: 1,\n    start: LAUNCH,\n    end: '2022-06-12',",
      ),
  },
  {
    name: 'patches: the newest era is not left open (the current season stops collecting)',
    cmd: ['tsx', 'scripts/seasons.ts', '--check'],
    files: ['scripts/seasons.ts'],
    names: /the newest era must be open/,
    inject: () =>
      sub(
        'scripts/seasons.ts',
        "    season: 5,\n    start: '2026-04-09',\n    end: null,",
        "    season: 5,\n    start: '2026-04-09',\n    end: '2026-12-31',",
      ),
  },
  {
    // THIS GAME'S OWN RULE, and the defect is one the checker actually caught.
    // ArcSys writes "Updated the Battle Version from Ver. 4.01 to Ver. 4.02":
    // the TO half is this row's battle version, the FROM half belongs to the
    // row before it. Ver 1.43 shipped carrying 4.01 — the FROM half — and
    // scripts/patch-check.ts reported the drift on 2026-09-08.
    //
    // THE CONTROL INJECTS THE SAME DEFECT ON A SEASON OPENER, NOT ON 1.43, AND
    // THAT IS A MEASUREMENT RATHER THAN A CONVENIENCE. Re-ran 2026-09-09: with
    // 1.43 set back to 4.01, `seasons --check` exits 0. It cannot see it —
    // 4.01 and 4.02 share a major, the era rule reads only the major, and the
    // monotone rule uses a strict `<` that 4.01 after 4.01 does not violate.
    // seasons.ts says so itself in the comment above the 1.43 row. The vendor
    // checker is what catches that one, and it has its own clean-run entry
    // below. What validate() DOES catch — and must — is the same mistake on a
    // row where the major moves: Ver 2.00's note reads "from 4.09 to 5.00", so
    // the FROM half is 4.09, and a row carrying it puts a battle-4 patch at
    // the head of a battle-5 era. Both era clauses fire.
    name: "patches: THE BATTLE-VERSION RULE — a row carries the FROM half of the vendor's sentence",
    cmd: ['tsx', 'scripts/seasons.ts', '--check'],
    files: ['scripts/seasons.ts'],
    names: /battle 4\.09 but sits in S5, whose battleMajor is 5/,
    inject: () =>
      sub(
        'scripts/seasons.ts',
        "    version: '2.00',\n    start: '2026-04-09',\n    battleVersion: '5.00',",
        "    version: '2.00',\n    start: '2026-04-09',\n    battleVersion: '4.09',",
      ),
  },

  // ── the roster (scripts/characters.ts) ───────────────────────────────────
  {
    // CotW's "Griffon" case on this corpus. `Jack` is a prolific PLAYER handle
    // here — "Jack (#1 Ranked Chaos)" on ggHighLevel, "[ Jack ]" on
    // ggstBattleCollection — so admitting it as an alias files a person as
    // Jack-O'. BANNED_ALIASES holds the line as an assertion rather than a
    // comment, because the comment is what a future edit deletes.
    name: 'roster: a BANNED alias is re-added ("Jack" — a player, not Jack-O\')',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'scripts/characters.ts'],
    names: /"jack" is a BANNED alias/,
    inject: () =>
      sub(
        'scripts/characters.ts',
        "aliases: [\"Jack-O' Valentine\", 'ジャック・オー'],",
        "aliases: ['Jack', \"Jack-O' Valentine\", 'ジャック・オー'],",
      ),
  },
  {
    name: 'roster: two fighters claim the same alias (the matcher then resolves a coin flip)',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'scripts/characters.ts'],
    names: /alias "Sol" claimed by both sol-badguy and ky-kiske/,
    inject: () =>
      sub('scripts/characters.ts', "aliases: ['Ky', 'カイ'],", "aliases: ['Ky', 'カイ', 'Sol'],"),
  },
  {
    // The bridge to the design handoff, asserted in BOTH directions: a roster
    // id with no token ships an unstyled fighter, and a token nothing claims is
    // either a typo or a character somebody forgot to add. Renaming the token
    // fires both halves at once.
    name: 'roster: a fighter with no --char-* design token',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'design/handoff/tokens.css'],
    names: /venom: no --char-venom in design\/handoff\/tokens\.css/,
    inject: () => sub('design/handoff/tokens.css', '  --char-venom:', '  --char-venom-x:'),
  },
  {
    // Recomputed against --color-surface #12151B rather than trusted: the
    // handoff STATES a ratio per accent and the roster build re-derives it.
    // Venom ships at 4.9:1, one of the three tightest on the roster.
    name: 'roster: an accent below the 4.5:1 AA floor on #12151B',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'design/handoff/tokens.css'],
    names: /venom: accent #3A2E7A is 1\.61:1 on #12151B/,
    inject: () =>
      sub(
        'design/handoff/tokens.css',
        '  --char-venom:         #8870F5;',
        '  --char-venom:         #3A2E7A;',
      ),
  },
  {
    // UNRELEASED ships EMPTY — both remaining Season 5 slots are literally
    // "???" on ArcSys's store page — so this control is what keeps the
    // mechanism honest while there is nothing in it. The release date is far
    // in the future ON PURPOSE: a past date would trip the expiry hard-stop
    // instead, which is a different gate.
    name: 'roster: an announced-but-unreleased fighter reaches the roster',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'scripts/expiries.ts'],
    names: /sol-badguy is in ROSTER and in UNRELEASED/,
    inject: () =>
      sub(
        'scripts/expiries.ts',
        'export const UNRELEASED: { id: string; releases: string; accent?: string; note?: string }[] = [];',
        'export const UNRELEASED: { id: string; releases: string; accent?: string; note?: string }[] = [\n' +
          "  { id: 'sol-badguy', releases: '2099-01-01' },\n];",
      ),
  },
  {
    // CHECKLIST 5n, AT PARSE TIME. The failure is a fighter filed as a person:
    // 67 live titles parsed confidently that way in the recon, minting players
    // called "UNIKA / ユニカ" and "SOL / ソル". Every real exemption carries a
    // video id as evidence; removing one must stop the run, not warn.
    //
    // daru-i-no is the row to pull because it is the largest — 231 side
    // appearances, all from the catalogue — so a regression that only fires on
    // small players cannot hide behind it.
    name: 'roster: THE REGISTRY INVARIANT — a roster-named handle loses its allow-list row',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['scripts/roster.ts', ...PARSE_OUTPUTS],
    names: /REGISTRY INVARIANT: 1 player handle[\s\S]*daru-i-no[\s\S]*→ i-no/,
    inject: () =>
      sub(
        'scripts/roster.ts',
        "  {\n    id: 'daru-i-no',\n    handle: 'Daru_I-No',\n    video: 'tnzlD9N_bns',\n" +
          '    note: \'231 side(s), replayTheater. Resolves to i-no. Evidence: "Daru_I-No(I-No) vs papaya(Venom)"\',\n  },\n',
        '',
      ),
  },
  {
    // NORMALISATION MUST EXERCISE IDENTITY, NOT THE PARSE RATE — the trap the
    // checklist amendment names. A control that asks only "does it still
    // parse" passes on a pipeline with NO normalisation at all: JS `\s`
    // already covers U+3000, and playerId()'s own NFKD already folds both
    // U+3000 and the fullwidth block. Measured 2026-09-09 with normalizeText
    // bypassed entirely: "Lasagna<U+3000>Slayer", the fullwidth spelling of the
    // same handle, and "Lasagna<U+00A0>Slayer" ALL still slug to
    // `lasagna-slayer`. They prove nothing on their own.
    //
    // What only normalizeText folds is the ZERO-WIDTH class: NFKD keeps
    // U+200B, playerId's `[^a-z0-9]+` turns it into a hyphen, and
    // "Lasa<U+200B>gna Slayer" becomes the second player `lasa-gna-slayer`.
    // So the injected spelling carries BOTH — the corpus's real carrier
    // (U+3000/fullwidth, 547 occurrences in 463 live titles) and the one that
    // actually discriminates.
    //
    // AND THE ASSERTION IS THE PLAYER COUNT, NOT THE RECORD COUNT. Records
    // are unchanged either way; what a broken fold does is MINT A SECOND
    // PERSON. `Gobou` is the injection target because it is the busiest
    // single-word handle on the biggest intake (348 side appearances,
    // ggHighLevel), and half its titles are rewritten so the two spellings
    // have to collapse onto one id rather than merely round-trip.
    name: 'parse: NORMALISATION IS IDENTITY — a variant handle spelling must not mint a second player',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['raw/ggHighLevel.json', ...PARSE_OUTPUTS],
    // The run SUCCEEDS; the assertion is on data/players.json, so this control
    // brings its own `assert` and declares no `names`.
    inject: () => {
      const p = 'raw/ggHighLevel.json';
      if (!existsSync(join(ROOT, p))) return `no ${p} — run \`npm run data:fetch\``;
      const dump = readJson<{ title: string }[]>(p);
      // FULLWIDTH G-o-b + U+200B ZERO WIDTH SPACE + FULLWIDTH o-u. Written as
      // escapes rather than as glyphs: the literal codepoints are invisible in a
      // diff, and an editor that "tidied" them would silently disarm this control.
      const variant = '\uFF27\uFF4F\uFF42\u200B\uFF4F\uFF55';
      let seen = 0;
      for (const v of dump) {
        if (!v.title.includes('Gobou')) continue;
        seen++;
        if (seen % 2 === 1) v.title = v.title.split('Gobou').join(variant);
      }
      if (seen < 100) return `only ${seen} raw title(s) name Gobou — too few to split`;
      write(p, JSON.stringify(dump));
      return true;
    },
    assert: (r) => {
      if (r.status !== 0) return fail(`parse exited ${r.status ?? `on ${r.signal}`}: ${head(r)}`);
      const players = readJson<{ id: string }[]>('data/players.json');
      const gobou = players.filter((p) => p.id === 'gobou').length;
      const split = players.filter((p) => /^gob-?ou$/.test(p.id) && p.id !== 'gobou');
      if (gobou !== 1 || split.length > 0) {
        return fail(
          `identity did not collapse: ${gobou} player(s) with id "gobou" and ${split.length} ` +
            `split spelling(s) ${split.map((p) => p.id).join(', ')}`,
        );
      }
      return pass(`${players.length} players, one "gobou" — the variant spelling folded`);
    },
  },

  // ── emit: the two-schema boundary ────────────────────────────────────────
  {
    name: 'emit: a record references an unknown character',
    cmd: ['tsx', 'scripts/emit.ts'],
    files: ['data/videos.json'],
    names: /references unknown character not-a-fighter/,
    inject: () => {
      const v = readJson<{ sides: { characters: string[] }[] }[]>('data/videos.json');
      if (!v.length) return 'empty corpus — data/videos.json holds no records';
      v[0].sides[0].characters = ['not-a-fighter'];
      write('data/videos.json', JSON.stringify(v, null, 2));
      return true;
    },
  },
  {
    name: 'emit: a side with ZERO characters (the one shape the contract does not admit)',
    cmd: ['tsx', 'scripts/emit.ts'],
    files: ['data/videos.json'],
    names: /has a side with 0 characters/,
    inject: () => {
      const v = readJson<{ sides: { characters: string[] }[] }[]>('data/videos.json');
      if (!v.length) return 'empty corpus — data/videos.json holds no records';
      v[0].sides[1].characters = [];
      write('data/videos.json', JSON.stringify(v, null, 2));
      return true;
    },
  },
  {
    name: 'emit: a record carries a patch token no boundary accounts for',
    cmd: ['tsx', 'scripts/emit.ts'],
    files: ['data/videos.json'],
    names: /carries patch "9\.99", which no boundary accounts for/,
    inject: () => {
      const v = readJson<{ patch: string }[]>('data/videos.json');
      if (!v.length) return 'empty corpus — data/videos.json holds no records';
      v[0].patch = '9.99';
      write('data/videos.json', JSON.stringify(v, null, 2));
      return true;
    },
  },
  {
    // The substrate's MatchSide carries provenance and the emitted side does
    // not. emit.ts builds sides field-by-field rather than spreading, so it
    // "cannot happen by construction" — which is exactly what people say
    // before it does. The assertion runs on the SERIALIZED output.
    name: 'emit: pipeline provenance leaks into the public contract',
    cmd: ['tsx', 'scripts/emit.ts'],
    files: ['scripts/emit.ts'],
    names: /"provenance" leaked into replays\.json/,
    inject: () =>
      sub(
        'scripts/emit.ts',
        '  sides: [\n    { player: v.sides[0].player, characters: v.sides[0].characters },',
        '  sides: [\n    { player: v.sides[0].player, characters: v.sides[0].characters, provenance: v.sides[0].provenance } as never,',
      ),
  },

  // ── parse: the corpus guards ─────────────────────────────────────────────
  {
    // DROP THE OLDEST 40% OF THE MARKED ROWS, and every word of that matters.
    //
    // CotW's version drops the FIRST 40% and its comment explains why it is
    // not 50% of the dump: this channel's playlist is newest-first, so a naive
    // halving deleted only the other game's rows and the control was a no-op
    // that reported PASS. Ported here verbatim it fails a SECOND way, measured
    // 2026-09-09: dropping from the head removes the newest uploads, the
    // dump's newest publishedAt falls behind the newest committed record for
    // this intake, and the run dies in the STALE-RAW guard — "raw/
    // ggHighLevel.json is stale", exit 1, not one word about a collapse. It
    // would have printed PASS under an exit-code-only assertion.
    //
    // So the injection targets exactly what the guard measures (records that
    // reach the site) from the end of the dump that leaves the freshness
    // relation intact. ggHighLevel commits 5,767 records off 5,856 marked
    // uploads; 40% is 2,343 marked rows and 2,290 records, which clears both
    // thresholds by two orders of magnitude.
    name: 'parse: the collapse guard (an intake loses >10% AND >20 records)',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['raw/ggHighLevel.json'],
    names: /COLLAPSE GUARD: 1 intake\(s\) lost[\s\S]*ggHighLevel: \d+ → \d+/,
    inject: () => {
      const p = 'raw/ggHighLevel.json';
      if (!existsSync(join(ROOT, p))) return `no ${p} — run \`npm run data:fetch\``;
      const dump = readJson<{ title: string }[]>(p);
      const marker = /(?<![A-Za-z])GGST(?![A-Za-z])|STRIVE(?![A-Za-z])/i;
      const marked = dump.filter((v) => marker.test(v.title));
      const drop = new Set(marked.slice(-Math.ceil(marked.length * 0.4)));
      const kept = dump.filter((v) => !drop.has(v));
      // Not emptied: an EMPTY dump is refused by a different rule, and a
      // control that trips the wrong gate proves nothing.
      if (kept.length === 0 || drop.size <= 20) {
        return `only ${drop.size} marked row(s) to drop — not enough to trip both thresholds`;
      }
      write(p, JSON.stringify(kept));
      return true;
    },
  },
  {
    name: 'parse: an empty raw dump is refused outright (never read as "a quiet day")',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['raw/guiltyGearVods.json'],
    names: /raw\/guiltyGearVods\.json is empty — refusing to parse/,
    inject: () => {
      const p = 'raw/guiltyGearVods.json';
      if (!existsSync(join(ROOT, p))) return `no ${p} — run \`npm run data:fetch\``;
      write(p, '[]');
      return true;
    },
  },
  {
    // CHECKLIST 10c. The guard reads ONLY DATA: a dump cannot contain an
    // upload published after it was taken, so a committed record NEWER than
    // anything in the dump proves the dump is stale. Both sides are publish
    // timestamps written by YouTube and carried inside the files, so no amount
    // of touching mtimes — `cp`, `git checkout`, a fresh clone, or this
    // suite's own restore — can fake or hide it. That is the whole reason the
    // wall-clock and mtime versions were retired.
    name: 'parse: the DATA-ONLY stale-raw guard (the dump predates a committed record)',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['raw/guiltyGearVods.json'],
    names: /raw\/guiltyGearVods\.json is stale/,
    inject: () => {
      const p = 'raw/guiltyGearVods.json';
      if (!existsSync(join(ROOT, p))) return `no ${p} — run \`npm run data:fetch\``;
      const dump = readJson<{ publishedAt: string }[]>(p);
      if (!dump.length) return `${p} is empty`;
      for (const r of dump) {
        r.publishedAt = `${Number(r.publishedAt.slice(0, 4)) - 1}${r.publishedAt.slice(4)}`;
      }
      write(p, JSON.stringify(dump));
      return true;
    },
  },
  {
    // videos.json is the baseline for the freeze carry, the index intake's
    // add-only merge AND the collapse guard. A truncated file silently read as
    // [] would carry nothing, preserve nothing, and disarm the guard for every
    // channel at once (`before > 0` false everywhere) — a total loss with
    // every gate green. Absent means a first run; unreadable is a hard stop.
    name: 'parse: an unreadable videos.json is a hard stop, never "treat it as empty"',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['data/videos.json'],
    names: /will not parse — refusing to treat it as empty/,
    inject: () => {
      write('data/videos.json', '{ this is not json');
      return true;
    },
  },
  {
    // THE GAP CotW LEFT OPEN. Its frozen branch has never executed — no
    // channel there is frozen and no control injects a pin mismatch
    // (recon/ff-gates.md §2). ggstLowLevel ships frozen HERE on day one, at
    // `records: 19` seeded 2026-09-09 through the --seed-freeze-pins ritual,
    // so the mechanism is exercised rather than waiting to be needed.
    //
    // The committed data file is both the source and the target of the carry,
    // so a wrong pin poisons the next run's reference permanently and
    // silently. Editing the pin IS the deliberate-prune mechanism; a mismatch
    // nobody edited means the archive moved on its own.
    name: 'parse: THE FROZEN PIN — ggstLowLevel is carried against a count nobody edited',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['scripts/channels.ts'],
    names: /ggstLowLevel is frozen at 18 records/,
    inject: () => sub('scripts/channels.ts', '      records: 19,', '      records: 18,'),
  },
  {
    // CHECKLIST 5m — THIS GAME'S REASON FOR EXISTING. Everywhere else the
    // parser resolves by roster membership and never has to choose an order;
    // `slotOrder` decides exactly one branch, the one where BOTH spans of a
    // side segment resolve to roster aliases ("Lasagna Slayer (#1 Ranked
    // Venom)", "NAGORIYUKI (SOL mugi)"). The question this control answers is
    // whether that field is load-bearing or decorative.
    //
    // It is load-bearing, and the proof is louder than a moved histogram.
    // Measured 2026-09-09: flipping ggHighLevel from handle-outside to
    // chars-outside makes the run change its answer on the tie-broken sides
    // AND on the name-shaped-bracket branch, and the REGISTRY INVARIANT then
    // stops the run with NINE fighters filed as people — `venom`, `zato`,
    // `faust`, `sin`, `millia`, `jack-o`, `chaos`, `happy-chaos`,
    // `cheater-asuka`. On the clean run that list is empty. The declared order
    // is the only thing that changed.
    //
    // The slot-order mix in report.md cannot be read for this control, and
    // that is the stronger result rather than a shortcoming: the run refuses
    // to write at all.
    name: 'parse: THE ORIENTATION TIE-BREAK — a channel’s declared slotOrder is flipped',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['scripts/channels.ts', ...PARSE_OUTPUTS],
    names: /REGISTRY INVARIANT: ([5-9]|\d\d+) player handle/,
    inject: () =>
      sub(
        'scripts/channels.ts',
        "    slotOrder: 'handle-outside',\n    striveSignal: 'title',\n  },\n  {\n    id: 'guiltyGearReplays',",
        "    slotOrder: 'chars-outside',\n    striveSignal: 'title',\n  },\n  {\n    id: 'guiltyGearReplays',",
      ),
  },
  {
    // THE MARKER, AND IT IS A MEASUREMENT RATHER THAN AN EXIT CODE. A marker
    // regression does not fail; the corpus just gets smaller, which is why the
    // assertion is the MARKED COUNT and not the exit status.
    //
    // `GGST(?![A-Za-z])`, never `\bGGST\b`: "GGST2.0" and "GGST5.2" are the
    // dominant spelling on ggstBattleCollection and common on ggstHq, and `\b`
    // does not fire between "T" and "2" because both are word characters.
    //
    // TWO NUMBERS, AND THEY ARE NOT THE SAME NUMBER. channels.ts states 1,003
    // videos lost, measured over the recon's 56,951-title sweep of 24
    // candidate channels. Over the EIGHT dumps this repo actually ingests
    // (21,843 titles, committed 2026-09-09) the loss is 150, all of them on
    // ggstBattleCollection — smaller because the STRIVE branch and the
    // hashtag-run strip rescue most of the rest. 150 is the number this
    // control holds itself to; the threshold is 100 so a corpus that grows or
    // shrinks a little cannot make it meaningless, and the run is given
    // --allow-collapse so the collapse guard cannot mask the measurement with
    // a different refusal.
    name: 'parse: THE MARKER — word-boundary GGST silently shrinks the marked corpus',
    cmd: ['tsx', 'scripts/parse.ts', '--allow-collapse'],
    files: ['scripts/channels.ts', ...PARSE_OUTPUTS],
    inject: () =>
      sub(
        'scripts/channels.ts',
        '  /(?<![A-Za-z])GGST(?![A-Za-z])|STRIVE(?![A-Za-z])',
        '  /\\bGGST\\b|STRIVE(?![A-Za-z])',
      ),
    assert: (r) => {
      if (r.status !== 0) return fail(`parse exited ${r.status ?? `on ${r.signal}`}: ${head(r)}`);
      const after = markedTotal(read('data/report.md'));
      const before = markedBaseline;
      if (before === null) return fail('no clean baseline was measured');
      const lost = before - after;
      if (lost < 100) {
        return fail(
          `the marked count moved by only ${lost} (${before} → ${after}). Either the marker is ` +
            `no longer load-bearing or the corpus no longer carries glued "GGST2.0" spellings — ` +
            `re-measure before relaxing this.`,
        );
      }
      return pass(`marked ${before} → ${after}, ${lost} videos lost silently`);
    },
  },

  // ── generated art (scripts/art.ts) and the OG card (scripts/og.ts) ───────
  {
    // THE CONTROL THAT STOPS A LICENCE HOLE BEING TIDIED AWAY. Fan Kit Article
    // 5 withholds the Article 3.3 redistribution grant for "materials related
    // to the character 'Lucy'", so publishing a crop of chara32_luc.png is
    // something ArcSys has not permitted: her file is never fetched and she
    // ships a generated tile. Delete the row and the build must fail rather
    // than quietly turn the hole into a portrait.
    //
    // WHERE IT FAILS, PRECISELY (measured 2026-09-09): after ONE request — the
    // Fan Kit page itself, which is what checkArticle5 reads — and before any
    // ASSET fetch and before anything is written. Nothing under public/ is
    // touched. It is not offline, and this file does not claim it is.
    name: "art: LUCY'S LICENCE EXCLUSION is deleted (Fan Kit Article 5)",
    cmd: ['tsx', 'scripts/art.ts'],
    files: ['scripts/art.ts'],
    network: true,
    names: /Article 5[\s\S]*NOT excluded here: lucy/,
    inject: () =>
      cutBlock(
        'scripts/art.ts',
        'const LICENCE_EXCLUDED: Record<string, string> = {',
        'const LICENCE_EXCLUDED: Record<string, string> = {};',
      ),
  },
  {
    // A stale key is NOT inert, which is the whole reason this check exists:
    // for BUST_HEAD the fighter silently falls back to the estimate the row
    // was written to override, and for LICENCE_EXCLUDED the fighter's asset
    // would be fetched. Checked before any network, so a typo fails in under a
    // second.
    name: 'art: a stale BUST_HEAD key matches no fighter (and is therefore inert)',
    cmd: ['tsx', 'scripts/art.ts'],
    files: ['scripts/art.ts'],
    names: /BUST_HEAD has 1 row\(s\) matching no fighter: potemkin-x/,
    inject: () =>
      sub(
        'scripts/art.ts',
        '  potemkin: { x: 0.62, y: 0.17 },',
        "  'potemkin-x': { x: 0.62, y: 0.17 },",
      ),
  },
  {
    // THE HEAD-CROSSHAIR DENSITY GUARD, added 2026-09-09 after four rows
    // shipped pointing at empty background. 0.74/0.11 is potemkin's REAL
    // historical value: alpha 0 at that point, 0% opaque within 55px, and the
    // shipped tile put his helmet ~18% from the left edge. The huge shape in
    // the top-left is his gauntlet, not his head.
    //
    // A single-pixel alpha test was tried first and failed four rows whose
    // crosshair is fine (may, zato-1, anji-mito, goldlewis-dickinson all land
    // in a gap between strands); the density over a 55px radius separates them
    // unambiguously. This control fetches the page and the first six cutouts
    // before it throws, and writes five fighters' files — byte-identically,
    // verified 2026-09-09, because sharp is deterministic on the same source.
    name: 'art: a BUST_HEAD crosshair pointing at empty background (potemkin 0.74/0.11)',
    cmd: ['tsx', 'scripts/art.ts'],
    files: ['scripts/art.ts'],
    network: true,
    names: /potemkin: the head crosshair \(BUST_HEAD 0\.74, 0\.11\)[\s\S]*opaque/,
    inject: () =>
      sub(
        'scripts/art.ts',
        '  potemkin: { x: 0.62, y: 0.17 },',
        '  potemkin: { x: 0.74, y: 0.11 },',
      ),
  },
  {
    // CHECKLIST 5d — PROVE THE TYPEFACE DREW. The real defect was a VARIABLE
    // font: opentype.js emitted NaN path geometry from multi-glyph layout and
    // the card truncated mid-word with no error anywhere. Rather than ship a
    // variable font to test it, corrupt the static instance's tables — the
    // parse then either throws or emits non-finite coordinates, and both are
    // refusals. design/fonts/ carries the TTF precisely so this cannot depend
    // on the host's font stack.
    name: 'og: the display TTF is corrupted (the NaN geometry that truncated the card)',
    cmd: ['tsx', 'scripts/og.ts'],
    files: ['design/fonts/Figtree-Regular.ttf'],
    names: /(Unsupported|non-finite path geometry|not the face this tile was designed on)/,
    inject: () => {
      const p = join(ROOT, 'design/fonts/Figtree-Regular.ttf');
      if (!existsSync(p)) return 'no design/fonts/Figtree-Regular.ttf';
      const buf = readFileSync(p);
      buf.fill(0, Math.floor(buf.length * 0.6), Math.floor(buf.length * 0.9));
      writeFileSync(p, buf);
      return true;
    },
  },
];

// ── snapshot / restore ──────────────────────────────────────────────────────
//
// A file that did not exist is restored by DELETING it, not by writing zero
// bytes. CotW wrote `Buffer.alloc(0)`, which leaves an empty file behind —
// harmless for its controls, wrong for data/player-redirects.json, which
// scripts/redirects.ts seeds on its first run and whose empty-vs-absent state
// is the difference between "no redirects" and "unparseable JSON".

const snapshots = new Map<string, Buffer | null>();

const snapshot = (files: string[]): void => {
  for (const f of files) {
    const abs = join(ROOT, f);
    snapshots.set(f, existsSync(abs) ? readFileSync(abs) : null);
  }
};

const restore = (files: string[]): void => {
  for (const f of files) {
    const abs = join(ROOT, f);
    const snap = snapshots.get(f);
    if (snap === undefined) continue;
    if (snap === null) {
      if (existsSync(abs)) unlinkSync(abs);
      continue;
    }
    writeFileSync(abs, snap);
  }
};

// A SUITE THAT IS INTERRUPTED MUST STILL PUT THE FILES BACK. The theater
// controls are the reason this exists rather than being left to the `finally`
// blocks: `fetch-theater --fresh` DELETES raw/replayTheater.json before its
// first request, so a Ctrl-C at the wrong second would leave an 8 MB committed
// dump gone and the next parse carrying nothing. Observed once during this
// build. SIGKILL still cannot be caught; nothing can fix that.
let restoringOnExit = false;
const restoreEverything = (why: string): void => {
  if (restoringOnExit) return;
  restoringOnExit = true;
  const files = [...snapshots.keys()];
  if (files.length) {
    console.error(`\n  ${why} — restoring ${files.length} snapshotted file(s) before exiting.`);
    restore(files);
  }
};
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    restoreEverything(`interrupted by ${sig}`);
    process.exit(sig === 'SIGINT' ? 130 : 143);
  });
}
process.on('uncaughtException', (err: unknown) => {
  restoreEverything('the suite threw');
  console.error(err);
  process.exit(1);
});

// ── tallies ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];
const skips: string[] = [];
const gaps: string[] = [];

const record = (name: string, v: Verdict): void => {
  if (v.kind === 'pass') {
    passed++;
    console.log(`  PASS  ${name}${v.detail ? `\n        ${v.detail}` : ''}`);
    return;
  }
  if (v.kind === 'skip') {
    skipped++;
    skips.push(`${name} — ${v.detail}`);
    console.log(`  SKIP  ${name}\n        ${v.detail}`);
    return;
  }
  if (v.kind === 'gap') {
    gaps.push(`${name} — ${v.detail}`);
    console.log(`  GAP   ${name}\n        ${v.detail}`);
    return;
  }
  failed++;
  failures.push(`${name} — ${v.detail}`);
  console.log(`  FAIL  ${name}\n        ${v.detail}`);
};

const wanted = (name: string): boolean => !only || name.includes(only);

// ── the clean baseline, MEASURED rather than remembered ─────────────────────
//
// The marker control asserts on a number the parse reports, so the number it
// compares against has to come from a clean run of the CODE AS IT IS, not from
// a committed report or a comment. One clean parse at the top, cached.

function measureBaseline(): void {
  if (markedBaseline !== null) return;
  snapshot(PARSE_OUTPUTS);
  const r = run(['tsx', 'scripts/parse.ts']);
  if (r.status === 0 && existsSync(join(ROOT, 'data/report.md'))) {
    markedBaseline = markedTotal(read('data/report.md'));
  }
  restore(PARSE_OUTPUTS);
}

// ── run the controls ────────────────────────────────────────────────────────

const selected = CONTROLS.filter((c) => wanted(c.name));
console.log(`▶ ${selected.length} positive control(s)\n`);

if (selected.some((c) => c.assert && c.name.includes('MARKER'))) measureBaseline();

for (const c of selected) {
  if (c.network && NO_NETWORK) {
    record(
      c.name,
      skip('--no-network was given; this control reads the vendor or the YouTube API'),
    );
    continue;
  }
  snapshot(c.files);
  let injected: Injected = false;
  try {
    injected = c.inject();
  } catch (e) {
    injected = false;
    console.log(`        inject threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    if (injected !== true) restore(c.files);
  }
  if (injected === false) {
    // NEVER A SKIP. The control could not put its defect in place, so it is a
    // no-op that would otherwise report PASS — CotW weakness 2, and the exact
    // failure mode step 10 exists to prevent.
    record(
      c.name,
      fail('ANCHOR DRIFT — the injection point no longer matches, so this control is a NO-OP'),
    );
    continue;
  }
  if (typeof injected === 'string') {
    record(c.name, skip(`precondition absent: ${injected}`));
    continue;
  }
  const r = run(c.cmd, c.env);
  let v: Verdict;
  if (c.assert) v = c.assert(r);
  else if (c.names) v = verdict(r, c.names);
  else v = fail('this control declares neither `names` nor `assert` — it asserts nothing');
  restore(c.files);
  record(c.name, v);
}

// ── the Replay Theater controls ─────────────────────────────────────────────
//
// These are not one command with one defect, so they live outside CONTROLS:
// each drives scripts/fetch-theater.ts against a local fixture endpoint, some
// of them more than once. Everything they touch is in THEATER_FILES and is
// restored byte-exactly.

interface TheaterControl {
  name: string;
  network?: boolean;
  go: () => Promise<Verdict>;
}

const theaterEnv = (endpoint: string): NodeJS.ProcessEnv => ({
  REPLAY_THEATER_ENDPOINT: endpoint,
});
const THEATER_CMD = ['tsx', '--env-file-if-exists=.env', 'scripts/fetch-theater.ts'];

/** Put the two committed files a sweep consults into a state that lets a
 *  200-entry fixture sweep succeed: no cursor (so the plausibility bound is
 *  inert) and no pin (so the record floor is inert). Both are restored. */
const neutraliseCursorAndPin = (): void => {
  write('data/theater-cursor.json', '{}\n');
  write('data/source-pins.json', '{}\n');
};

const THEATER_CONTROLS: TheaterControl[] = [
  {
    // SF6's REFUSAL, KEPT DELIBERATELY. Page 1 holds the newest entries, so
    // the highest id on it is the highest id the catalogue has; a committed
    // cursor above that is not "nothing new today", it is impossible — and it
    // is SILENT: every page reads as clean, the stop rule fires after two, and
    // the intake never ingests again while the file says so, with the cron
    // green throughout.
    //
    // CotW softened this to a warn-and-full-sweep, and that recovery CANNOT
    // HEAL: parse only writes the cursor when the pull's highest id is above
    // the committed one, and a real sweep's highest id never is. So the
    // poisoned cursor there means a 442-page sweep every morning forever, and
    // the only trace is a console.warn inside a step that is expected to be
    // yellow. Red until a human fixes the file, on the daily path AND on
    // --full, is the behaviour this control holds in place.
    name: 'theater: a cursor AHEAD of the catalogue must exit 1, on the daily path and on --full',
    network: true,
    go: async () => {
      const fx = await startFixture();
      if (typeof fx === 'string') return skip(`precondition absent: ${fx}`);
      try {
        write('data/theater-cursor.json', JSON.stringify({ replayTheater: 999_999_999 }));
        const daily = await runAsync(THEATER_CMD, theaterEnv(fx.endpoint));
        const v1 = verdict(daily, /The committed cursor is AHEAD of the catalogue/);
        if (v1.kind !== 'pass') return v1;
        const full = await runAsync([...THEATER_CMD, '--full'], theaterEnv(fx.endpoint));
        const v2 = verdict(full, /The committed cursor is AHEAD of the catalogue/);
        if (v2.kind !== 'pass') return fail(`--full did not refuse: ${v2.detail}`);
        return pass('refused on both paths; nothing written');
      } finally {
        fx.stop();
      }
    },
  },
  {
    // A cursor run's dump is a DELTA and is legitimately tiny, so "materially
    // smaller than the pin" means nothing there. A FULL sweep is different: it
    // claims to be the whole catalogue, so a collapse in it is a claim that
    // most of the catalogue left at once. The likeliest cause is not deletion
    // — `rightGame` compares against a string the catalogue controls, so the
    // day "Guilty Gear -Strive-" is respelled upstream every row fails and a
    // good dump is overwritten with almost nothing.
    //
    // The pin is set to the real committed count so the fixture's ~200 records
    // trip the floor exactly as a real collapse would.
    name: 'theater: the FULL-SWEEP RECORD FLOOR must exit 1 without --allow-shrink',
    network: true,
    go: async () => {
      const fx = await startFixture();
      if (typeof fx === 'string') return skip(`precondition absent: ${fx}`);
      try {
        write('data/theater-cursor.json', '{}\n');
        write('data/source-pins.json', JSON.stringify({ replayTheater: 8245 }));
        const refused = await runAsync([...THEATER_CMD, '--fresh'], theaterEnv(fx.endpoint));
        const v = verdict(refused, /A full sweep produced \d+ record\(s\) against a committed pin/);
        if (v.kind !== 'pass') return v;
        const allowed = await runAsync(
          [...THEATER_CMD, '--fresh', '--allow-shrink'],
          theaterEnv(fx.endpoint),
        );
        if (allowed.status !== 0) {
          return fail(
            `--allow-shrink should let the same sweep through and it exited ` +
              `${allowed.status ?? `on ${allowed.signal}`}: ${head(allowed)}`,
          );
        }
        return pass('refused without the flag, written with it');
      } finally {
        fx.stop();
      }
    },
  },
  {
    // PARTIAL-RESUME BYTE-IDENTITY. A 442-page sweep has to be interruptible,
    // and a resumed sweep has to produce the dump an uninterrupted one would —
    // byte for byte — or the resume is a second source of truth.
    //
    // THE SIGNAL MUST REACH THE NODE CHILD. `npx tsx …` is two processes:
    // killing the npx PID leaves tsx walking, no cache is ever flushed, the
    // resume half has nothing to resume from, and the control silently proves
    // nothing while looking like it passed. runAsync() spawns the
    // child detached and signals the whole PROCESS GROUP.
    //
    // Three runs, one comparison: an uninterrupted --fresh sweep; a --fresh
    // sweep SIGTERMed mid-walk (the handler flushes the cache and exits 143);
    // then a --full resume. The dump AND the witness must both compare equal
    // to the uninterrupted pair.
    name: 'theater: PARTIAL-RESUME BYTE-IDENTITY after a SIGTERM to the process GROUP',
    network: true,
    go: async () => {
      const fx = await startFixture();
      if (typeof fx === 'string') return skip(`precondition absent: ${fx}`);
      try {
        neutraliseCursorAndPin();
        const clean = await runAsync([...THEATER_CMD, '--fresh'], theaterEnv(fx.endpoint));
        if (clean.status !== 0) {
          return fail(`the uninterrupted sweep failed: ${head(clean)}`);
        }
        const dumpA = readFileSync(join(ROOT, 'raw/replayTheater.json'));
        const witnessA = readFileSync(join(ROOT, 'raw/replayTheater.witness.json'));

        // Mid-walk: pacingMs is 1200 and the fixture is 4 pages, so 2.4s lands
        // inside the walk with two pages cached and no dump written.
        const cut = await runAsync([...THEATER_CMD, '--fresh'], theaterEnv(fx.endpoint), 2400);
        if (!/interrupted by SIGTERM/.test(cut.out)) {
          return fail(
            `the SIGTERM never reached the node child (exit ${cut.status ?? cut.signal}) — the ` +
              `handler never printed, so no cache was flushed and the resume proves nothing`,
          );
        }
        if (!existsSync(join(ROOT, 'raw/.replayTheater.partial.json'))) {
          return fail('the interrupt left no partial cache');
        }
        if (existsSync(join(ROOT, 'raw/replayTheater.json'))) {
          return fail('an interrupted sweep wrote a dump — a partial sweep must write none');
        }

        const resumed = await runAsync([...THEATER_CMD, '--full'], theaterEnv(fx.endpoint));
        if (resumed.status !== 0) return fail(`the resume failed: ${head(resumed)}`);
        if (!/resuming a partial sweep/.test(resumed.out)) {
          return fail('the resume did not read the cache — it re-walked from scratch');
        }
        const dumpB = readFileSync(join(ROOT, 'raw/replayTheater.json'));
        const witnessB = readFileSync(join(ROOT, 'raw/replayTheater.witness.json'));
        if (!dumpA.equals(dumpB)) {
          return fail(`the resumed dump differs (${dumpA.length} vs ${dumpB.length} bytes)`);
        }
        if (!witnessA.equals(witnessB)) {
          return fail(
            `the resumed witness differs (${witnessA.length} vs ${witnessB.length} bytes)`,
          );
        }
        return pass(`dump and witness byte-identical across the interrupt (${dumpA.length} bytes)`);
      } finally {
        fx.stop();
      }
    },
  },
  {
    // AN IMPOSSIBLE OFFSET — a segment that starts after its VOD has ended.
    // The recon found one such row in a stratified sample of sixty and the
    // newest 300 catalogue rows hold none, so it is INJECTED rather than
    // hunted: a random specimen is the wrong instrument for a one-line
    // defect (ggst-notes/embed-spot-check.md).
    //
    // ── THIS CONTROL FINDS NO GATE, AND SAYS SO ──────────────────────────
    // Verified 2026-09-09 against the fixture with `&t=999999s` on a 41-minute
    // VOD: fetch-theater exits 0 and writes the row, `startSeconds: 999999,
    // durationSec: 0`; parse-finish's buildTheaterRecords applies its floor
    // only where a duration is KNOWN and a segment carries 0; emit asserts
    // nothing about the pair. The record ships and the embed opens at the end
    // of the video.
    //
    // The comparison has to happen in fetch-theater, because that is the only
    // place both numbers exist at once — `vod.durationSec` is deliberately NOT
    // carried onto a segment record. So this is reported as a GAP: the
    // injection works, no gate answers it, and the day a guard lands this
    // control turns itself into a PASS without being touched.
    name: 'theater: a segment whose startSeconds exceeds its VOD durationSec must be refused',
    network: true,
    go: async () => {
      const IMPOSSIBLE = 999_999;
      // TWO entries are involved, and the second is the reason this control can
      // tell a REFUSAL apart from a dead video. Entry A keeps its own link, so
      // its record in the dump proves that VOD resolved on YouTube this run;
      // entry B is re-pointed at A's video with an offset past any plausible
      // runtime. Without A, "the impossible row is missing" would be
      // indistinguishable from "the VOD 404'd", and a dead link would report a
      // PASS for a gate that never ran — the exact shape of CotW weakness 1.
      let videoA = '';
      let target = '';
      const fx = await startFixture((entries) => {
        const withId: { entry: WitnessEntry; id: string }[] = [];
        for (const e of entries) {
          const link = typeof e.video_link === 'string' ? e.video_link : '';
          const m = /(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(link);
          if (m) withId.push({ entry: e, id: m[1] });
          if (withId.length === 2) break;
        }
        if (withId.length < 2) return;
        videoA = withId[0].id;
        target = `${videoA}@${IMPOSSIBLE}`;
        withId[1].entry.video_link = `https://www.youtube.com/watch?v=${videoA}&t=${IMPOSSIBLE}s`;
      });
      if (typeof fx === 'string') return skip(`precondition absent: ${fx}`);
      try {
        if (!target) return fail('fewer than two fixture entries carried an extractable video id');
        neutraliseCursorAndPin();
        const r = await runAsync([...THEATER_CMD, '--fresh'], theaterEnv(fx.endpoint));
        if (r.status !== 0 && r.status !== null) return pass(`refused, exit ${r.status}`);
        const dump = existsSync(join(ROOT, 'raw/replayTheater.json'))
          ? readJson<{ id: string; videoId: string }[]>('raw/replayTheater.json')
          : [];
        if (dump.some((x) => x.id === target)) {
          return gap(
            `NO GATE EXISTS. ${target} was built and written with startSeconds ${IMPOSSIBLE} on a ` +
              `VOD far shorter than that, and the pull exited 0. scripts/fetch-theater.ts is the ` +
              `only place vod.durationSec and link.startSeconds are both in scope (a segment ` +
              `record deliberately carries durationSec 0, and parse-finish's floor only applies ` +
              `where a duration is KNOWN), so the comparison belongs there, beside the ` +
              `unreadable-t= refusal. This control turns itself into a PASS the day it lands.`,
          );
        }
        if (!dump.some((x) => x.videoId === videoA)) {
          return skip(
            `the control could not be judged: ${videoA} did not resolve on YouTube this run, so ` +
              `the impossible row is missing for the wrong reason. Re-cut the witness fixture.`,
          );
        }
        return pass('the impossible offset never reached the dump');
      } finally {
        fx.stop();
      }
    },
  },
];

/** The theater join is a YouTube videos.list call, so every control here needs
 *  a key. Absent is a genuinely absent precondition and therefore a NAMED
 *  skip; a run that let them fail instead would report four failures for one
 *  missing environment variable. Read from the process AND from .env, because
 *  the pull itself is launched with --env-file-if-exists=.env. */
const hasYouTubeKey = (): boolean => {
  if (process.env.YT_API_KEY) return true;
  try {
    return /^\s*YT_API_KEY\s*=\s*\S/m.test(read('.env'));
  } catch {
    return false;
  }
};

const theaterSelected = THEATER_CONTROLS.filter((c) => wanted(c.name));
if (theaterSelected.length) {
  console.log('\n▶ Replay Theater (CotW shipped none of these — recon/ff-theater.md row I)\n');
  const keyed = hasYouTubeKey();
  for (const c of theaterSelected) {
    if (c.network && NO_NETWORK) {
      record(c.name, skip('--no-network was given; the theater join reads the YouTube Data API'));
      continue;
    }
    if (c.network && !keyed) {
      record(
        c.name,
        skip(
          'precondition absent: no YT_API_KEY in the environment or .env — the theater join is a videos.list call',
        ),
      );
      continue;
    }
    snapshot(THEATER_FILES);
    try {
      record(c.name, await c.go());
    } catch (e) {
      record(c.name, fail(`the control threw: ${e instanceof Error ? e.message : String(e)}`));
    } finally {
      restore(THEATER_FILES);
    }
  }
}

// ── the clean run, which is the other half of step 10 ───────────────────────
//
// It also proves the restores above were byte-exact: every one of these reads
// files the controls edited, and several of them re-derive the committed
// artifacts.

console.log('\n▶ clean run');
const CLEAN: { label: string; cmd: string[]; network?: boolean }[] = [
  { label: 'seasons --check', cmd: ['tsx', 'scripts/seasons.ts', '--check'] },
  { label: 'expiries --check', cmd: ['tsx', 'scripts/expiries.ts', '--check'] },
  { label: 'characters', cmd: ['tsx', 'scripts/characters.ts'] },
  { label: 'redirects --check', cmd: ['tsx', 'scripts/redirects.ts', '--check'] },
  // READ-ONLY against ArcSys's own WordPress feed
  // (guiltygear.com/ggst/en/wp-json/wp/v2/posts?categories=4) — no writes, no
  // auth, one request. It is in the clean half rather than skipped because it
  // is the only check that can see a patch the table never heard of, and the
  // 90-day alarm in expiries.ts explicitly points at it.
  {
    label: 'patch-check (vendor, read-only)',
    cmd: ['tsx', 'scripts/patch-check.ts'],
    network: true,
  },
  { label: 'parse', cmd: ['tsx', 'scripts/parse.ts'] },
  { label: 'emit', cmd: ['tsx', 'scripts/emit.ts'] },
];
for (const { label, cmd, network } of CLEAN) {
  if (!wanted(label) && only) continue;
  if (network && NO_NETWORK) {
    record(`clean run: ${label}`, skip('--no-network was given'));
    continue;
  }
  const r = run(cmd);
  if (r.status === 0) {
    passed++;
    console.log(`  PASS  ${label} exits 0`);
  } else {
    failed++;
    failures.push(`clean run: ${label} exits ${r.status ?? `on signal ${r.signal}`}`);
    console.log(
      `  FAIL  ${label} exits ${r.status ?? `on signal ${r.signal}`}\n` +
        r.out
          .split('\n')
          .filter((l) => l.trim())
          .slice(0, 6)
          .map((l) => `        ${l}`)
          .join('\n'),
    );
  }
}

// ── the tally ───────────────────────────────────────────────────────────────

console.log(
  `\n${failed === 0 ? '✓' : '✖'} ${passed} passed · ${failed} failed · ${skipped} skipped · ` +
    `${gaps.length} gap(s)`,
);
if (skips.length) {
  console.log('\nSkipped, with the precondition each one is waiting on:\n');
  for (const s of skips) console.log(`  ${s}`);
}
if (gaps.length) {
  console.log('\nGAPS — a defect was injected and NO GATE ANSWERED IT:\n');
  for (const g of gaps) console.log(`  ${g}`);
}
if (failures.length) {
  console.error('\nA control that does not fire is worse than no control:\n');
  for (const f of failures) console.error(`  ${f}`);
}
process.exit(failed === 0 ? 0 : 1);
