/**
 * Self-expiring gates — things the DATA can tell us are due, rather than things
 * a human has to remember.
 *
 * THREE SEVERITIES, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE DESIGN:
 *
 *   scripts/characters.ts  (manual roster run)  → process.exit(1)
 *   scripts/parse.ts       (daily cron path)    → NEVER exits; prints a FAILURE
 *                                                 banner and writes an
 *                                                 "## ⚠ ACTION REQUIRED" block
 *                                                 at the top of data/report.md
 *   .github/workflows/pending-work.yml          → runs after every completed
 *                                                 data run and exits 1
 *
 * A hard exit in parse.ts would fail `npm run data:build` and stop the daily
 * refresh entirely, which is strictly worse than the misfiling it warns about:
 * a day of stale data costs more than a day of a fighter filed under the wrong
 * accent. So the daily path stays soft, the data gets pushed, and the "Pending
 * work" run (workflow_run on the data run's completion) goes red afterwards so
 * the pending work is impossible to miss — and a held data run can no longer
 * hide a due expiry behind it, which it did on 2026-10-12.
 *
 * THE SAME SEVERITY NOW COVERS A HELD FIGHTER-NAMED HANDLE (checklist 5n, since
 * 2026-10-30): parse.ts holds the RECORD in the review queue and ships the day,
 * and `--check` goes red on every 'fighter-named-handle' item in
 * data/review-queue.json, naming the handle and its count. A data run used to
 * go red for this and hold everything; now only the record waits.
 *
 * THE RED PENDING-WORK RUN AND THE exit 1 ARE THE DESIGN, NOT A BUG. Clear them by
 * doing the work below — never by deleting the check.
 *
 * Second-order property worth preserving: report.md's commit guard drops the
 * file when the only diff is its "_Generated_" timestamp. An ACTION REQUIRED
 * block is real content, so the day it first appears the guard lets it through
 * and the signal reaches git — and the deployed site — even on a no-change day.
 *
 * Run: npm run data:expiries   (tsx scripts/expiries.ts --check)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PATCHES, SEASONS, STALE_PATCH_DAYS } from './seasons';
import type { Expiry, ReviewQueueItem } from '../types/index';

/**
 * Announced-but-unreleased fighters. THIS GATE SHIPS EMPTY, AND THAT IS A
 * MEASUREMENT RATHER THAN AN OVERSIGHT.
 *
 * Season 5 is a four-character pass and two have shipped: Jam Kuradoberi
 * (2026-04-09, Ver 2.00) and Robo-Ky (2026-07-02, Ver 2.02). The remaining two
 * are on ArcSys's own store page as literally `???`:
 *
 *   DLC Additional Character #20  ???  (Available Winter 2026)
 *   DLC Additional Character #21  ???  (Available Spring 2027)
 *
 * Verified live 2026-09-07 and re-verified 2026-09-09: no name, no portrait, no
 * character page, no sitemap entry, no Fan Kit asset. There is nothing to gate on.
 *
 * ONE THING IS NOW PUBLIC AND IT IS NOT A NAME. Arc System Works confirmed in
 * July 2026 that DLC #20 — the Winter 2026 slot — is a GUEST character, the
 * season's second. That narrows what to expect and changes nothing here: a
 * guest still has no name, no slug and no art, so there is still nothing to
 * gate on. Do not let "we know something about it" become a speculative row. The Season Pass 5
 * purchase-bonus text corroborates the count — "7 additional colors for each of
 * the 4 characters added in GGST Season 5".
 *
 * DO NOT PRE-SEED GUESSES. The site slugs are opaque three-letter codes with no
 * derivable pattern (`cos` = Happy Chaos, `rbk` = Robo-Ky, `dzy` = Dizzy,
 * `jko` = Jack-O'), so a guessed id could not be checked against anything and
 * would ship a roster row for a fighter that may not exist under that name.
 *
 * WHAT DETECTS THE NAMES WHEN THEY LAND. Two things, neither of them a date:
 *  1. `scripts/roster.ts --scrape --names` re-enumerates the grid and the
 *     sitemap and reports a count that is no longer 34.
 *  2. parse.ts's residue gate surfaces an unmatched roster-shaped span as a
 *     counted line, so footage of a new fighter appears as data before anyone
 *     remembers to look.
 * Both fire on the real event. A date row here would fire on a guess.
 *
 * The other two arms of this file — the unconfirmed-season row and the
 * stale-patch-table row — ARE live from day one.
 */
export const UNRELEASED: { id: string; releases: string; accent?: string; note?: string }[] = [];

