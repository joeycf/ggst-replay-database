/**
 * The Strive balance-era and patch table — the single place a replay's SEASON
 * and its PATCH are decided, and the only input to Replay.patch.
 *
 * ── ONE MODULE, TWO TABLES, ON PURPOSE ─────────────────────────────────────
 * SF6's argument, adopted verbatim because it is right: the tables are not
 * independent. An era opens ON a patch, so `SEASONS[n].start` must equal the
 * date of the first patch nested under it, and a validator that cannot see
 * both tables cannot enforce that. CotW split them across scripts/patches.ts +
 * data/seasonBoundaries.json; Tekken and 2XKO split theirs too and Tekken pays
 * for it with two `seasonForDate` implementations that iterate in opposite
 * directions. This game has a THIRD cross-table rule the split would make
 * unenforceable — the battle-major rule below — so the case for one module is
 * stronger here than it was on SF6.
 *
 * ── THE GRAMMAR ────────────────────────────────────────────────────────────
 * ArcSys publishes `X.YY`: exactly two segments, minor always zero-padded, no
 * third segment in five years and 44 patches. Measured 2026-09-07 against the
 * vendor's own patch-note titles, `/^\[Ver\s*\.?\s*(\d+\.\d{2})\]/` parses
 * 46/46. Storage token is the bare capture (`1.18`, `2.02`); display is
 * `Ver. X.YY`. The `Ver` / `Ver.` / `Ver. ` spelling drifts WITHIN a season
 * (S2 alone has `[Ver. 1.18]`, `[Ver1.19]`, `[Ver1.21]`, `[Ver. 1.23]`), so it
 * is not a season signal and nothing here reads it.
 *
 * ── THE SOURCE, AND WHY IT IS NOT STEAM ────────────────────────────────────
 * ArcSys's own WordPress REST API, category `patch` (id 4):
 *   guiltygear.com/ggst/en/wp-json/wp/v2/posts?categories=4&per_page=100
 * Measured 2026-09-07: it returns all 46 patch-category posts, unpaginated,
 * and the JP mirror carries the same 46. The Steam news feed carries ~24 of
 * the 44 in five different title spellings and posts the Ver 1.18 SEASON
 * OPENER as "Guilty Gear -Strive- Balance Update is Out Now! Sale is Live!" —
 * no version in the title at all. A checker polling Steam prints a tick
 * forever while this table rots, which is exactly the failure CotW documented
 * from the other direction. See scripts/patch-check.ts.
 *
 * ── THE DATE AUTHORITY IS THE BODY SENTENCE ────────────────────────────────
 * Three dates exist per patch and they disagree. Measured 2026-09-07: 26 of 44
 * titles carry no date at all, and 12 of the 18 that do contradict the body's
 * "will be released … on ‹date›". The WordPress `date` field also drifts by
 * locale (Ver 1.48 is 2025-08-13 on JP and 2025-08-19 on EN for one build).
 *   1.41  WP 2024-11-18 · title Nov. 18 · BODY November 20
 *   1.43  WP 2024-12-20 · title Dec. 19 · BODY December 23
 *   2.00  WP 2026-04-06 · title April 8 · BODY April 9
 * The last one is the inverse of CotW's marketing trap: there the press said
 * one day and the vendor another; here the VENDOR'S OWN TITLE says April 8 and
 * its body says April 9. Jam Kuradoberi unlocked on the 9th. Every `start`
 * below is the body date.
 *
 * ── NOTHING FOLDS, AND STRUCTURALLY CANNOT ─────────────────────────────────
 * Tekken folds `X.YY.ZZ` → `X.YY` because Bandai ships a hotfix segment to
 * shed. ArcSys ships two segments and there is nothing under the minor. The
 * only fold available is on the MAJOR, and that would collapse 41 of the 44
 * patches into a single `1` bucket. So the vendor's announcement granularity
 * is the token granularity, as on SF6 and CotW.
 *
 * ── THE ERA AUTHORITY IS THE BATTLE VERSION, NOT THE GAME MAJOR ────────────
 * ArcSys publishes TWO independent version numbers, and the game major is the
 * wrong one four times in five: Seasons 2, 3 and 4 all open inside the 1.x
 * line (Ver 1.18, 1.29, 1.40) and only Season 5 coincides with a major bump.
 * Deriving eras from the game major yields ONE era across 2021–2026.
 *
 * The Battle Version's MAJOR bumps land on all four season boundaries with
 * zero exceptions, stated in the vendor's own words inside the notes:
 *   Ver 1.18  2022-06-10  "The battle version has been updated from 1.09 to
 *                          2.00."                            → S2 opens
 *   Ver 1.29  2023-08-24  2.06 → 3.00                        → S3 opens
 *   Ver 1.40  2024-10-31  3.07 → 4.00                        → S4 opens
 *   Ver 2.00  2026-04-09  4.09 → 5.00                        → S5 opens
 * That is a stronger era signal than any sibling has: ArcSys versions the
 * BALANCE separately from the build. It is carried per patch as
 * `battleVersion`, per era as `battleMajor`, and validate() below turns it
 * into the check that would have caught either decoy.
 *
 * ── THE TWO DECOYS A "BIG BALANCE PATCH = NEW SEASON" RULE MISFILES ────────
 *   Ver 1.28 (2023-06-15) is a large content update whose body says
 *   "Season 2", and the battle version stays at 2.0x. Opening S3 there is
 *   70 days early.
 *   Ver 1.38 (2024-07-22) is a ROSTER-WIDE balance pass whose body mentions a
 *   "Season 4" bonus colour, and the battle version goes 3.05 → 3.06 — still
 *   Season 3. Opening S4 there is 101 days early.
 * Both rows carry their battleVersion for exactly this reason: check 8 fails
 * loudly the moment either one is promoted to an era boundary.
 *
 * A third false signal, from the intake side: ggstHq writes version-shaped
 * numbers in its titles ("5.2", "5.1", "2.0", "2.2" on 2,864 of 2,994 titles,
 * measured 2026-09-07) and at least some of them are BATTLE versions, not game
 * versions. Nothing may read a patch token out of a title. The era is derived
 * from the capture date and only from the capture date.
 *
 * ── NEVER INVENT A VERSION TO FILL A GAP ───────────────────────────────────
 * ArcSys published no patch note for 1.00, 1.01, 1.02, 1.04, 1.06, 1.08, 1.12,
 * 1.14, 1.15, 1.17, 1.20 or 1.42. Those numbers are absent here on purpose and
 * a reader noticing the 1.41 → 1.43 gap is the intended outcome. 1.42 has no
 * record anywhere — not on guiltygear.com, not on Steam — and the battle
 * version is 4.01 on both sides of that gap, so if it shipped it changed no
 * battle behaviour. There is deliberately no validator asserting the sequence
 * increments; such a validator would fail on the first honest row.
 *
 * ── CADENCE, AND WHAT THE STALENESS ALARM IS SET TO ────────────────────────
 * Measured 2026-09-07 over all 44 releases: median gap 38 days, mean 43, p90
 * 75, range 9–127. The 127 is real (1.51 → 1.52, 2025-10-22 → 2026-02-26) and
 * so are 91, 84, 76, 75 and 74. STALE_PATCH_DAYS is therefore 90, not p90: a
 * threshold at 75 would have been red for seven straight weeks over a genuine
 * ArcSys hiatus, and an alarm that is red for seven weeks is an alarm that
 * gets muted.
 *
 * ── WHAT THE PIPELINE DERIVES FROM THIS FILE ───────────────────────────────
 * scripts/emit.ts writes three files from the three exports below, and the
 * daily workflow stages all three by name:
 *   data/seasonBoundaries.json  ← SEASONS verbatim
 *   data/patchBoundaries.json   ← patchWindows(), i.e. rows WITH the derived
 *                                 `end` and `season`. CotW's shape, not SF6's
 *                                 (SF6 writes raw PATCHES). If emit writes
 *                                 PATCHES instead, `--emit` here and emit.ts
 *                                 disagree and the file flip-flops on every
 *                                 run — pick this one.
 *   data/patchGroups.json       ← buildPatchGroups()
 * `tsx scripts/seasons.ts --emit` writes the same three bytes, which is how a
 * fresh checkout materialises them without a full fetch+parse (app.config.ts
 * imports patchGroups.json, so `npm run typecheck` needs it to exist).
 *
 * Run: npm run data:seasons   (validator; also runs inside `npm run typecheck`)
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PatchBoundary, PatchWindow, SeasonBoundary } from '../types/index';

/**
 * The oldest replay footage that exists, and the floor for the pre-release era.
 *
 * Measured 2026-09-07 on the Replay Theater catalogue: 84 rows dated
 * 2020-04-18 … 2020-10-11, fourteen months before launch, with Nagoriyuki
 * already named. That is further back than any sibling — CotW's floor was 105
 * rows about 3.5 months pre-launch inside a single open beta — and the rows
 * span more than one pre-release build.
 *
 * This is a GATE, not a milestone: raising it is safe, lowering it admits
 * footage no era covers and seasonForDate() throws on it. Channels opt in
 * individually via ChannelConfig.preReleaseFrom; there is no global admission.
 */
