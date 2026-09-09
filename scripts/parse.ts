/**
 * Stage 2: turn raw/*.json into the committed substrate data/videos.json, plus
 * data/players.json, data/review-queue.json and data/report.md.
 *
 * ONE PARSER FOR FOUR GRAMMARS, AND ONE PLACE WHERE IT IS NOT ENOUGH. Eight
 * channels publish four title orientations between them (types/index.ts
 * SlotOrder). The parser never CHOOSES a slot order: it asks which span of a
 * side resolves to a roster alias and takes the remainder as the handle, so
 * "Jack (#1 Ranked Robo-Ky)", "#1 VENOM (Papaya)", "SOL / ソル [ tatuma ]",
 * "わらわ（RoboKy ロボカイ）" and "Seisei Happy Chaos" all read from one code
 * path — CotW's argument, kept.
 *
 * WHERE STRIVE DIVERGES (checklist 5m, this build's contribution): CotW's
 * parseSide returns the moment ANY bracket resolves, without checking whether
 * the OUTSIDE also resolves. On this corpus that is not an edge case — Strive's
 * playerbase names itself after the roster more than any sibling's, and the
 * failure is silent: measured 2026-09-07 (recon/channels-live.md §4), 215
 * titles were rejected for exactly this and 67 more were filed CONFIDENTLY
 * WRONG — player "UNIKA / ユニカ" from `A.B.A / アバ [ Beshh00 ] vs UNIKA /
 * ユニカ [ ユニカ ]`, player "JOHNNY / ジョニー", player "SOL / ソル". So here
 * parseSide computes BOTH readings on every bracketed segment; exactly one
 * resolving wins as before; BOTH resolving is a tie that the channel's DECLARED
 * slotOrder breaks — recorded as `provenance.tieBroken` and counted per channel
 * — and a channel with no usable declared order sends the record to the review
 * queue as 'slot-ambiguous' with both readings attached. Nothing is guessed.
 *
 * The pipeline order is load → gate → parse → index-merge → dedupe → guard →
 * write, and the guards are the point:
 *
 *   · game marker, hashtag-stripped, TITLE ONLY   (checklist 3 — channels.ts)
 *   · date floor per channel                      (pre-release only where declared)
 *   · stale-raw, DATA-ONLY                        (checklist 10c; no mtime)
 *   · duration floor, per channel where declared  (types/index.ts minDurationSec)
 *   · residue                                     (checklist 5c)
 *   · registry invariant, at parse time           (checklist 5n — parse-finish.ts)
 *   · collapse, parsed-vs-committed               (checklist 7)
 *   · freeze carry with a pinned count            (checklist 7)
 *   · dedupe on the INTAKE key                    (checklist 2)
 *   · review queue, never guessed                 (checklist 6)
 *
 * Run: npm run data:parse
 *
 * Flags:
 *   --seed-freeze-pins   Parse a frozen channel's dump (present only after
 *                        `data:fetch --include-frozen`), print the count to set
 *                        as `frozen.records` in scripts/channels.ts, and REFUSE
 *                        to write anything. The only legitimate use is seeding
 *                        the pin; see channels.ts on ggstLowLevel.
 *   --allow-collapse     Accept a collapse the guard would refuse (parse-finish).
 */

import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHANNELS, hasStriveMarker, stripHashtagRun, stripTheaterSponsor } from './channels';
import { isPlaceholderHandle } from './crosscheck';
import { LAUNCH, patchForDate, patchWindows, seasonForDate, seasonToken } from './seasons';
import { buildAliasMatcher, loadCharacters, normalizeText, playerId } from './roster';
// The back half of the same pipeline — index merge, dedupe, collapse guard,
// freeze carry, registry invariant, players, report. Split from this file for
// legibility only; there is one parse and it is these two files.
import { writeReportAndData } from './parse-finish';
import type { ChannelTally, DurationHistogram } from './parse-finish';
import type { AliasMatcher } from './roster';
import type {
  ChannelKey,
  CharProvenance,
  MatchSide,
  MatchVideo,
  RawVideoRecord,
  ReviewQueueItem,
  SlotOrder,
  SourcePins,
  VideoOverride,
} from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'raw');
const DATA = join(ROOT, 'data');

const SEED_FREEZE_PINS = process.argv.includes('--seed-freeze-pins');

/**
 * A whole-video record has to be long enough to BE a set. 120 seconds.
 *
 * INHERITED FROM CotW, THEN MEASURED HERE. CotW argued 120 from its own
 * durations (370 sub-two-minute clips, shortest genuine match 202s). The
 * 2026-09-07 recon could not repeat that — it never called videos.list, so
 * neither `too-short` nor `live` exists in its 16.12% miss split
 * (recon/critic.md) — and the number was carried over on CotW's authority
 * alone. The 2026-09-08 hydration pass (ggst-notes/hydration.md, videos.list
 * over all 18,509 marked uploads) then measured it: every set channel's p10 is
 * ≥3m35 and the sub-120s band is shorts and lab clips on every channel but ONE.
 * That one is ggstHq, where 434 uploads under 120s are fully titled matchups
 * (YouTube Shorts, median exactly 60s) and 242 are the only footage of that
 * matchup — so the floor is PER CHANNEL where declared (types/index.ts
 * minDurationSec; ggstHq sets 30) and this constant is the platform default.
 *
 * report.md still prints the per-channel duration histogram, split by whether
 * the title was match-shaped, so the number stays re-derivable from the corpus
 * rather than from this comment. The name is engine vocabulary: on the YouTube
 * arm a whole-video record is a SET (hydration.md), and this floors a set.
 */
export const MIN_MATCH_SEC = 120;

/**
 * A handle is at most MAX_HANDLE_WORDS words. MEASURED 2026-09-09 on the first
 * real parse (32,922 sides): 1 word 30,230 · 2 → 2,230 · 3 → 395 · 4 → 61 ·
 * 5 → 6. CotW measured 4 on 8,776 sides and every longer "handle" there was
 * leaked decoration; here the four-word band is REAL — Japanese handles run
 * long ("ichi tada kuro neko", "jinin neko neko") — so 5 stays and the strips
 * carry the burden.
 *
 * THE RESIDUAL IS NAMED RATHER THAN CLAIMED GONE, because a comment saying the
 * strips handle it is worth nothing once they do not. Of the 6,540 handles,
 * FOUR are still decoration the strips do not reach:
 *   "UFA 2023 Losers Semifinals Sorani"     the player is Sorani
 *   "Infiltration Arc Revo Japan Runback"   the player is Infiltration
 *   "First To 3"                            not a person at all
 *   "3 OB = My Turn"                        a set label
 * They survive because every word in them is a plausible handle word somewhere
 * else — a blanket strip of "first", "to", "arc" or "final" would cost real
 * players. "PATCH 2.0 ZIN" and "PATCH 2.0 天帝わんちゃん" WERE in this list and
 * are not any more: the literal word PATCH followed by a version is
 * unambiguous, so DECOR_PREFIX consumes it and the two records rejoined their
 * real players. report.md keeps printing the distribution, so the next drift
 * shows as a bump at 5.
 */
const MAX_HANDLE_WORDS = 5;