/**
 * The patch table goes stale silently, so it gets a cadence check.
 *
 * NINETY DAYS, IMPORTED FROM scripts/seasons.ts RATHER THAN RESTATED, and the
 * number is Strive's own. Measured over all 44 announced versions on
 * 2026-09-07: the median gap is 38 days, p90 is 75, and there is one real
 * 127-day silence (Ver 1.51 2025-10-22 → Ver 1.52 2026-02-26). A threshold at
 * p90 would have cried wolf for seven straight weeks over a genuine ArcSys
 * hiatus, and an alarm that fires through a known-quiet quarter is an alarm
 * nobody reads. 90 clears every normal gap and the 84- and 91-day ones, and
 * still catches a miss long before a season turns over.
 *
 * WHY IT IS NOT CotW's 40 OR TŌKON's 10: those are their vendors' cadences.
 * SNK ships every ~21 days and ArcSys every ~38, so the same number would mean
 * something different on each game. This is exactly the value that must never
 * be ported.
 *
 * STATED HONESTLY: at this cadence the blunt check cannot cleanly separate "a
 * patch was missed" from "the vendor was quiet" — two normal gaps back to back
 * reach 76 days, inside the threshold. The check is a backstop, not a detector;
 * `npm run data:patch-check` against ArcSys's own feed is the detector.
 */
// Imported, never restated — seasons.ts owns it beside the cadence it was
// measured from.

const today = (): string => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Everything whose date has now passed. Empty is the happy path. */
export function dueExpiries(asOf: string = today()): Expiry[] {
  const due: Expiry[] = [];

  for (const u of UNRELEASED) {
    if (asOf >= u.releases) {
      due.push({
        kind: 'unreleased-character',
        id: u.id,
        date: u.releases,
        // This text was ported from the CotW repo and carried its instructions
        // for six weeks: it sent you to SNK's Fatal Fury character index to
        // check a Guilty Gear spelling, and it told you to add `--char-<id>`,
        // which is not how accents are keyed HERE. Both are fixed below. An
        // action string is documentation that only ever gets read once, on the
        // day it fires, by someone who is trusting it — so a wrong one is worse
        // than none.
        action:
          `${u.id} should now be playable. If it is: confirm the name and spelling on ` +
          `guiltygear.com/ggst/en/character/ — the DETAIL PAGE'S <h1>, never the grid's ` +
          `<h2> and never buynow.html, which disagree for 13 of 34 — then add a TOKEN_FOR ` +
          `entry in scripts/characters.ts mapping the full-name-kebab roster id to the ` +
          `handoff's SHORT token, and add --char-<that short token> to ` +
          `design/handoff/tokens.css in the right hue family (${
            u.accent
              ? `the handoff already derived ${u.accent}`
              : 'accent from a Claude Design session — never invent one'
          } — contrast ≥4.5:1 on --color-surface and a hue ≥8–12° off its roster ` +
          `neighbours). Accents in app/app.config.ts are keyed by ROSTER ID, not by token — ` +
          `the short keys stop at TOKEN_FOR. Then add the fighter to ROSTER in ` +
          `scripts/characters.ts with the aliases its uploaders actually use (respecting ` +
          `BANNED_ALIASES), add the patch to scripts/seasons.ts — patchBoundaries.json is ` +
          `GENERATED here, editing it does nothing — drop this entry from UNRELEASED, then ` +
          `run \`npm run data:characters\`, \`npm run data:art\` and \`npm run data:og\`. ` +
          `Also add a comboforge null for it in app/app.config.ts until the ENGINE's ` +
          `\`npm run verify:comboforge\` says they carry it. If it has NOT shipped, re-date ` +
          `this row to the new window — do not delete it.`,
      });
    }
  }

  for (const s of SEASONS) {
    if (!s.confirmed && asOf >= s.start) {
      due.push({
        kind: 'unconfirmed-season',
        id: `S${s.season}`,
        date: s.start,
        action:
          `Season ${s.season} was scheduled for ${s.start} and is still unconfirmed. Verify the ` +
          `balance patch landed, add its opening patch to PATCHES in scripts/seasons.ts with ` +
          `the battleVersion the vendor's note states, set confirmed: true, and re-run ` +
          `\`npm run data:seasons\` then \`npm run data:emit\`. The era opens on the patch whose ` +
          `own notes page bumps the BATTLE VERSION major — never on the marketing start date ` +
          `and never on the game's major: Seasons 2, 3 and 4 all opened inside the 1.x line ` +
          `(Ver 1.18, 1.29, 1.40), and only Season 5 coincided with a game-major bump.`,
      });
    }
  }

  const newest = PATCHES.at(-1);
  if (newest && daysBetween(newest.start, asOf) > STALE_PATCH_DAYS) {
    due.push({
      kind: 'stale-patch-table',
      id: 'patch-table',
      date: newest.start,
      action:
        `The newest patch in scripts/seasons.ts is ${newest.version}, ` +
        `${daysBetween(newest.start, asOf)} days old (threshold ${STALE_PATCH_DAYS}). Run ` +
        `\`npm run data:patch-check\` against ArcSys's own WordPress feed ` +
        `(guiltygear.com/ggst/en/wp-json/wp/v2/posts?categories=4) — NOT the Steam news feed, ` +
        `which carries only about 24 of the 44 versions, in five different title spellings, ` +
        `and posted the Ver 1.18 season opener with no version in the title at all. If a patch ` +
        `shipped and is not in the table, every replay since is filed under the previous ` +
        `token: it renders, it filters, and it is wrong. If genuinely nothing shipped, that is ` +
        `fine — this warning costs one command.`,
    });
  }

  return due;
}