export const PRE_RELEASE = '2020-04-18';

/**
 * Retail launch, 2021-06-11, on PS4/PS5 AND Steam the same day. Season 1 opens
 * here. Note this is NOT the date of Ver 1.03 for a PC corpus — see the launch
 * row in PATCHES.
 */
export const LAUNCH = '2021-06-11';

/** Days without a new patch before scripts/expiries.ts calls the table stale.
 *  90, from the cadence measurement in the header: the median is 38 and p90 is
 *  75, but a genuine 127-day ArcSys hiatus is on the record. This alarm is not
 *  the real check — `npm run data:patch-check` is — it is the one that cannot
 *  go blind, because it reads only the table's own newest date and the clock. */
export const STALE_PATCH_DAYS = 90;

/** The pre-release era's number. 0 IS A REAL ERA HERE, NOT A SENTINEL. SF6
 *  returns 0 from seasonForDate to mean "before launch, file it as a miss" —
 *  do not port that reading. On this game 0 is 221 measured records with a real
 *  parent chip, and a date no era covers THROWS instead. */
const PRE_RELEASE_SEASON = 0;

/**
 * Balance eras. Hardcoded, argued in the header, never inferred from a version
 * number.
 *
 * `battleMajor` is the era authority and the thing check 8 verifies. `label`
 * is set only on the pre-release era: the type defaults the rest to
 * `Season ${season}`, which is what ArcSys and the community both call them —
 * Strive's seasons carry a Season Pass number and no marketing subtitle, so
 * there is nothing for a label to add. CotW needed labels because "Legends
 * Unleashed" is what its players say.
 *
 * `confirmed: false` would mean "ArcSys announced the date, the landing is
 * unverified", and scripts/expiries.ts fails loud once such a date passes.
 * Nothing is unconfirmed today: all five openers have shipped and been read.
 */