// ── decoration, stripped before parsing ─────────────────────────────────────
//
// Every pattern below is a measured prefix or suffix from the 50-title samples
// in recon/channels-live.md §2. ORDER IS LOAD-BEARING, as CotW learned at a cost
// of 820 records: the PREFIX strip runs first, and `strip()` refuses any edit
// that empties the string or removes the last `vs` — a decoration strip that
// takes the matchup with it is a bug by definition.
//
// Glyphs seen in front of or between slots: ▰ ▶ (ggHighLevel, ggstLowLevel),
// ⏺ (ggstLowLevel), ➤ (ggstBattleCollection), ✪ (guiltyGearVods), 🔥
// (ggstHighRank, yumegiwa's tail). U+FE0F is the emoji variation selector that
// rides on "▶️"; without it the selector survives the strip and lands in a
// handle as an invisible first character.
const DECOR = '\\uFE0F▰▶⏺➤✪🔥⭐🌟✨⚡👑🎮|｜:\\-–—';
const DECOR_GLYPHS = /[\uFE0F▰▶⏺➤✪🔥⭐🌟✨⚡👑🎮]/gu;

const DECOR_PREFIX = new RegExp(
  [
    // "[GGST-REPLAY] #2 MAY Venom Snake vs …" — ggstHighRank's older shape.
    String.raw`^\s*\[\s*GGST[^\]]*\]\s*`,
    // "(OLD) Guilty Gear Strive Roysol Bridget VS …" — ggstHq puts its archive
    // note at the FRONT on some titles and at the back on others; unstripped
    // it became the handle "Guilty Gear Strive Roysol" (2026-09-09 run).
    String.raw`^\s*\(\s*(?:OLD|NEW)\s*\)\s*`,
    // "GGST ▰ ", "GGST | ", "GGST 🔥 ", "GGST ✪ ", "GGST2.0➤", "GGST➤",
    // "GGST 5.2 ", "Guilty Gear Strive 5.2 ", "GGST Floor 1 ▶ ", "GGST Iron 1 ▶ ",
    // "Guilty Gear Strive Floor 4 ⏺ ", "GGST High Level Gameplay | #3 RANKED …"
    // (ggstHighRank's mid-era shape), "Guilty Gear Strive High Level Iwan
    // Nagoriyuki VS …" (ggstHq, where the house phrase precedes the handle on
    // 14 titles and read as "High Level Iwan" until it was consumed here).
    // "GGST Season 3 ▰ Baaru (Johnny) vs …" (ggHighLevel's 2024 shape, 12
    // titles read as "Season 3 Baaru"), "Guilty Gear Strive High Mugi
    // Nagoriyuki VS …" (ggstHq clips its own phrase to "High" on 10 titles) and
    // "… High Level PS5 GG Player Zato VS …" are all house decoration in front
    // of the handle. The version token is consumed here and COUNTED separately
    // by VERSION_TOKEN below — it is never a patch.
    String.raw`^\s*(?:Guilty\s*Gear\s*-?\s*Strive\s*-?|GGST)\s*(?:\d+\.\d+(?![\d.]))?\s*(?:Season\s*\d+\s*)?(?:(?:Floor|Iron)\s*\d+)?\s*(?:(?:High|Mid|Low)\s*(?:Level\s*)?(?:Game\s*play\s*)?)?(?:Special\s*Bout\s*)?(?:PS[45]\s*|PC\s*)?[${DECOR}]*\s*`,
    // "PATCH 2.0 ZIN vs …" — ggstBattleCollection stamps the patch on the FRONT
    // of some titles, where it read as the handles "PATCH 2.0 ZIN" and
    // "PATCH 2.0 天帝わんちゃん" on the 2026-09-09 run. Unambiguous: no handle in
    // 6,542 begins with the literal word PATCH followed by a version.
    String.raw`^\s*PATCH\s*\d+\.\d+\s*`,
    // "【わらわ（RoboKy ロボカイ）VS …】" — yumegiwa wraps the matchup in 【 】.
    String.raw`^\s*【\s*`,
  ].join('|'),
  'iu',
);

const DECOR_SUFFIX = new RegExp(
  [
    // "】#ggst  No.476 日曜から夜更し 🔥Ver2.1🔥Season5🔥" — everything after
    // yumegiwa's closing 】 is the tournament stamp. The "#ggst" sits mid-title
    // there, so stripHashtagRun cannot reach it; this can.
    String.raw`\s*】.*$`,
    // ". High Level Gameplay", "| Guilty Gear Strive High level gameplay",
    // "| GGST High Level Match Replay", "| GGS High Level Match Replay" (a
    // measured typo, guiltyGearVods #17), "| GG Strive High Level Match
    // Replay", " - GGST High Level Gameplay", ". Guilty Gear STRIVE Low Level
    // Gameplay", "High Level Gameplay (OLD)" — and the CLIPPED spellings the
    // 2026-09-09 run found leaking into handles: ". High Level Play", ". High
    // Level" with nothing after it, "First To 5 High Level". The noun after
    // "Level" is optional for that reason, and the whole phrase is anchored on
    // "Level" so it cannot fire on a handle like "High Level Kid Viper" — that
    // one is a PREFIX case and is consumed above.
    //
    // THE TAIL MAY NOT CROSS A `vs`. The engine takes the LEFTMOST match, and
    // "Tyurara (High Level Elphelt) vs Syokusyu (TOP Ranked Chipp). High Level
    // Gameplay" has the phrase in a RANK slot before the matchup: the leftmost
    // match ate "… vs Syokusyu …", strip() refused the edit for dropping the
    // last `vs`, and the real suffix survived into the handle "Syokusyu . High
    // Level Gameplay". So the tail is every character up to the end EXCEPT a
    // separator, which forces the match onto the true suffix.
    String.raw`\s*[.!|｜\-–—]*\s*(?:First\s*To\s*\d+\s*)?(?:(?:GGST|GGS|GG|Guilty\s*Gear|Strive)\s*)*(?:High|Mid|Low)\s*Level\s*(?:Game\s*play|Play|Match\s*Replay|Replay|Match|Games?)?\b(?:(?!(?<![\p{L}\p{N}])(?:vs\.?|versus|×)(?![\p{L}\p{N}]))[\s\S])*$`,
    // ". Gameplay" alone (ggHighLevel, "Girth-chan (Potemkin). Gameplay"),
    // ". Pro Play", "New DLC Gameplay!!" and yumegiwa's "GGST Player Match".
    String.raw`\s*[.!|｜\-–—]+\s*(?:Pro\s*)?(?:Game\s*play|Play)\s*$`,
    String.raw`\s*New\s*DLC\s*Game\s*play\s*[!]*\s*$`,
    String.raw`\s*(?:GGST\s*)?Player\s*Match\s*$`,
    // " Guilty Gear", " Guilty Gear Strive", "GuiltyGearStrive", "]GuiltyGear"
    // flush against the closing bracket (ggstBattleCollection's tail) and
    // ". GG Strive" (ggHighLevel). Anchored to the END so it cannot eat a
    // matchup.
    String.raw`\s*[.!|｜\-–—]*\s*(?:GG\s*Strive|Guilty\s*Gear\s*(?:Strive)?)\s*$`,
    String.raw`\s*[${DECOR}!]+\s*$`,
    String.raw`\s*\(?\[?(?:4K|HD|1080p|60fps)\]?\)?\s*$`,
  ].join('|'),
  'iu',
);

