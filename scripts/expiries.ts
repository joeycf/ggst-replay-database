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
 *   .github/workflows/…    (daily cron)         → a FINAL step, AFTER commit and
 *                                                 push, that exits 1
 *
 * A hard exit in parse.ts would fail `npm run data:build` and stop the daily
 * refresh entirely, which is strictly worse than the misfiling it warns about:
 * a day of stale data costs more than a day of a fighter filed under the wrong
 * accent. So the daily path stays soft, the data gets pushed, and the WORKFLOW
 * goes red afterwards so the pending work is impossible to miss.
 *
 * THE RED WORKFLOW AND THE exit 1 ARE THE DESIGN, NOT A BUG. Clear them by
 * doing the work below — never by deleting the check.
 *
 * Second-order property worth preserving: report.md's commit guard drops the
 * file when the only diff is its "_Generated_" timestamp. An ACTION REQUIRED
 * block is real content, so the day it first appears the guard lets it through
 * and the signal reaches git — and the deployed site — even on a no-change day.
 *
 * Run: npm run data:expiries   (tsx scripts/expiries.ts --check)
 */

import { PATCHES, SEASONS, STALE_PATCH_DAYS } from './seasons';
import type { Expiry } from '../types/index';

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
 * Verified live 2026-09-07: no name, no portrait, no character page, no sitemap
 * entry, no Fan Kit asset. There is nothing to gate on. The Season Pass 5
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
        action:
          `${u.id} should now be playable. If it is: confirm the name and spelling on ` +
          `snk-corp.co.jp/us/games/fatalfury-cotw/characters/, add --char-${u.id} to ` +
          `design/handoff/tokens.css (${
            u.accent
              ? `the handoff already derived ${u.accent}`
              : 'accent from a Claude Design session — never invent one'
          } — contrast ≥4.5:1 on --color-surface and a hue ≥8–12° off its roster ` +
          `neighbours), add the same hex to accents in app/app.config.ts, add the fighter to ` +
          `ROSTER in scripts/characters.ts with the aliases its uploaders actually use, drop ` +
          `this entry from UNRELEASED, then run \`npm run data:characters\` and ` +
          `\`npm run data:art\`. Also add a comboforge null for it in app/app.config.ts until ` +
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
// The workflow's LAST step. It runs after the data has been committed and
// pushed, so a red run never costs a refresh — it only makes the pending work
// impossible to ignore.
const isMain = !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain && process.argv.includes('--check')) {
  const due = dueExpiries();
  if (!due.length) {
    console.log(
      `✓ no expiries due — ${UNRELEASED.length} unreleased row(s) pending, ` +
        `newest patch ${PATCHES.at(-1)?.version}`,
    );
    process.exit(0);
  }
  console.error(`\n✖ ${due.length} EXPIRY(S) DUE — this step is designed to go red.\n`);
  for (const d of due) {
    console.error(`  ${d.id}  (${d.kind}, due ${d.date})`);
    console.error(`    ${d.action}\n`);
  }
  console.error('  Clear these by doing the work above. Never by deleting the check.');
  process.exit(1);
}