export const SEASONS: SeasonBoundary[] = [
  {
    season: PRE_RELEASE_SEASON,
    start: PRE_RELEASE,
    end: LAUNCH,
    confirmed: true,
    battleMajor: null,
    // The token is 'Beta' (see seasonToken) but the label is not, and the
    // difference is deliberate: the 221 catalogue rows come from more than one
    // pre-release build and the October 2020 one is not described as a beta in
    // any source read on 2026-09-07. "Pre-release" is what the evidence
    // supports. "Season 0" is what it is NOT — the vendor never shipped that.
    label: 'Pre-release',
    note: 'Pre-launch builds, April 2020 onward. Admitted per channel via preReleaseFrom, never globally.',
  },
  {
    season: 1,
    start: LAUNCH,
    end: '2022-06-10',
    confirmed: true,
    battleMajor: 1,
    note: 'Launch. The battle version stayed in the 1.x line the whole era, reaching 1.09.',
  },
  {
    season: 2,
    start: '2022-06-10',
    end: '2023-08-24',
    confirmed: true,
    battleMajor: 2,
    note: 'Opened by Ver. 1.18 — battle version 1.09 → 2.00, in the vendor’s own words.',
  },
  {
    season: 3,
    start: '2023-08-24',
    end: '2024-10-31',
    confirmed: true,
    battleMajor: 3,
    note: 'Opened by Ver. 1.29 (Johnny) — battle version 2.06 → 3.00.',
  },
  {
    season: 4,
    start: '2024-10-31',
    end: '2026-04-09',
    confirmed: true,
    battleMajor: 4,
    note: 'Opened by Ver. 1.40 (Queen Dizzy) — battle version 3.07 → 4.00.',
  },
  {
    season: 5,
    start: '2026-04-09',
    end: null,
    confirmed: true,
    battleMajor: 5,
    note: 'Opened by Ver. 2.00 (Jam Kuradoberi) — battle version 4.09 → 5.00.',
  },
];

/** Vendor patch-note permalink. Post ids survived the 2026-06-24 site rebuild:
 *  pre-rebuild posts kept 1206…2963, post-rebuild ones got 5xxx. */
const post = (id: number): string => `https://www.guiltygear.com/ggst/en/news/post-${id}/`;

/**
 * Every patch ArcSys announced, oldest first: 48 rows — 44 vendor versions,
 * one version-less launch row, and three date-token pre-release rows (all four
 * version-less rows are explained where they appear below).
 *
 * `battleVersion` IS RECORDED WHERE THE VENDOR STATED IT, AND NOWHERE ELSE.
 * The notes say things like "updated from 1.09 to 2.00", which fixes two rows
 * at once: the `to` half is this patch's battle version, and the `from` half is
 * the value that was in force on the patch immediately before it. Both halves
 * are transcribed; rows with neither stated carry no `battleVersion` rather
 * than an interpolation between two known values. 21 of 45 rows carry one
 * today, including every season opener and the row before it, which is what
 * check 8 needs. Filling in the rest means reading 23 more patch bodies.
 *
 * Season headings below are a reading aid. Membership is DERIVED from the date
 * by seasonForDate(), never authored — attributing by version prefix is the
 * trap this game is built to fall into.
 */