/**
 * A hashtag ANYWHERE in the title, once the marker gate has run. channels.ts's
 * stripHashtagRun removes the trailing run only, and its token class has no
 * "." — so "#ggst2.0", ggstHq's and ggstBattleCollection's favourite tag, ends
 * a run the strip cannot see and the whole tail survives into the side segment.
 * Measured 2026-09-09: "#guiltygearstrive #ggst2.0" was the display handle on
 * 66 sides and "#ggst2.0" on 30 more. A tag never names a player, so every
 * `#letters…` token is removed here; `#1` / `# 1` (a rank, or "Setchi's # 1
 * fan") starts with a digit and is untouched.
 */
const HASHTAG_TOKEN = /(?<![\p{L}\p{N}])#[\p{L}][\p{L}\p{N}_.]*/gu;

/**
 * ggstHq's version token — "GGST 5.2 …", "Guilty Gear Strive 5.1 …", and the
 * glued "GGST2.0➤" on ggstBattleCollection. THE PARSER SEES 644 of ggstHq's
 * 3,006 uploads, not the recon's 2,864: that figure is from a different field
 * (channels-live.md:306 calls it "a Version field"), and no reading of the
 * title text reaches it — loosening to any X.Y anywhere, hashtags included,
 * tops out at 656. Re-measured with this regex 2026-09-09.
 *
 * COUNTED, NEVER PARSED INTO Replay.patch. recon/critic.md flags that "5.2" and
 * "5.1" appear in no ArcSys patch-note title: the vendor's game version is
 * X.YY (2.02 today) and its separate Battle Version is 5.02, so these are very
 * likely BATTLE versions, and a token that appears in no source may not be
 * minted as a patch (scripts/seasons.ts, "never invent a version"). What they
 * ARE is a free cross-check on date-derived attribution: report.md prints the
 * token mix per channel and, as a stated HYPOTHESIS rather than a gate, how
 * often the token equals the Battle Version of the date-derived patch, how
 * often the game version, both, or neither.
 *
 * FIRST MEASUREMENT, 2026-09-09 (the first real parse, 16,408 records): the
 * hypothesis is half right, and the half is decided by the major. ggstHq's
 * "5.x" tokens equal the date-derived BATTLE version on 248 records and its
 * "2.0"/"2.1" tokens equal the date-derived GAME version on 289 — the channel
 * writes whichever space it feels like, and the token's own major says which
 * (Battle Versions are 5.x today, game versions 2.x); 82 agreed with neither.
 * ggstBattleCollection's glued "GGST2.0" is stale decoration exactly as
 * predicted: 204 of 281 match neither space on their date. So a future gate
 * can trust a 5.x token as a Battle Version and must ignore the glued 2.0;
 * neither is built yet, and the columns keep measuring.
 */
const VERSION_TOKEN = /^\s*(?:Guilty\s*Gear\s*-?\s*Strive\s*-?|GGST)\s*(\d+\.\d+)(?![\d.])/iu;

/**
 * A per-character LEADERBOARD POSITION in front of a character name. Six
 * measured spellings across four channels — "#1 Ranked" (ggHighLevel,
 * guiltyGearVods), "TOP Ranked" (ggHighLevel), "Rank 1st" / "Rank 7th" /
 * "Rank TOP" (ggstBattleCollection), "HIGH RANK" (ggstHighRank's bracket-less
 * shape) — plus the bare leading "#2 " ggstHighRank writes before the character
 * and "Day 1" from channels.ts's own ggHighLevel note. CotW's regex covered
 * only the first. A BARE leading "TOP" is the seventh spelling, found on the
 * first real run: ggstHighRank's archive shape writes "vs TOP JACK-O Daimster"
 * on the second side, and with it unstripped the fighter span no longer sat at
 * the start of the segment, so 142 sides of a chars-outside channel were filed
 * handle-first-bare (2026-09-09 report). It is anchored and boundary-guarded,
 * so "Topanga (Sol)" keeps its handle.
 *
 * STRIPPED, NEVER TURNED INTO Side.rank. A leaderboard position describes one
 * character's standing that week, not the player and not the match, which is
 * why filters.rank is false (app/app.config.ts carries the argument). An
 * unstripped "Rank 1st" leaks into a handle exactly the way CotW's 118 dildil
 * records did, so report.md measures the leak: the residue gate prints any
 * rank-shaped text no strip caught, and the handle word-length table would
 * show it as a two-word bump.
 */
const RANK_PREFIX =
  /^\s*(?:#\s*\d+\s*(?:st|nd|rd|th)?\s*(?:Ranked?(?![\p{L}\p{N}]))?|TOP\s*Ranked?(?![\p{L}\p{N}])|TOP(?![\p{L}\p{N}])|Rank(?:ed)?\s*(?:#?\s*\d+\s*(?:st|nd|rd|th)?|TOP)(?![\p{L}\p{N}])|HIGH\s*RANK(?:ED)?(?![\p{L}\p{N}])|Day\s*\d+(?![\p{L}\p{N}]))\s*/iu;

/** The `vs` separator, in every spelling the corpus uses. A closing bracket is
 *  a valid left boundary: yumegiwa writes "）VS " with no whitespace, and a
 *  `\svs\s` split scored 0.1% there (recon/channels-live.md §2, channel 6). The
 *  fullwidth "ＶＳ" is already ASCII by the time this runs (normalizeText). */
const VS = /(?<![\p{L}\p{N}])(?:vs\.?|versus|×)(?![\p{L}\p{N}])/giu;

/**
 * Bracket groups, matched BY TYPE — never a generic "any bracket".
 *
 *   round      ( … )  with ONE level of nesting: "(Tsuku (PS5))", ggstHighRank
 *   fullwidth  （ … ） yumegiwa. Belt-and-braces: normalizeText folds U+FF08/09
 *              to ASCII before this runs, so the branch is what keeps the
 *              parser correct if that fold is ever narrowed.
 *   square     [ … ]  ggstBattleCollection, whose handles put ROUND parens
 *              inside the square ones — "[ (ノ-_-)ノ ]", 3 of 50 sampled. A
 *              regex that matches "the outermost bracket" without telling `[`
 *              from `(` reads that inner paren as the slot. The bracket may be
 *              flush against the handle — "[ Futa Elphelt 67]" (video
 *              _F0s7UQPTAI, ggst-notes/hydration.md) — so the class is
 *              "anything but a square bracket", not "a space then text".
 * Left to right, each alternative consumes its whole group, so the inner paren
 * of a square group is never seen as a group of its own.
 */
const BRACKET = /\((?:[^()]|\([^()]*\))*\)|（[^（）]*）|\[[^[\]]*\]/gu;

const countVs = (s: string): number => {
  VS.lastIndex = 0;
  return (s.match(VS) ?? []).length;
};

/** Apply a decoration pattern, but REFUSE the edit if it empties the string or
 *  drops the last `vs`. A strip that removes the matchup is never right, and
 *  the failure it causes is silent. Repeated until stable: a title can end in
 *  a glyph AND a house-style phrase. */
const strip = (s: string, re: RegExp): string => {
  let out = s;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(re, '').trim();
    if (!next || next === out) break;
    if (countVs(out) > 0 && countVs(next) === 0) break;
    out = next;
  }
  return out;
};

/** Rank/leaderboard prefixes, stripped repeatedly ("#1 Ranked" then "TOP"). */
const stripRank = (s: string): string => {
  let out = s.trim();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(RANK_PREFIX, '').trim();
    if (next === out) break;
    out = next;
  }
  return out;
};