// ── held fighter-named handles (checklist 5n) ────────────────────────────────
// Not dated, so not an Expiry — a TASK the review queue already holds. Until
// 2026-10-30 the registry invariant refused the WHOLE DAY for one unconfirmed
// handle ("Plugging on ram" held 25,485 → 25,574 records for four days from
// 10-25). parse-finish.ts now routes a NEW record whose handle resolves to a
// fighter with no CONFIRMED row into data/review-queue.json as kind
// 'fighter-named-handle', ships the rest of the day, and this is the red that
// makes the held record impossible to miss. Refuse the record, not the day.

export interface HeldHandle {
  player: string;
  /** The handle as the first held record spells it. */
  handle: string;
  resolvesTo: string[];
  /** Held record ids, queue order. */
  ids: string[];
}

/** The queue's 'fighter-named-handle' items, one row per player id. */
export function heldHandles(queue: ReviewQueueItem[]): HeldHandle[] {
  const by = new Map<string, HeldHandle>();
  for (const q of queue) {
    if (q.kind !== 'fighter-named-handle') continue;
    for (const h of q.held ?? []) {
      const row = by.get(h.player) ?? {
        player: h.player,
        handle: h.handle,
        resolvesTo: [],
        ids: [],
      };
      for (const id of h.resolvesTo) if (!row.resolvesTo.includes(id)) row.resolvesTo.push(id);
      if (!row.ids.includes(q.id)) row.ids.push(q.id);
      by.set(h.player, row);
    }
  }
  return [...by.values()].sort(
    (a, b) => b.ids.length - a.ids.length || a.player.localeCompare(b.player),
  );
}

/** One line per handle — report.md, the parse console and `--check` all print it. */
export const heldLine = (h: HeldHandle): string =>
  `${h.ids.length} record(s) held on unconfirmed fighter-named handle "${h.handle}" — confirm ` +
  `with a video id (scripts/roster.ts) or reject  [${h.player} → ${h.resolvesTo.join(', ')}; ` +
  `e.g. ${h.ids[0]}]`;

/** How a held handle is cleared, for the two places that tell a person. */
export const HELD_HOW = [
  'A person named after a fighter: add the CONFIRMED_FIGHTER_NAMED_PLAYERS row WITH its video',
  'id, push, then dispatch "Daily data refresh" — the record publishes and the item clears. A',
  "fighter filed as a person: a `sides` override in data/overrides.json (resolvedBy: 'human').",
];

/** Rendered into data/report.md by parse.ts when anything is due. */
export function expiryBlock(due: Expiry[]): string[] {
  if (!due.length) return [];
  return [
    '## ⚠ ACTION REQUIRED',
    '',
    `${due.length} self-expiring gate(s) are due:`,
    '',
    ...due.flatMap((d) => [`- **${d.id}** (${d.kind}, due ${d.date})`, `  ${d.action}`, '']),
  ];
}

// ── standalone `--check` ─────────────────────────────────────────────────────
// The "Pending work" workflow's step. It runs after the data run has completed
// (pushed, or held), so a red run never costs a refresh — it only makes the
// pending work impossible to ignore.
const isMain = !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain && process.argv.includes('--check')) {
  const due = dueExpiries();
  // The committed queue: Pending work checks out main after the data run, so
  // this is exactly what that run published. An unreadable queue is a red, not
  // a clean bill — "could not look" must never read as "nothing held".
  const queuePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'data',
    'review-queue.json',
  );
  let held: HeldHandle[] = [];
  let unreadable: string | null = null;
  try {
    const q: unknown = JSON.parse(readFileSync(queuePath, 'utf8'));
    if (Array.isArray(q)) held = heldHandles(q as ReviewQueueItem[]);
    else unreadable = 'not a JSON array';
  } catch (err) {
    unreadable = (err as Error).message;
  }
  if (!due.length && !held.length && unreadable === null) {
    console.log(
      `✓ no expiries due — ${UNRELEASED.length} unreleased row(s) pending, ` +
        `newest patch ${PATCHES.at(-1)?.version}; no record held on a fighter-named handle`,
    );
    process.exit(0);
  }
  if (due.length) {
    console.error(`\n✖ ${due.length} EXPIRY(S) DUE — this step is designed to go red.\n`);
    for (const d of due) {
      console.error(`  ${d.id}  (${d.kind}, due ${d.date})`);
      console.error(`    ${d.action}\n`);
    }
  }
  if (held.length) {
    const n = new Set(held.flatMap((h) => h.ids)).size;
    console.error(
      `\n✖ ${n} RECORD(S) HELD ON ${held.length} UNCONFIRMED FIGHTER-NAMED HANDLE(S) — this step ` +
        `is designed to go red.\n`,
    );
    for (const h of held) console.error(`  ${heldLine(h)}`);
    console.error('');
    for (const l of HELD_HOW) console.error(`  ${l}`);
    console.error('');
  }
  if (unreadable !== null) {
    console.error(
      `\n✖ data/review-queue.json is unreadable (${unreadable}) — held handles unknown.\n`,
    );
  }
  console.error('  Clear these by doing the work above. Never by deleting the check.');
  process.exit(1);
}