export const PATCHES: PatchBoundary[] = [
  // ── Pre-release ─────────────────────────────────────────────────────────
  //
  // ArcSys published NO version string for any pre-launch build, so the token
  // is the publication date, ISO-normalised (checklist amendment 4b — Tōkon's
  // rule for a vendor with no version grammar, applied here to the one era of
  // this game that has none).
  //
  // THESE ROWS EXIST BECAUSE THE ERA WITHOUT THEM HAS NO PATCH TOKEN. The
  // pre-release SEASON covers 2020-04-18 → launch, but a season is not a patch:
  // MatchVideo.patch is a non-nullable string and emit throws on a token no
  // boundary accounts for, so without these every pre-launch record would fail
  // the emit gate. Verified before writing them: patchForDate() returned null
  // across the whole pre-release window.
  //
  // THE BOUNDARIES ARE DERIVED FROM THE CATALOGUE, NOT FROM MARKETING. Pulled
  // the tail of the Replay Theater catalogue 2026-09-07 (pages 437–442 of 442,
  // 264 rows, of which 221 are pre-launch) and clustered by upload date. Two
  // gaps of 174 and 122 days separate three runs; every other gap is ≤28 days:
  //
  //     2020-04-18 … 2020-04-20    81 rows   the April 2020 closed beta
  //     2020-10-11                  3 rows   isolated, 174 days after and 122
  //                                          days before anything else
  //     2021-02-10 … 2021-06-10   137 rows   the 2021 run — the February open
  //                                          beta, the May second beta, and the
  //                                          press/offline uploads between them
  //
  // The third row is deliberately NOT split further. The February and May betas
  // are distinct events, but the uploads between them are continuous at ≤28-day
  // gaps, so a split would be a marketing boundary imposed on data that does not
  // show one — and "never invent a version" applies to inventing a BUILD too.
  //
  // The 221 supersedes the 84 in the recon note only because that note is
  // scoped to the 2020 builds (81 April + 3 October); its own sweep was
  // complete and matched total_count. The 2021 Feb–Jun run adds 137.
  {
    version: '2020-04-18',
    start: PRE_RELEASE,
    announcedOn: 'beta',
    note: 'April 2020 closed beta',
  },
  {
    version: '2020-10-11',
    start: '2020-10-11',
    announcedOn: 'beta',
    note: 'An isolated October 2020 build — 3 records, 174 days clear of the beta before it',
  },
  {
    version: '2021-02-10',
    start: '2021-02-10',
    announcedOn: 'beta',
    note: 'The 2021 pre-launch run: February open beta through to launch',
  },
  // ── Season 1 ────────────────────────────────────────────────────────────
  //
  // THE CONSOLE/PC SPLIT IS REAL AND ONLY HAPPENED HERE. `[Ver1.03]` is titled
  // "PlayStation®4/PlayStation®5" only and dated 2021-06-11; Steam posted
  // "v1.03 Update Notice (2021/6/18)" a week later with a different, network-fix
  // changelist. So on PC the first week of the game's life was NOT on 1.03, and
  // this corpus is PC/YouTube-sourced. Modelling that as one row starting
  // 2021-06-11 would file the launch week under a build PC players did not have.
  //
  // It is modelled as two rows instead: a version-less launch row (ArcSys
  // published no note for the Steam launch build, and 1.00/1.01/1.02 are all in
  // the never-published list, so there is no number to use — the token is the
  // ISO date, CotW's rule for exactly this case), and 1.03 starting on the
  // Steam date. The cost, stated rather than hidden: a CONSOLE replay captured
  // 2021-06-11…17 was on 1.03 and is filed under the launch build. That is the
  // minority arm of a PC corpus, and the alternative misfiles the majority.
  //
  // Steam appears in the patch-note titles from 1.05 onward, Xbox/Windows from
  // 1.26 (2023-04-06). After 1.03 there is no split to model.
  {
    version: '2021-06-11',
    start: LAUNCH,
    announcedOn: 'launch',
    note: 'Launch build — the Steam release before the day-one console patch reached PC',
  },
  // 1.03, 1.05 and 1.07 are the three rows whose bodies are past-tense and
  // state no release date; their dates come from the Steam post titles, which
  // is the best source that exists for them. Every later row has a body date.
  {
    version: '1.03',
    start: '2021-06-18',
    url: post(1206),
    announcedOn: 'guiltygear-news',
    note: 'PS4/PS5 2021-06-11, Steam 2021-06-18 with its own changelist',
  },
  { version: '1.05', start: '2021-06-29', url: post(1226), announcedOn: 'guiltygear-news' },
  {
    version: '1.07',
    start: '2021-07-27',
    url: post(1280),
    announcedOn: 'guiltygear-news',
    note: 'Goldlewis Dickinson',
  },
  {
    version: '1.09',
    start: '2021-08-27',
    battleVersion: '1.04',
    url: post(1342),
    announcedOn: 'guiltygear-news',
    note: "Jack-O'",
  },
  {
    version: '1.10',
    start: '2021-10-15',
    battleVersion: '1.05',
    url: post(1387),
    announcedOn: 'guiltygear-news',
  },
  {
    version: '1.11',
    start: '2021-11-30',
    url: post(1424),
    announcedOn: 'guiltygear-news',
    note: 'Happy Chaos',
  },
  {
    version: '1.13',
    start: '2022-01-28',
    url: post(1437),
    announcedOn: 'guiltygear-news',
    note: 'Baiken',
  },
  {
    version: '1.16',
    start: '2022-03-28',
    battleVersion: '1.09',
    url: post(1532),
    announcedOn: 'guiltygear-news',
    note: 'Testament',
  },
  // ── Season 2 ────────────────────────────────────────────────────────────
  {
    version: '1.18',
    start: '2022-06-10',
    battleVersion: '2.00',
    url: post(1560),
    announcedOn: 'guiltygear-news',
    note: 'Season 2 opener — roster-wide balance, battle version 1.09 → 2.00',
  },
  { version: '1.19', start: '2022-07-01', url: post(1582), announcedOn: 'guiltygear-news' },
  {
    version: '1.21',
    start: '2022-08-08',
    url: post(1614),
    announcedOn: 'guiltygear-news',
    note: 'Bridget',
  },
  { version: '1.22', start: '2022-09-16', url: post(1654), announcedOn: 'guiltygear-news' },
  {
    version: '1.23',
    start: '2022-11-24',
    battleVersion: '2.03',
    url: post(1698),
    announcedOn: 'guiltygear-news',
    note: 'Sin Kiske',
  },
  {
    version: '1.24',
    start: '2022-12-15',
    battleVersion: '2.04',
    url: post(1739),
    announcedOn: 'guiltygear-news',
    note: 'Crossplay',
  },
  { version: '1.25', start: '2023-03-01', url: post(1800), announcedOn: 'guiltygear-news' },
  {
    version: '1.26',
    start: '2023-04-06',
    url: post(1859),
    announcedOn: 'guiltygear-news',
    note: 'Bedman? · Xbox and Windows editions',
  },
  {
    version: '1.27',
    start: '2023-05-25',
    url: post(1910),
    announcedOn: 'guiltygear-news',
    note: 'Asuka R♯',
  },
  {
    // DECOY 1. A large content update whose body says "Season 2" — and it is
    // right, it IS Season 2. The battle version stays at 2.0x, and the next
    // patch is the one that goes to 3.00. Opening S3 here is 70 days early.
    version: '1.28',
    start: '2023-06-15',
    battleVersion: '2.06',
    url: post(1916),
    announcedOn: 'guiltygear-news',
  },
  // ── Season 3 ────────────────────────────────────────────────────────────
  {
    version: '1.29',
    start: '2023-08-24',
    battleVersion: '3.00',
    url: post(1973),
    announcedOn: 'guiltygear-news',
    note: 'Season 3 opener — Johnny, Season Pass 3, battle version 2.06 → 3.00',
  },
  { version: '1.30', start: '2023-09-04', url: post(2005), announcedOn: 'guiltygear-news' },
  { version: '1.31', start: '2023-09-25', url: post(2007), announcedOn: 'guiltygear-news' },
  {
    version: '1.32',
    start: '2023-11-07',
    battleVersion: '3.01',
    url: post(2022),
    announcedOn: 'guiltygear-news',
  },
  {
    version: '1.33',
    start: '2023-12-08',
    battleVersion: '3.02',
    url: post(2027),
    announcedOn: 'guiltygear-news',
    note: 'Elphelt Valentine',
  },
  {
    version: '1.34',
    start: '2024-01-11',
    battleVersion: '3.03',
    url: post(2121),
    announcedOn: 'guiltygear-news',
  },
  {
    version: '1.35',
    start: '2024-03-26',
    url: post(2163),
    announcedOn: 'guiltygear-news',
    note: 'A.B.A',
  },
  { version: '1.36', start: '2024-04-04', url: post(2177), announcedOn: 'guiltygear-news' },
  {
    version: '1.37',
    start: '2024-05-30',
    battleVersion: '3.05',
    url: post(2213),
    announcedOn: 'guiltygear-news',
    note: 'Slayer',
  },
  {
    // DECOY 2, and the more dangerous one: a ROSTER-WIDE balance pass whose
    // body mentions a "Season 4" bonus colour. Every heuristic a human reaches
    // for says new era. The battle version says 3.05 → 3.06, still Season 3,
    // and the battle version is right. Opening S4 here is 101 days early.
    version: '1.38',
    start: '2024-07-22',
    battleVersion: '3.06',
    url: post(2266),
    announcedOn: 'guiltygear-news',
    note: 'Roster-wide balance — mid-season, not a season opener',
  },
  {
    version: '1.39',
    start: '2024-08-08',
    battleVersion: '3.07',
    url: post(2300),
    announcedOn: 'guiltygear-news',
  },
  // ── Season 4 ────────────────────────────────────────────────────────────
  {
    version: '1.40',
    start: '2024-10-31',
    battleVersion: '4.00',
    url: post(2340),
    announcedOn: 'guiltygear-news',
    note: 'Season 4 opener — Queen Dizzy, Season Pass 4, battle version 3.07 → 4.00',
  },
  {
    version: '1.41',
    start: '2024-11-20',
    battleVersion: '4.01',
    url: post(2383),
    announcedOn: 'guiltygear-news',
    note: 'Team of 3',
  },
  // No 1.42 row: nothing announced it on either source, and the battle version
  // is 4.01 on both sides of this gap. The gap is the record.
  {
    version: '1.43',
    start: '2024-12-23',
    battleVersion: '4.01',
    url: post(2405),
    announcedOn: 'guiltygear-news',
    note: 'Balance update',
  },
  {
    version: '1.44',
    start: '2025-03-24',
    url: post(2426),
    announcedOn: 'guiltygear-news',
    note: 'Venom',
  },
  { version: '1.45', start: '2025-04-08', url: post(2463), announcedOn: 'guiltygear-news' },
  {
    version: '1.46',
    start: '2025-05-27',
    url: post(2472),
    announcedOn: 'guiltygear-news',
    note: 'Unika',
  },
  { version: '1.47', start: '2025-06-24', url: post(2543), announcedOn: 'guiltygear-news' },
  {
    version: '1.48',
    start: '2025-08-21',
    url: post(2559),
    announcedOn: 'guiltygear-news',
    note: 'Lucy · Ranked Match',
  },
  { version: '1.49', start: '2025-09-09', url: post(2683), announcedOn: 'guiltygear-news' },
  { version: '1.50', start: '2025-10-09', url: post(2712), announcedOn: 'guiltygear-news' },
  { version: '1.51', start: '2025-10-22', url: post(2771), announcedOn: 'guiltygear-news' },
  {
    // The 127-day gap behind this row is the longest silence in the game's
    // history and it is genuine, not a missing row. STALE_PATCH_DAYS is 90
    // because of it.
    version: '1.52',
    start: '2026-02-26',
    battleVersion: '4.09',
    url: post(2839),
    announcedOn: 'guiltygear-news',
  },
  // ── Season 5 ────────────────────────────────────────────────────────────
  {
    // The vendor's own title says "(April 8, 2026)" and Steam posted on the
    // 8th. The body says the update "will be available April 9" and Jam
    // unlocked on the 9th. The body wins, here and everywhere.
    version: '2.00',
    start: '2026-04-09',
    battleVersion: '5.00',
    url: post(2851),
    announcedOn: 'guiltygear-news',
    note: 'Season 5 opener — Jam Kuradoberi, Counter Blitz, roster-wide balance',
  },
  {
    version: '2.01',
    start: '2026-05-14',
    battleVersion: '5.01',
    url: post(2963),
    announcedOn: 'guiltygear-news',
    note: 'Blazing Pass Duel 1',
  },
  {
    version: '2.02',
    start: '2026-07-02',
    battleVersion: '5.02',
    url: post(5079),
    announcedOn: 'guiltygear-news',
    note: 'Robo-Ky',
  },
];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** ArcSys's version grammar — two segments, minor zero-padded. Both numbering
 *  systems use it, the game version and the battle version. `1.5` and `1.001`
 *  are both wrong and both look plausible in a diff. */