/** Words that are decoration wherever they appear, used to stop the handle
 *  picker from choosing a house-style phrase over the player. "Floor 1" and
 *  "F5" are here because ggstLowLevel puts a LADDER TIER in the paren slot on
 *  some titles ("Testament (Floor 1)", "Johnny (F5)") — a paren that is all
 *  decoration is not a handle, and the record is an honest `no-handle`. */
const DECOR_WORDS =
  /^(?:high|highest|level|gameplay|match|matches|replay|replays|ranked|ranking|rank|online|offline|guilty|gear|strive|ggst|ggs|season|ver|version|floor|iron|celestial|f\d+|ft\d+|hd|4k|1080p|60fps|new|full|best|top|pro|vs|and|ft|feat|old|day|jpn|on|line|tournament|shorts|short|perfect|round|lab|combo|combos|ps\d|pc|steam|switch|xbox|\d{1,4}|no\d*|\d+(?:st|nd|rd|th))$/i;

/**
 * True when nothing in `s` could be somebody's name. Tokens are stripped to
 * their letters and digits first, so "(", "F/2" and "FT10)" are judged on "",
 * "f2" and "ft10" rather than on their punctuation.
 *
 * TWO STRICTNESSES, BECAUSE THE CANDIDATE'S ORIGIN DECIDES WHAT A SHORT TOKEN
 * MEANS. A `structural` candidate came from the slot the channel's grammar
 * reserves for the handle — inside the bracket on a chars-outside channel, the
 * whole outside on a handle-outside one — and there a one-character or
 * all-digit token IS the player: "9" (WIP|9, 12 titles across three
 * channels), "808", "210", "C", "a", "N M R", all refused as decoration on the
 * 2026-09-09 run. A GAP candidate is whatever a roster span did not cover on a
 * bare side, where a stray letter or number is far more often debris
 * ("Floor 1", the "2" of a floor tier, a dropped bracket), so it keeps CotW's
 * rule: at least one token of two or more characters that is not decoration.
 * Both refuse a phrase that is nothing but decoration words — "(OLD)",
 * "(PS5)", "(Floor 1)", "(F5)" — which is what keeps a ladder tier or an
 * archive note from minting a player.
 */
const isDecorPhrase = (s: string, structural: boolean): boolean => {
  const words = s
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return true;
  if (structural) {
    if (words.length === 1 && /^\d+$/u.test(words[0] ?? '')) return false;
    return !words.some((w) => !DECOR_WORDS.test(w));
  }
  return !words.some((w) => w.length >= 2 && !DECOR_WORDS.test(w));
};

/** A trailing parenthetical NOTE inside a handle — "Tsuku (PS5)" — dropped
 *  when something is left. "(ノ-_-)ノ" ends in ノ, not ")", and survives. */
const NOTE_TAIL = /\s*\([^()]*\)\s*$/u;

/** Bracket pairs an uploader can leave half-typed. */
const BRACKET_PAIRS: [string, string][] = [
  ['(', ')'],
  ['[', ']'],
  ['「', '」'],
  ['『', '』'],
  ['【', '】'],
];
const countChar = (s: string, c: string): number => s.split(c).length - 1;

/**
 * Drop a bracket at either EDGE of a handle that has no partner inside it.
 * Measured on the 2026-09-09 run: "Hotashi )" from "Hotashi (Nagoriyuki))",
 * "薄いヴェノム(" from a doubled "((Venom ヴェノム)", "(FuryGR」)" with a
 * Japanese close-quote for a paren, "[ TAKASHI/タカシ" from a bracket never
 * closed. Only unmatched edge brackets go: "(ノ-_-)ノ" is balanced and keeps
 * both, and a bracket in the middle of a handle is left where the uploader put
 * it. CotW trimmed every bracket and broke every title ending in one; this
 * counts first.
 */
const stripUnmatchedEdges = (s: string): string => {
  let out = s.trim();
  for (let i = 0; i < 4; i++) {
    const before = out;
    for (const [open, close] of BRACKET_PAIRS) {
      const opens = countChar(out, open);
      const closes = countChar(out, close);
      if (opens > closes && out.endsWith(open)) out = out.slice(0, -1).trim();
      else if (opens > closes && out.startsWith(open)) out = out.slice(1).trim();
      if (closes > opens && out.startsWith(close)) out = out.slice(1).trim();
      else if (closes > opens && out.endsWith(close)) out = out.slice(0, -1).trim();
      // A handle WRAPPED in Japanese quotes — "「Kagero」" — is the name inside.
      if (out.startsWith(open) && out.endsWith(close) && open !== '(' && open !== '[') {
        const inner = out.slice(1, -1).trim();
        if (inner && countChar(inner, open) === 0 && countChar(inner, close) === 0) out = inner;
      }
    }
    // The same for ASCII double quotes — `[ "Nanachi" ]`.
    if (out.length > 2 && out.startsWith('"') && out.endsWith('"') && countChar(out, '"') === 2) {
      out = out.slice(1, -1).trim();
    }
    if (out === before) break;
  }
  return out;
};

/**
 * Clean one handle candidate. Sponsor prefixes ("SKB | Mafurako",
 * "GGA | Kaelus" — ggstHighRank writes them INSIDE the paren) are stripped by
 * channels.ts's repeated stripTheaterSponsor, never split: "|" is not a duo
 * delimiter on this game and there is NO playerSep (channels.ts).
 *
 * "/" is trimmed at the EDGES only: "sdytko /アクセル" and "/ アクセス [" are
 * leaks of a bilingual echo, while "TAKASHI/タカシ" and "ttv/pedrito_ky" are
 * handles the corpus really contains (channels.ts, the no-playerSep note).
 */
const cleanHandle = (s: string): string => {
  const base = stripUnmatchedEdges(
    stripTheaterSponsor(normalizeText(s))
      .replace(DECOR_GLYPHS, ' ')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.\-–—:!,/]+|[\s.\-–—:!,/]+$/g, '')
      .trim(),
  );
  const noted = base.replace(NOTE_TAIL, '').trim();
  return noted || base;
};

/**
 * Pick a handle from candidate fragments — the ONE place a handle is chosen.
 * A HANDLE THAT IS ENTIRELY DECORATION IS NOT A HANDLE (CotW's 118
 * "show Match (" players), and neither is a PLACEHOLDER: the catalogue's
 * `Unknown Player` / `GG Player` family is refused through the same predicate
 * the intake and the witness use (crosscheck.ts isPlaceholderHandle), so a
 * title that ever copies that spelling cannot mint the player the catalogue
 * declined to name. Longest surviving candidate wins. `structural` says the
 * candidates came from the grammar's handle slot — see isDecorPhrase.
 */
const pickHandle = (
  candidates: string[],
  structural: boolean,
): { handle: string; placeholder: boolean } => {
  const cleaned = candidates.map(cleanHandle).filter(Boolean);
  const handle =
    cleaned
      .filter(
        (c) =>
          !isDecorPhrase(c, structural) &&
          !isPlaceholderHandle(c) &&
          c.split(/\s+/).length <= MAX_HANDLE_WORDS,
      )
      .sort((a, b) => b.length - a.length)[0] ?? '';
  // `placeholder` is set only when the refusal DECIDED the side — a placeholder
  // beside a real candidate is not a drop, and counting it as one would
  // overstate the class report.md prints.
  return { handle, placeholder: !handle && cleaned.some(isPlaceholderHandle) };
};