const VERSION_SHAPE = /^\d+\.\d{2}$/;
/** A patch token must never look like an era token, or the two collapse into
 *  one facet id and the parent chip stops selecting its own children. */
const ERA_SHAPE = /^(S\d+|Beta|Pre-release)$/i;

const major = (v: string): number => Number(v.split('.')[0]);
/** X.YY as one ordered number, so 1.09 < 1.10 and 4.09 < 5.00. String order
 *  gets the first of those right and the second wrong. */
const rank = (v: string): number => {
  const [maj, min] = v.split('.');
  return Number(maj) * 100 + Number(min);
};

/** The era covering a day, or null. Internal: validate() must be able to ask
 *  without the throw below firing mid-check and hiding the other errors. */
function eraOf(day: string): SeasonBoundary | null {
  for (const s of SEASONS) {
    if (day >= s.start && (s.end === null || day < s.end)) return s;
  }
  return null;
}

/**
 * The era a capture date falls in. Half-open [start, end).
 *
 * IT THROWS, and it does not return 0 for "unknown". 0 is the pre-release era
 * here — a real parent with 221 measured records — so the SF6 idiom of reading
 * 0 as "before launch, drop it" would silently discard exactly the footage the
 * pre-release era exists to keep. A date this cannot place is a record that was
 * admitted with no era to file under, which is a caller bug: gate on
 * PRE_RELEASE (or the channel's own preReleaseFrom) before asking.
 */
export function seasonForDate(iso: string): number {
  const day = iso.slice(0, 10);
  const era = eraOf(day);
  if (!era) {
    throw new Error(
      `No season covers ${day} — a record was admitted with no era to file under ` +
        `(the table starts ${PRE_RELEASE}).`,
    );
  }
  return era.season;
}

/** The era token written to Replay.patch when no patch window claims a date,
 *  and the `patchGroups` parent id. The pre-release era renders as `Beta`
 *  rather than `S0`: "Season 0" names a balance era ArcSys never shipped. */
export function seasonToken(season: number): string {
  return season === PRE_RELEASE_SEASON ? 'Beta' : `S${season}`;
}