/**
 * Close a bracket the uploader opened and never closed, so the bracket
 * extractor can see the slot. "SOL / ソル [ TAKASHI/タカシ" (video dVmHM8DqdwI),
 * "Axl / アクセス [ DeafHeaven" (Vb4NUrrXFx8), "Daru_I-No (I-No" (the closing
 * paren eaten by a suffix typo) — the 2026-09-09 fetch recon flagged five of
 * these on ggstBattleCollection alone, and each one otherwise falls through
 * to the bare path and mints a handle with a "[" in it. Only a SURPLUS of
 * openers is closed, at the end; a surplus of closers is left for
 * stripUnmatchedEdges.
 */
const closeOpenBrackets = (s: string): string => {
  let out = s;
  for (const [open, close] of BRACKET_PAIRS) {
    const surplus = countChar(out, open) - countChar(out, close);
    if (surplus > 0) out += close.repeat(surplus);
  }
  return out;
};

/** The text of `s` that no roster span covers, as fragments. */
const gapsAround = (s: string, matcher: AliasMatcher): string[] => {
  const t = normalizeText(s);
  const gaps: string[] = [];
  let prev = 0;
  for (const span of matcher.find(t)) {
    gaps.push(t.slice(prev, span.start));
    prev = span.end;
  }
  gaps.push(t.slice(prev));
  return gaps;
};

export interface Reading {
  handle: string;
  characters: string[];
  slotOrder: SlotOrder;
}

export interface ParsedSide extends Reading {
  /** Both spans resolved and the channel's declared order decided. */
  tieBroken: boolean;
}

export type SideMiss = 'no-char' | 'no-handle' | 'slot-ambiguous';

export type SideOutcome =
  | { ok: ParsedSide }
  /** Both spans resolved and the channel declares no usable order: BOTH
   *  readings, for the review queue. Never guessed. */
  | { ambiguous: Reading[] }
  /** `placeholder`: the only handle candidate was a catalogue placeholder
   *  ("Unknown Player") and was refused — a `no-handle` with a named cause,
   *  counted per channel. */
  | { miss: SideMiss; placeholder?: boolean };

/**
 * One side segment → handle + characters, with no positional assumption —
 * except where BOTH spans resolve, which is where the declared order breaks
 * the tie. See the header.
 */
export function parseSide(
  segment: string,
  matcher: AliasMatcher,
  declared: SlotOrder,
): SideOutcome {
  const seg = stripRank(closeOpenBrackets(normalizeText(segment)));
  const groups = [...seg.matchAll(BRACKET)].map((m) => m[0]);

  // STRUCTURED: at least one bracket group.
  if (groups.length > 0) {
    const inners = groups.map((g) => stripRank(g.slice(1, -1)));
    const outside = stripRank(seg.replace(BRACKET, ' ').replace(/\s+/g, ' ').trim());
    const resolving = inners.map((p) => matcher.ids(p)).filter((ids) => ids.length > 0);
    // MORE THAN ONE bracket resolving is ambiguous — which one names the
    // fighter? Never guessed; the caller routes it to the queue.
    if (resolving.length > 1) return { miss: 'slot-ambiguous' };

    const fromParen = resolving[0] ?? [];
    const fromOutside = matcher.ids(outside);

    if (fromParen.length > 0 && fromOutside.length > 0) {
      // BOTH RESOLVE — THE DEFECT THIS FILE EXISTS TO FIX. "Lasagna Slayer (#1
      // Ranked Venom)", "NAGORIYUKI (SOL mugi)", "UNIKA / ユニカ [ ユニカ ]",
      // "Johnny (Johnny)". The first resolving span is a coin flip, so the
      // channel's DECLARED order decides, and only here.
      const outsideHandle = pickHandle([outside], true);
      const innerHandle = pickHandle(inners, true);
      const readings: Reading[] = [
        { handle: outsideHandle.handle, characters: fromParen, slotOrder: 'handle-outside' },
        { handle: innerHandle.handle, characters: fromOutside, slotOrder: 'chars-outside' },
      ];
      const pick =
        declared === 'handle-outside'
          ? readings[0]
          : declared === 'chars-outside'
            ? readings[1]
            : undefined;
      // 'handle-first-bare' and 'chars-only' say nothing about which SLOT of a
      // bracketed segment holds the fighter, so they cannot break this tie.
      if (!pick) return { ambiguous: readings };
      if (!pick.handle) {
        return {
          miss: 'no-handle',
          placeholder: (pick === readings[0] ? outsideHandle : innerHandle).placeholder,
        };
      }
      return { ok: { ...pick, tieBroken: true } };
    }

    if (fromParen.length > 0) {
      // Exactly the bracket resolves: the handle is everything outside it.
      const { handle, placeholder } = pickHandle([outside], true);
      if (!handle) return { miss: 'no-handle', placeholder };
      return {
        ok: { handle, characters: fromParen, slotOrder: 'handle-outside', tieBroken: false },
      };
    }

    if (fromOutside.length > 0) {
      // Exactly the outside resolves. On a chars-outside channel the bracket
      // holds the handle ("#1 VENOM (Papaya)"); on a bare-grammar channel a
      // bracket that does not resolve is usually a NOTE — "(OLD)", "(PS5)",
      // "(Floor 1)" — and the handle is the outside text the roster span did
      // not cover. Both are tried; the declared order only decides which is
      // tried FIRST, so a handle-outside title whose bracket happens to hold
      // the handle still resolves, and a chars-outside title whose bracket is
      // a note still resolves.
      //
      // EXCEPT on a handle-outside channel when the bracket holds a NAME. There
      // the grammar says the bracket IS the fighter, so a name-shaped bracket
      // the roster cannot read is a fighter the roster cannot read — a typo,
      // or a DLC arrival — and the resolving outside is a fighter-named
      // HANDLE. "Zato_VaN (Azuka)" (video …, guiltyGearReplays, 2026-09-09 run)
      // read as the player "_VaN" on Zato until this branch; it is an honest
      // `no-char` that reaches the review queue with the handle attached, and
      // "Azuka" surfaces in the residue table as the alias it is. A bracket
      // that is only decoration still takes the note path.
      if (declared === 'handle-outside' && inners.some((i) => !isDecorPhrase(i, true))) {
        return { miss: 'no-char' };
      }
      const fromInner = pickHandle(inners, true);
      const fromGaps = pickHandle(gapsAround(outside, matcher), false);
      const order: [string, SlotOrder][] =
        declared === 'chars-outside'
          ? [
              [fromInner.handle, 'chars-outside'],
              [fromGaps.handle, 'handle-first-bare'],
            ]
          : [
              [fromGaps.handle, 'handle-first-bare'],
              [fromInner.handle, 'chars-outside'],
            ];
      const hit = order.find(([h]) => h);
      if (!hit)
        return { miss: 'no-handle', placeholder: fromInner.placeholder || fromGaps.placeholder };
      return {
        ok: { handle: hit[0], characters: fromOutside, slotOrder: hit[1], tieBroken: false },
      };
    }
    return { miss: 'no-char' };
  }

  // BARE: no brackets at all — ggstHq's "Seisei Happy Chaos", ggstLowLevel's
  // "Chipp vs Nagoriyuki", the ggstHighRank archive shape. The roster spans are
  // the boundary; the gaps are the handle.
  //
  const spans = matcher.find(seg);
  const first = spans[0];
  if (!first) return { miss: 'no-char' };
  const ids: string[] = [];
  for (const s of spans) if (!ids.includes(s.id)) ids.push(s.id);

  // TWO OR MORE SPANS ON ONE BARE SIDE: a counter-pick, a bilingual echo, or a
  // handle that contains a fighter's name. Which one depends on the channel's
  // grammar, and this is the bare-path twin of the bracketed tie above — the
  // declared order is consulted only where two readings exist, and it is
  // counted as tie-broken for the same drift signal.
  //
  //   · 'chars-outside' with the fighter FIRST — ggstHighRank's bracket-less
  //     archive shape: "#2 MAY Venom Snake", "HIGH RANK ASUKA Zato-VaN",
  //     "#2 ZATO Zato_VaN" (recon/channels-live.md §2, channel 3, which counted
  //     5; the 2026-09-09 fetch recon flags 354 titles of that shape, so it is
  //     the channel's whole first year, not a footnote). The declared order
  //     says the first span is the fighter and EVERYTHING after it is the
  //     handle, fighter name included. The union read those as "Snake" on
  //     May+Venom and "VaN" on Asuka+Zato — wrong on both slots, and the second
  //     one hides a confirmed fighter-named player (roster.ts zato-van) from the
  //     registry guard. The one thing the rest may NOT be is an echo of the
  //     same fighter with nothing else in it — "SOL / ソル" on a bracket-less
  //     ggstBattleCollection title — which is what the gap test below refuses:
  //     if the rest holds no handle-shaped text outside its roster spans there
  //     is no player named, and the side is an honest `no-handle`.
  //   · 'handle-first-bare' (ggstHq): the union, and NOT the declared order.
  //     Measured: 55 titles list two characters on a side ("Mettalica Ram
  //     Slayer") against 2 whose handle contains a fighter's name ("Lasagna
  //     Slayer Venom"). The union is right 27 times in 28; the 2 are a known,
  //     counted residual that reads as a counter-pick with a one-word handle
  //     and cannot be told apart without a second source. The registry
  //     invariant does not catch them either — "Lasagna" is not a fighter.
  if (spans.length > 1 && declared === 'chars-outside' && first.start === 0) {
    const rest = seg.slice(first.end);
    const restGaps = pickHandle(gapsAround(rest, matcher), false);
    if (!restGaps.handle) return { miss: 'no-handle', placeholder: restGaps.placeholder };
    const { handle, placeholder } = pickHandle([rest], true);
    if (!handle) return { miss: 'no-handle', placeholder };
    return { ok: { handle, characters: [first.id], slotOrder: 'chars-outside', tieBroken: true } };
  }

  const { handle, placeholder } = pickHandle(gapsAround(seg, matcher), false);
  if (!handle) return { miss: 'no-handle', placeholder };
  // Which side of the character the handle sat on — telemetry. The SlotOrder
  // union has no "character first, no bracket" member, so "Zato Brian" (ggstHq
  // #23, side 2 written character-first) is filed under 'chars-outside': the
  // character is outside and first, the handle follows. It shows up in
  // report.md's mix as a chars-outside share on a handle-first-bare channel,
  // which is exactly the drift signal the mix is printed for.
  const order: SlotOrder = first.start === 0 ? 'chars-outside' : 'handle-first-bare';
  return { ok: { handle, characters: ids, slotOrder: order, tieBroken: false } };
}