/** Every patch with its computed window and resolved era. Windows are DERIVED,
 *  never authored: a hand-written end date is a second source of truth that
 *  drifts the moment a patch is inserted. */
export function patchWindows(patches: PatchBoundary[] = PATCHES): PatchWindow[] {
  const sorted = [...patches].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.map((p, i) => {
    const season = seasonForDate(p.start);
    const era = SEASONS.find((s) => s.season === season)!;
    const next = sorted[i + 1];
    // The window closes at the next patch IN THE SAME ERA, else at the era's
    // own end, else stays open.
    const end = next && seasonForDate(next.start) === season ? next.start : era.end;
    return { ...p, end, season };
  });
}

/**
 * The patch live on a capture date, or null when no window claims it.
 *
 * NULL IS NOW UNREACHABLE FOR ANY DAY THE TABLE COVERS, and the history is
 * worth keeping because it explains the return type. ArcSys published no note
 * for any pre-launch build and its patch category starts at 2021-06-11, so this
 * function did return null across the whole pre-release window — until the three
 * date-token rows above closed it. Executed over every day from PRE_RELEASE to
 * today: zero null days. A day before PRE_RELEASE never reaches here either,
 * because seasonForDate throws on it first.
 *
 * The nullable return stays anyway. It is the honest signature for "no window
 * claims this date", it costs the caller one `&&`, and it is what makes the
 * override recipe below expressible — which is now its only live use. CotW's
 * patchForDate returns a bare string and throws; that shape could not express
 * the pre-release window at all, which is why this one does not copy it.
 *
 * emit.ts must also check the era agrees, because an override can move a
 * replay's season away from the one its date-derived patch belongs to:
 *   const w = patchForDate(v.publishedAt, windows);
 *   const token = w && w.season === v.season ? w.version : seasonToken(v.season);
 */
export function patchForDate(iso: string, windows: PatchWindow[] = patchWindows()) {
  const day = iso.slice(0, 10);
  for (const w of windows) {
    if (day >= w.start && (w.end === null || day < w.end)) return w;
  }
  return null;
}

/**
 * The engine's `GameConfig.patchGroups` — eras as parents, patches as children,
 * both in timeline order.
 *
 * PIPELINE-EMITTED, never hand-written: the same table that derives every
 * replay's `patch` builds the facet, so the UI hierarchy and the data cannot
 * disagree. Ids must be unique across all parents AND children; validate()
 * covers that with the duplicate-version check plus the era-token shape guard.
 *
 * The pre-release era carries THREE children, one date-token row per clustered
 * pre-launch run (April 2020, October 2020, February–June 2021). That is not
 * incidental: engine rule 14 (STACK §5) requires a patch facet to carry child
 * granularity under its era parents and never era-only, so a parent with no
 * children would be the one shape the engine forbids. An earlier draft of this
 * comment claimed the opposite — if you are here because a reader deleted those
 * three rows on its authority, that is why they exist.
 */
export function buildPatchGroups(): {
  id: string;
  label?: string;
  note?: string;
  children?: { id: string; label?: string; note?: string }[];
}[] {
  const windows = patchWindows();
  return SEASONS.map((s) => {
    const children = windows
      .filter((w) => w.season === s.season)
      .map((w) => ({
        // A version token reads as the vendor writes it on the site; the one
        // date token reads as a date. `Ver. 1.18`, not `1.18`.
        id: w.version,
        label: ISO_DAY.test(w.version) ? w.version : `Ver. ${w.version}`,
        ...(w.note ? { note: w.note } : {}),
      }));
    return {
      id: seasonToken(s.season),
      ...(s.label ? { label: s.label } : {}),
      ...(s.note ? { note: s.note } : {}),
      ...(children.length ? { children } : {}),
    };
  });
}

// ── validators ──────────────────────────────────────────────────────────────
//
// Run by `npm run data:seasons` AND by `npm run typecheck`, so a bad row cannot
// reach a build: `tsc --noEmit` only TYPE-checks and would never execute any of
// this. Each check names the silent failure it prevents.
//
// ONE FUNCTION, NOT SF6's validateSeasons + validatePatches. Three of the rules
// below are cross-table (the opener rule, the battle-major rule, era coverage),
// so splitting them puts half the checks in a function that cannot see the
// other table — the same defect the one-module argument in the header is about.
//
// COLLECT, THEN REPORT, rather than exiting on the first error: a validator
// that stops at error one tells you there is exactly one problem when there may
// be six, and a table edit usually breaks several rules at once.

/** Every rule violation in the two tables. Pure; `today` is injectable so a
 *  test can pin the clock. */
export function validate(today = new Date().toISOString().slice(0, 10)): string[] {
  const errs: string[] = [];
  const byStart = [...PATCHES].sort((a, b) => a.start.localeCompare(b.start));

  // 1. Shapes. A malformed date sorts wrong, files records nowhere, and asserts
  //    clean while doing it.
  for (const s of SEASONS) {
    if (!ISO_DAY.test(s.start)) errs.push(`S${s.season}: start "${s.start}" is not an ISO day`);
    if (s.end !== null && !ISO_DAY.test(s.end))
      errs.push(`S${s.season}: end "${s.end}" is not an ISO day`);
    if (s.end !== null && s.end <= s.start)
      errs.push(`S${s.season}: end ${s.end} is not after start ${s.start}`);
  }
  for (const p of PATCHES) {
    if (!ISO_DAY.test(p.start)) errs.push(`${p.version}: start "${p.start}" is not an ISO day`);
    if (!VERSION_SHAPE.test(p.version) && !ISO_DAY.test(p.version)) {
      errs.push(
        `${p.version}: not an ArcSys version — expected X.YY with the minor zero-padded ` +
          `(the vendor writes 1.03, never 1.3), or an ISO date for a build it published no number for`,
      );
    }
    // A date token is the escape hatch for a build with no vendor number. It is
    // not a way to avoid transcribing one that exists, so it must be declared.
    if (ISO_DAY.test(p.version) && p.announcedOn !== 'launch' && p.announcedOn !== 'beta') {
      errs.push(
        `${p.version}: date-keyed token on an announcedOn:${p.announcedOn} row — ` +
          `only 'launch' and 'beta' rows may skip the version, and ArcSys numbered every other patch`,
      );
    }
    if (ERA_SHAPE.test(p.version)) errs.push(`${p.version}: collides with an era token`);
    if (p.battleVersion !== undefined && !VERSION_SHAPE.test(p.battleVersion)) {
      errs.push(`${p.version}: battleVersion "${p.battleVersion}" is not an X.YY battle version`);
    }
  }

  // 2. Unique version tokens. A duplicate makes one window unreachable and
  //    mints two facet children with the same id.
  const seen = new Set<string>();
  for (const p of PATCHES) {
    if (seen.has(p.version)) errs.push(`${p.version}: duplicate version`);
    seen.add(p.version);
  }

  // 3. NO TWO PATCHES SHARE A START DATE. Two patches on one day is not
  //    impossible in principle — it IS impossible to file records between
  //    them, so it has to be a human decision rather than a silent sort. CotW
  //    hit this for real: its CMS gave two patches the same date and taking
  //    that at face value would have misfiled 950 records.
  const byDay = new Map<string, string[]>();
  for (const p of PATCHES) byDay.set(p.start, [...(byDay.get(p.start) ?? []), p.version]);
  for (const [day, vs] of byDay) {
    if (vs.length > 1) {
      errs.push(
        `${vs.join(' and ')} both start ${day} — read each patch note's own body sentence ` +
          `("will be released … on ‹date›"). The WordPress date and the title parenthetical ` +
          `disagree with it on 12 of the 18 rows that carry one, and either will produce this`,
      );
    }
  }

  // 4. Version order and date order must AGREE, for the numbered rows. The
  //    FOUR date-keyed rows are exempt by construction — the launch row and the
  //    three pre-release build rows — because an ISO day has no place in a
  //    numeric ordering. This is the check that catches a transposed digit.
  const numeric = PATCHES.filter((p) => VERSION_SHAPE.test(p.version));
  const numByDate = [...numeric].sort((a, b) => a.start.localeCompare(b.start));
  const numByVersion = [...numeric].sort((a, b) => rank(a.version) - rank(b.version));
  for (let i = 0; i < numByDate.length; i++) {
    if (numByDate[i]!.version !== numByVersion[i]!.version) {
      errs.push(
        `version order and date order disagree at position ${i}: by date ` +
          `${numByDate[i]!.version} (${numByDate[i]!.start}), by version ${numByVersion[i]!.version}`,
      );
      break;
    }
  }

  // 5. Floors and the future guard. A typo'd year mints an empty window that
  //    filters to nothing, folds every real replay into the row above it, and
  //    asserts perfectly clean — the silence this table exists to break,
  //    arriving through the front door. `today` is read per call, never at
  //    module load: this module outlives midnight inside a long data:parse, and
  //    a frozen "today" is a guard that quietly loosens.
  for (const p of PATCHES) {
    if (p.start < PRE_RELEASE)
      errs.push(`${p.version}: starts ${p.start}, before the pre-release floor ${PRE_RELEASE}`);
    if (p.start > today)
      errs.push(`${p.version}: starts ${p.start}, in the FUTURE (today ${today})`);
  }
  for (const s of SEASONS) {
    if (s.start > today)
      errs.push(`S${s.season}: starts ${s.start}, in the future (today ${today})`);
  }

  // 6. Eras tile the timeline with no gap and no overlap, numbered
  //    consecutively, newest left open. A gap makes seasonForDate throw at
  //    parse time on a real record; an unclosed newest era stops the current
  //    season from ever collecting new replays.
  const eras = [...SEASONS].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < eras.length; i++) {
    if (eras[i - 1]!.end !== eras[i]!.start) {
      errs.push(
        `era gap/overlap: S${eras[i - 1]!.season} ends ${eras[i - 1]!.end}, ` +
          `S${eras[i]!.season} starts ${eras[i]!.start}`,
      );
    }
    if (eras[i]!.season !== eras[i - 1]!.season + 1) {
      errs.push(
        `era numbers must be consecutive in date order (got S${eras[i]!.season} after S${eras[i - 1]!.season})`,
      );
    }
  }
  if (eras[0]!.start !== PRE_RELEASE)
    errs.push(`the first era must start at the pre-release floor ${PRE_RELEASE}`);
  if (eras.at(-1)!.end !== null) errs.push('the newest era must be open (end: null)');

  // 7. Every patch falls inside exactly one era, BY DATE — never by version
  //    prefix. And every era that owns patches opens ON its first one: an era
  //    whose first child starts later has a window at its head that files
  //    records under a patch from the era before it.
  //
  //    THE PRE-RELEASE EXEMPTION IS NOW DEAD CODE, AND IT IS KEPT ON PURPOSE.
  //    It was written when the pre-release era owned nothing: ArcSys's patch
  //    category holds 46 posts and the oldest is 2021-06-11, so there is no
  //    pre-launch patch NOTE to cite. The era now owns three DATE-TOKEN rows
  //    instead — legitimate under amendment 4b, which is the rule for a vendor
  //    with no version grammar, and required by engine rule 14 (a parent may
  //    not be childless). So the branch can no longer fire. Removing it would
  //    make the file silently accept a genuinely childless era later; leaving
  //    it costs one comparison and keeps the intent legible.
  for (const p of PATCHES) {
    if (!eraOf(p.start)) errs.push(`${p.version}: starts ${p.start}, which no era covers`);
  }
  for (const s of SEASONS) {
    const own = byStart.filter((p) => eraOf(p.start)?.season === s.season);
    if (own.length === 0) {
      if (s.season !== PRE_RELEASE_SEASON) {
        errs.push(`S${s.season} (${s.label ?? `Season ${s.season}`}) owns no patch`);
      }
      continue;
    }
    if (own[0]!.start !== s.start) {
      errs.push(
        `S${s.season} opens ${s.start} but its first patch ${own[0]!.version} starts ${own[0]!.start}`,
      );
    }
  }

  // 8. THE BATTLE-MAJOR RULE — the one that makes the two decoys impossible.
  //    ArcSys versions the balance separately from the build, and its battle
  //    MAJOR bumps land on all four season boundaries with zero exceptions. So:
  //    every patch's battle major must equal its era's, and every boundary
  //    after Season 1 must sit exactly where that major incremented.
  //
  //    Promote Ver 1.38 (battle 3.06) to open Season 4 and the first clause
  //    fires; move Season 3 back to Ver 1.28 (battle 2.06) and it fires again.
  //    Neither mistake is visible in a date, a version number, or a patch
  //    note's own prose — all three of those say "big balance update".
  for (const p of PATCHES) {
    if (!p.battleVersion) continue;
    const era = eraOf(p.start);
    if (!era) continue; // already reported by check 7
    if (era.battleMajor === null) {
      errs.push(
        `${p.version}: carries battleVersion ${p.battleVersion} but sits in the pre-release era, ` +
          `which predates the scheme`,
      );
    } else if (major(p.battleVersion) !== era.battleMajor) {
      errs.push(
        `${p.version} (${p.start}) is battle ${p.battleVersion} but sits in S${era.season}, ` +
          `whose battleMajor is ${era.battleMajor} — the era boundary is in the wrong place, ` +
          `or this row's battleVersion was transcribed from the wrong patch note`,
      );
    }
  }
  let highest = 0;
  for (const p of byStart) {
    if (!p.battleVersion) continue;
    if (rank(p.battleVersion) < highest) {
      errs.push(
        `${p.version} (${p.start}) is battle ${p.battleVersion}, lower than a battle version ` +
          `already in force — the battle version only ever goes up`,
      );
    }
    highest = Math.max(highest, rank(p.battleVersion));
  }
  for (const s of SEASONS) {
    if (s.battleMajor === null) continue;
    // Season 1 is exempt from the increment half: it opens at retail launch,
    // and ArcSys stated no battle version in the launch-era notes until 1.09.
    if (s.season <= 1) continue;
    const i = byStart.findIndex((p) => p.start === s.start);
    if (i < 0) continue; // check 7 already said this era has no opener
    const opener = byStart[i]!;
    const prev = byStart[i - 1];
    if (!opener.battleVersion) {
      errs.push(
        `S${s.season} opens on ${opener.version} but that row carries no battleVersion — ` +
          `the era authority on this game is the battle major, and an opener without one ` +
          `cannot be checked against it`,
      );
    } else if (major(opener.battleVersion) !== s.battleMajor) {
      errs.push(
        `S${s.season} declares battleMajor ${s.battleMajor} but its opener ${opener.version} ` +
          `is battle ${opener.battleVersion}`,
      );
    }
    if (!prev) {
      errs.push(`S${s.season}: no patch precedes its opener ${opener.version}`);
    } else if (!prev.battleVersion) {
      errs.push(
        `S${s.season}: ${prev.version}, the patch before its opener, carries no battleVersion — ` +
          `"the era opens where the battle major incremented" is unverifiable without it`,
      );
    } else if (major(prev.battleVersion) !== s.battleMajor - 1) {
      errs.push(
        `S${s.season} opens ${s.start}, but the battle major did not increment there: ` +
          `${prev.version} is battle ${prev.battleVersion} and ${opener.version} is battle ` +
          `${opener.battleVersion ?? '(none)'}`,
      );
    }
  }

  // 9. Provenance. A row with no url is a row nobody can check. The launch row
  //    is exempt by its `announcedOn`, not by hand-waving: ArcSys published no
  //    post for the Steam launch build.
  for (const p of PATCHES) {
    if (p.announcedOn === 'guiltygear-news' && !p.url) {
      errs.push(`${p.version}: announcedOn guiltygear-news but has no url`);
    }
  }

  return errs;
}