export type MissKind =
  | 'no-marker'
  | 'before-floor'
  | 'live'
  | 'too-short'
  | 'no-vs'
  | 'vs-count'
  | 'no-char'
  | 'no-handle'
  | 'slot-ambiguous';

export interface ParseOutcome {
  ok?: [ParsedSide, ParsedSide];
  miss?: MissKind;
  /** For 'slot-ambiguous' from a both-resolve tie with no declared order: the
   *  side(s) and their readings, for the review queue. */
  ambiguous?: { side: 0 | 1; readings: Reading[] }[];
  /** A side was dropped because its only handle was a placeholder. */
  placeholder?: boolean;
  /** The version token the title opened with, if any. Counted, never a patch. */
  versionToken?: string;
}

/** Title → two sides, or a named miss. Pure; the caller owns policy. */
export function parseTitle(
  rawTitle: string,
  matcher: AliasMatcher,
  declared: SlotOrder,
): ParseOutcome {
  let t = normalizeText(stripHashtagRun(rawTitle));
  const versionToken = VERSION_TOKEN.exec(t)?.[1];
  const tag = (o: ParseOutcome): ParseOutcome => (versionToken ? { ...o, versionToken } : o);
  // Hashtags anywhere, AFTER the marker gate has had its look at the title
  // (the caller ran hasStriveMarker on the raw title) — see HASHTAG_TOKEN.
  t = t.replace(HASHTAG_TOKEN, ' ').replace(/\s+/g, ' ').trim();
  t = strip(t, DECOR_PREFIX); // PREFIX FIRST — see the note above DECOR_PREFIX
  t = strip(t, DECOR_SUFFIX);

  VS.lastIndex = 0;
  const parts = t
    .split(VS)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // No `vs` at all. This is also where the 23-title "third grammar" lands
  // ("GGST 5.2 Gobou Robo Ky ProtoChan Slayer", the separator simply dropped)
  // — 0.7% of misses on the recon, not a family worth a branch. It is visible
  // in the per-channel rejects rather than recovered.
  if (parts.length < 2) return tag({ miss: 'no-vs' });
  if (parts.length > 2) return tag({ miss: 'vs-count' });

  const [left, right] = parts as [string, string];
  const sides = [parseSide(left, matcher, declared), parseSide(right, matcher, declared)];
  const ambiguous = sides.flatMap((s, i) =>
    'ambiguous' in s ? [{ side: i as 0 | 1, readings: s.ambiguous }] : [],
  );
  if (ambiguous.length) return tag({ miss: 'slot-ambiguous', ambiguous });
  const misses = sides.flatMap((s) => ('miss' in s ? [s] : []));
  if (misses.length) {
    const kinds = misses.map((m) => m.miss);
    const kind: MissKind = kinds.includes('slot-ambiguous')
      ? 'slot-ambiguous'
      : kinds.includes('no-char')
        ? 'no-char'
        : 'no-handle';
    const placeholder = misses.some((m) => m.placeholder === true);
    return tag(placeholder ? { miss: kind, placeholder: true } : { miss: kind });
  }
  const [a, b] = sides as [{ ok: ParsedSide }, { ok: ParsedSide }];
  return tag({ ok: [a.ok, b.ok] });
}

// ── stale-raw guard (DATA ONLY — no filesystem metadata) ────────────────────
//
// Ported from Tōkon via CotW, which learned it twice. Wall-clock age was a
// proxy and leaked; mtime was a proxy and leaked the same way, because `cp`,
// `git checkout` and a fresh clone all stamp a months-old dump as new
// (checklist 10c).
//
// THE TEST READS ONLY DATA. A dump cannot contain an upload published after it
// was taken, so if the committed corpus holds a record for this intake NEWER
// than the newest upload anywhere in the dump, that record cannot have come
// from this dump and parsing would drop it. Both sides are publish timestamps
// written by YouTube and carried in the files themselves.
//
// THE THEATER DUMP IS EXEMPT, by construction rather than by exception: this
// runs only over title channels. A cursor-mode index dump is a legitimately
// thin slice of the catalogue (theater-delta.ts) and the add-only merge in
// parse-finish.ts is what protects that intake.
function assertRawIsFresh(id: ChannelKey, dump: RawVideoRecord[], committed: MatchVideo[]): void {
  let newestInDump = '';
  for (const r of dump) if (r.publishedAt > newestInDump) newestInDump = r.publishedAt;
  if (!newestInDump) return;

  let newestCommitted: MatchVideo | undefined;
  for (const v of committed) {
    if (v.intake !== id) continue;
    if (!newestCommitted || v.publishedAt > newestCommitted.publishedAt) newestCommitted = v;
  }
  if (!newestCommitted) return;
  if (newestCommitted.publishedAt <= newestInDump) return;

  throw new Error(
    [
      `raw/${id}.json is stale: the committed corpus holds an upload it cannot contain.`,
      ``,
      `  newest upload in the dump   ${newestInDump}`,
      `  newest committed record     ${newestCommitted.publishedAt}  ${newestCommitted.id}`,
      ``,
      `  A dump cannot contain an upload published after it was taken, so parsing`,
      `  now would drop that record and every one like it — and the next run would`,
      `  treat the smaller archive as the new baseline.`,
      ``,
      `  Refresh first:  npm run data:fetch`,
    ].join('\n'),
  );
}