// ── derived files ───────────────────────────────────────────────────────────

/** Write the three derived tables emit.ts also writes. Same functions, same
 *  serialisation, so both writers produce identical bytes; see the header. */
async function emitDerived(): Promise<string[]> {
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const files: [string, unknown][] = [
    ['seasonBoundaries.json', SEASONS],
    ['patchBoundaries.json', patchWindows()],
    ['patchGroups.json', buildPatchGroups()],
  ];
  for (const [name, value] of files) {
    await writeFile(join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  return files.map(([name]) => name);
}

// ── standalone entry ────────────────────────────────────────────────────────
//
// `isMain` GUARD, NOT A BARE ARGV CHECK. This module is imported by parse.ts,
// emit.ts and expiries.ts; a bare `process.argv.includes('--check')` fires this
// block whenever ANY of them runs with --check, printing this banner over their
// output and letting a process.exit(1) here kill an unrelated script.
const isMain = !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);

if (isMain && (process.argv.includes('--check') || process.argv.includes('--emit'))) {
  const errs = validate();
  if (errs.length > 0) {
    console.error(`✖ ${errs.length} error(s) in the season/patch table:`);
    for (const e of errs) console.error(`  • ${e}`);
    process.exit(1);
  }
  const windows = patchWindows();
  const openers = SEASONS.filter((s) => PATCHES.some((p) => p.start === s.start)).length;
  const boundaries = SEASONS.filter((s) => s.battleMajor !== null && s.season > 1);
  console.log(
    `✓ ${SEASONS.length} eras, ${PATCHES.length} patches — ` +
      `${windows.filter((w) => w.end === null).length} open window(s), ` +
      `eras open on ${openers}/${SEASONS.length} first children, ` +
      `battle major increments on ${boundaries.length}/${boundaries.length} era boundaries`,
  );
  if (process.argv.includes('--emit')) {
    const written = await emitDerived();
    console.log(`✓ wrote data/${written.join(', data/')}`);
  }
}