const readJson = async <T>(name: string, fallback: T): Promise<T> => {
  const p = join(DATA, name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(await readFile(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

/** NOT readJson: its catch-all fallback is wrong for this one file. `committed`
 *  is the baseline for the freeze carry, the index intake's add-only merge AND
 *  the collapse guard, so a truncated videos.json silently becoming [] would
 *  carry nothing, leave the add-only merge with nothing to preserve, and disarm
 *  the guard for every channel at once (`before > 0` false everywhere) — a
 *  total loss with every gate green. Absent is fine and means a first run;
 *  unreadable is a hard stop. */
async function readCommitted(): Promise<MatchVideo[]> {
  const p = join(DATA, 'videos.json');
  if (!existsSync(p)) return [];
  const text = await readFile(p, 'utf8');
  try {
    const v = JSON.parse(text) as MatchVideo[];
    if (!Array.isArray(v)) throw new Error('not an array');
    return v;
  } catch (err) {
    throw new Error('data/videos.json exists but will not parse — refusing to treat it as empty.', {
      cause: err,
    });
  }
}

/** Duration buckets for the histogram the floor is re-derived from. The
 *  boundaries bracket 120 on both sides and put ggstHq's 30 on its own edge. */
export const DURATION_BUCKETS = [
  ['0 (live/unknown)', 0, 1],
  ['1–29s', 1, 30],
  ['30–59s', 30, 60],
  ['60–119s', 60, 120],
  ['120–179s', 120, 180],
  ['180–299s', 180, 300],
  ['300–599s', 300, 600],
  ['600–1799s', 600, 1800],
  ['1800s+', 1800, Infinity],
] as const;

export const durationBucket = (sec: number): string =>
  DURATION_BUCKETS.find(([, lo, hi]) => sec >= lo && sec < hi)?.[0] ?? '1800s+';

const emptyTally = (floorSec: number): ChannelTally => ({
  raw: 0,
  marked: 0,
  parsed: 0,
  excluded: 0,
  floorSec,
  misses: {},
  placeholderHandles: 0,
  slot: { 'handle-outside': 0, 'chars-outside': 0, 'handle-first-bare': 0, 'chars-only': 0 },
  tieBroken: 0,
  versionTokens: {},
  versionAgree: { battle: 0, game: 0, both: 0, neither: 0, unknown: 0 },
  rejects: [],
  rejectCount: 0,
});

const emptyHistogram = (): DurationHistogram => ({
  records: {},
  matchShapedMisses: {},
  otherMisses: {},
});

const bump = (m: Record<string, number>, k: string, n = 1): void => {
  m[k] = (m[k] ?? 0) + n;
};

/** "5.02" (a PatchBoundary.battleVersion or version) and "5.2" (a title
 *  token) name the same thing iff major and minor agree numerically. */
const sameVersion = (a: string, b: string): boolean => {
  const [am, an] = a.split('.').map(Number);
  const [bm, bn] = b.split('.').map(Number);
  return am === bm && an === bn;
};

async function main(): Promise<void> {
  await mkdir(DATA, { recursive: true });
  const characters = await loadCharacters();
  const matcher = buildAliasMatcher(characters);
  const overrides = await readJson<Record<string, VideoOverride>>('overrides.json', {});
  const committed = await readCommitted();
  const pins = await readJson<SourcePins>('source-pins.json', {});
  const windows = patchWindows();

  const built: MatchVideo[] = [];
  const frozenBuilt = new Map<ChannelKey, MatchVideo[]>();
  const residue = new Map<string, number>();
  const queue: ReviewQueueItem[] = [];
  const perChannel = new Map<ChannelKey, ChannelTally>();
  const rawSeen = new Map<string, string>();
  const durations = new Map<ChannelKey, DurationHistogram>();
  const handleWords: Record<string, number> = {};

  // ── title-parsed channels ────────────────────────────────────────────────
  // Every YouTube channel, frozen included. A frozen channel normally has no
  // dump (fetch skips it) and is carried by parse-finish; when a dump IS
  // present it can only have come from `data:fetch --include-frozen`, which is
  // the freeze-pin seeding path, and parse-finish asserts the parse against
  // the pin instead of the committed count.
  for (const ch of CHANNELS.filter((c) => !c.index)) {
    const floorSec = ch.minDurationSec ?? MIN_MATCH_SEC;
    const file = join(RAW, `${ch.id}.json`);
    if (!existsSync(file)) {
      if (ch.frozen) continue;
      console.warn(`  ⚠ raw/${ch.id}.json missing — skipping (run \`npm run data:fetch\`)`);
      perChannel.set(ch.id, emptyTally(floorSec));
      continue;
    }
    const dump = JSON.parse(await readFile(file, 'utf8')) as RawVideoRecord[];
    if (dump.length === 0) throw new Error(`raw/${ch.id}.json is empty — refusing to parse.`);
    assertRawIsFresh(ch.id, dump, committed);

    const tally = emptyTally(floorSec);
    const hist = emptyHistogram();
    tally.raw = dump.length;
    const floor = ch.preReleaseFrom ?? LAUNCH;
    const out: MatchVideo[] = [];
    for (const v of dump) {
      rawSeen.set(v.id, `raw/${ch.id}.json`);
      const ov = overrides[v.id];
      if (ov?.exclude) {
        tally.excluded++;
        continue;
      }

      // THE MARKER GATE, FIRST, TITLE ONLY. striveSignal is 'title' on every
      // intake (types/index.ts): the one multi-game channel writes the game as
      // a token in every title, so no description is read anywhere.
      if (!hasStriveMarker(v.title)) {
        bump(tally.misses, 'no-marker');
        continue;
      }
      tally.marked++;
      const day = v.publishedAt.slice(0, 10);
      if (day < floor) {
        bump(tally.misses, 'before-floor');
        bump(hist.otherMisses, durationBucket(v.durationSec));
        continue;
      }
      // `live` is a CLASS, not a gate worth building around: 1 upload in
      // 18,509 (an ggstHq restream, ggst-notes/hydration.md). `gone` is not a
      // class at all — an uploads-playlist walk cannot return a deleted video,
      // and the hydration pass measured 0 of 18,509 — so there is no column
      // for it and nothing here to count.
      if (v.liveBroadcastContent !== 'none') {
        bump(tally.misses, 'live');
        bump(hist.otherMisses, durationBucket(v.durationSec));
        continue;
      }

      // Parsed BEFORE the duration floor is applied, so a too-short upload is
      // still classified as match-shaped or not: that split is what the
      // duration histogram needs to keep the floor a measured number rather
      // than an inherited one.
      const out2 = parseTitle(v.title, matcher, ch.slotOrder);
      if (out2.versionToken) bump(tally.versionTokens, out2.versionToken);

      if (v.durationSec && v.durationSec < floorSec) {
        bump(tally.misses, 'too-short');
        bump(out2.ok ? hist.matchShapedMisses : hist.otherMisses, durationBucket(v.durationSec));
        continue;
      }

      if (!out2.ok) {
        const kind = out2.miss ?? 'no-char';
        bump(tally.misses, kind);
        bump(hist.otherMisses, durationBucket(v.durationSec));
        // PLACEHOLDER HANDLES NEVER MINT A PLAYER — the catalogue's `Unknown
        // Player` family (645 side appearances, recon/replay-theater-live.md
        // §8.5) refused here through the same predicate the index intake and
        // the witness use (crosscheck.ts isPlaceholderHandle). Counted per
        // channel so a title channel that starts copying the spelling shows
        // up as a number rather than as a quieter `no-handle` column.
        if (out2.placeholder) tally.placeholderHandles++;
        const r = matcher.residue(
          strip(strip(normalizeText(stripHashtagRun(v.title)), DECOR_PREFIX), DECOR_SUFFIX),
        );
        if (r) residue.set(r, (residue.get(r) ?? 0) + 1);
        // THE REJECT PRINTER'S PRECISE HALF (checklist 5e): a miss that names a
        // roster character is match-shaped content the parser could not read,
        // and a new grammar variant lives there. Counted per channel, sampled
        // into report.md.
        if (matcher.ids(v.title).length > 0) {
          tally.rejectCount++;
          if (tally.rejects.length < 10) tally.rejects.push({ id: v.id, title: v.title, kind });
        }
        // Match-shaped footage the parser could not complete goes to a human,
        // never to a guess.
        if (kind === 'no-char' || kind === 'slot-ambiguous') {
          queue.push({
            id: v.id,
            kind: kind === 'no-char' ? 'character-completion' : 'slot-ambiguous',
            channel: ch.id,
            title: v.title,
            publishedAt: v.publishedAt,
            durationSec: v.durationSec,
            ...(out2.ambiguous
              ? {
                  readings: out2.ambiguous.flatMap((a) =>
                    a.readings.map((r) => ({ handle: r.handle, characters: r.characters })),
                  ),
                }
              : {}),
          });
        }
        continue;
      }

      const sides = out2.ok.map<MatchSide>((s) => {
        const provenance: CharProvenance = {
          tier: 'title',
          tiers: ['title'],
          fromTitle: s.characters,
          slotOrder: s.slotOrder,
          ...(s.tieBroken ? { tieBroken: true } : {}),
          complete: s.characters.length >= 1,
        };
        return {
          player: playerId(s.handle),
          handle: s.handle,
          characters: s.characters,
          provenance,
        };
      });
      // `!playerId(h)` on the SLUG, not the handle: an all-CJK handle is a fine
      // string and slugs through roster.ts's non-Latin fallback; only pure
      // punctuation returns "" and is refused here (roster.ts playerId).
      if (sides.some((s) => !s.player || s.characters.length === 0)) {
        bump(tally.misses, 'no-handle');
        bump(hist.otherMisses, durationBucket(v.durationSec));
        continue;
      }
      for (const s of out2.ok) {
        bump(tally.slot, s.slotOrder);
        if (s.tieBroken) tally.tieBroken++;
        bump(handleWords, String(s.handle.split(/\s+/).length));
      }

      const season = seasonForDate(day);
      const w = patchForDate(day, windows);
      const patch = w && w.season === season ? w.version : seasonToken(season);
      // The version-token HYPOTHESIS (see VERSION_TOKEN): which of the two
      // version spaces does the title's token agree with on this date?
      if (out2.versionToken) {
        if (!w) tally.versionAgree.unknown++;
        else {
          const battle = !!w.battleVersion && sameVersion(w.battleVersion, out2.versionToken);
          const game = sameVersion(w.version, out2.versionToken);
          if (battle && game) tally.versionAgree.both++;
          else if (battle) tally.versionAgree.battle++;
          else if (game) tally.versionAgree.game++;
          else tally.versionAgree.neither++;
        }
      }

      tally.parsed++;
      bump(hist.records, durationBucket(v.durationSec));
      const [s0, s1] = sides as [MatchSide, MatchSide];
      out.push({
        id: v.id,
        channel: ch.source,
        intake: ch.id,
        title: normalizeText(v.title),
        publishedAt: v.publishedAt,
        durationSec: v.durationSec,
        ...(v.viewCount ? { viewCount: v.viewCount } : {}),
        season,
        patch,
        sides: [s0, s1],
      });
    }
    perChannel.set(ch.id, tally);
    durations.set(ch.id, hist);
    if (ch.frozen) frozenBuilt.set(ch.id, out);
    else built.push(...out);
  }

  // ── --seed-freeze-pins: print, refuse to write ───────────────────────────
  if (SEED_FREEZE_PINS) {
    const frozen = CHANNELS.filter((c) => c.frozen);
    if (frozenBuilt.size === 0) {
      console.error(
        `✖ --seed-freeze-pins found no frozen dump. Fetch one first:\n` +
          frozen.map((c) => `    npm run data:fetch -- --only=${c.id} --include-frozen`).join('\n'),
      );
      process.exit(1);
    }
    console.log('▶ freeze-pin seeding — DRY RUN, nothing written\n');
    for (const [id, rs] of frozenBuilt) {
      const t = perChannel.get(id) ?? emptyTally(MIN_MATCH_SEC);
      const missLine = Object.entries(t.misses)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join(' · ');
      console.log(
        `  ${id}: ${t.raw} raw · ${t.marked} marked · ${rs.length} parsed\n` +
          `    misses: ${missLine || 'none'}\n` +
          `    → set \`frozen.records: ${rs.length}\` on ${id} in scripts/channels.ts, then run\n` +
          `      \`npm run data:parse\` with raw/${id}.json still in place. That run asserts the\n` +
          `      parse against the pin and writes the records; every later run carries them.`,
      );
    }
    return;
  }

  console.log(
    `▶ title parse: ${built.length} record(s) from ${perChannel.size} channel(s)` +
      (frozenBuilt.size ? ` + ${[...frozenBuilt.keys()].join(', ')} from a frozen dump` : ''),
  );
  await writeReportAndData({
    built,
    frozenBuilt,
    committed,
    overrides,
    pins,
    residue,
    queue,
    perChannel,
    rawSeen,
    durations,
    handleWords,
    matcher,
    characters,
  });
}

// isMain, not a bare call: parseTitle/parseSide are exported so a control can
// exercise the orientation logic without running the pipeline (roster.ts and
// seasons.ts guard their entry points the same way).
const entry = process.argv[1];
const isMain = !!entry && import.meta.url.endsWith(entry.split('/').pop() ?? '');
if (isMain) main();
