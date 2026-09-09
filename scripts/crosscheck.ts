// THE SECOND WITNESS, as a pure predicate.
//
// WHAT THIS MEASURES, and why it is worth a file. Replay Theater's Strive
// catalogue is two arms of one publisher: 7,184 TAGGED tournament segments and
// 14,760 UNTAGGED rows that are, almost entirely, one entry per whole video of
// online play (recon/replay-theater-live.md §2, measured 2026-09-07 over all
// 21,944 entries). Unlike every sibling, the untagged arm is ADMITTED here as a
// source (channels.ts `admitUntagged`) — but on the rows where it overlaps a
// tracked channel it is not a source at all, because the known-anywhere ignore
// in parse drops it: 11,604 untagged rows / 11,599 videos point at an upload
// this repo already parses from a tracked channel (recon §5), the largest such
// set on the platform by 5.1× over CotW's.
//
// Out of ingestion scope is not out of scope as EVIDENCE. Each of those rows is
// a second human reading of the same match: somebody typed two handles and two
// characters into a form, and our parser read them out of the uploader's title.
//
// AND ON THIS GAME THE INDEPENDENCE CLAIM HAS TO BE QUALIFIED, in the report
// and not just here. On 11,288 of the 11,605 overlapping rows (97.27%) the
// catalogue's upload_date equals the VOD's own publishedAt — median delta 0
// days, 99.39% within ±1. The submitter most likely read the same title our
// parser did, the same day. That makes this a NEAR-DEPENDENT witness on the
// overlap (CotW documented the same shape at 98.7%), so agreement is a
// consistency check on two readers of one title rather than verification
// against the footage. Disagreement is still fully informative: two readers of
// one title who differ have found a title that at least one of them misread.
//
// IT PRODUCES NO FIELD AND OVERWRITES NOTHING. A disagreement is written to
// data/theater-disagreements.json with both claims side by side; it never edits
// a record, never outranks a confident parse, and never outranks a human
// override. RT is a witness, not an authority — the same posture the intake
// already takes when it resolves characters on an exact alias only and drops the
// rest to residue.
//
// NOT data/review-queue.json, deliberately. In this repo that queue means
// WITHHELD — pending items never reach videos.json — and a contested row is a
// record we have already published and are not proposing to unpublish on a
// third party's say-so.
//
// THE THIRD OUTCOME IS THE POINT. agree / disagree is not enough, because a
// witness that CANNOT REPRESENT the answer is not disagreeing with it. The
// catalogue's schema is lossier than ours in ways that differ per game — it caps
// a 2XKO side at two champions, and its Tekken vocabulary has no Armor King at
// all — so scoring those as disagreements would contest hundreds of CORRECT
// records on day one and make agreement unreachable for exactly the rows a
// resolver would want to fix. Anything the catalogue could not have said is
// counted as `cannotWitness` and reported separately, in three named parts.
//
// The vocabulary gap is DERIVED FROM THE DATA, never declared (Tekken's rule,
// ported whole). Measured 2026-09-07 the Strive catalogue writes 37 distinct
// character strings — 34 canonical plus `Bedman`, `happy Chaos` and `I-no` —
// and every one resolves on the roster's alias table, so today this derives
// NOTHING here. It stays because the day a fighter merges into another upstream
// (Dizzy into Queen Dizzy is the live candidate: the catalogue writes "Queen
// Dizzy" on 448 sides and our roster carries "Dizzy" as her alias) the
// derivation reads the change instead of needing an edit.
//
// A FOURTH OUTCOME THIS GAME NEEDS AND NO SIBLING DID: the PLACEHOLDER handle.
// 645 side appearances carry `Unknown Player` (504), `GG Player` / `GG PLAYER` /
// `GG player` (86), `Honest Player` (16) and a 15-spelling tail (recon §8.5) —
// a witness that declined to name the player, not one that named a different
// one. Scored as a miss those would be ~300 spurious handle rows in an artifact
// whose whole value is that its rows are worth reading. Held out as
// `players.placeholder`; the characters on that row are still witnessed.
//
// EXACT ALIAS, NEVER FUZZY — AND EXACT MEANS THE WHOLE STRING. The catalogue
// writes `Asuka R♯` (U+266F, 994 sides), `Bedman?`, `Jack-O'`, `A.B.A`, `Zato-1`
// and `Queen Dizzy`; this repo stores `asuka-r`, `bedman`, `jack-o`, `aba`,
// `zato-1` and `queen-dizzy`. Resolving those through the roster's own matcher
// is not a nicety: on SF6 a naive lowercase-and-strip comparison reports 1,236
// disagreements of which 0 are real, and here every one of the punctuated names
// above would join them. So a catalogue string resolves only when the roster
// matcher finds EXACTLY ONE alias span and that span covers the ENTIRE
// normalised string — `matcher.one()` alone is a scan that would read "Sol
// Badguy Player" as Sol, and a witness that guesses is not a witness. Going
// through buildAliasMatcher rather than a second table means the witness and
// the parser share one vocabulary and one normalisation (normalizeText folds
// the U+3000 that sits inside one p2_name and ten tags, and the ♯).

import { normalizeText, type AliasMatcher } from './roster';
import type { MatchVideo } from '../types/index';

/** One catalogue entry, exactly as the catalogue publishes it. Everything is
 *  nullable: this is someone else's schema and we do not get to assume. */
export interface WitnessEntry {
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

/** raw/replayTheater.witness.json — SF6's envelope, written by
 *  scripts/fetch-theater.ts beside the intake dump. EVERY entry of the read
 *  window that passed the per-entry game gate, tagged and untagged, NOT
 *  cursor-gated. Nothing that reads it may build a record. */
export interface WitnessFile {
  mode?: 'cursor' | 'full';
  maxEntryId?: number;
  pagesRead?: number;
  hitBound?: boolean;
  entries?: WitnessEntry[];
}

/** One row the cross-check could not settle, carrying BOTH claims. This is what
 *  reaches data/theater-disagreements.json — never a rewritten record. */
export interface Disagreement {
  videoId: string;
  field: 'players' | 'characters';
  /** 0 or 1, in our record's side order. Absent for a whole-record player miss. */
  side?: number;
  ours: string[];
  theirs: string[];
  title: string;
}

/** A roster id the catalogue has no word for, and the id it writes instead.
 *  Derived per run — see the header. */
export interface BlindSpot {
  id: string;
  /** The id the catalogue writes in its place, on `merged` of `sides` sides. */
  mergedInto: string;
  merged: number;
  sides: number;
}

export interface CrossCheckResult {
  /** Videos where exactly one catalogue entry lines up with one of our
   *  whole-video records from a TRACKED channel. A video the catalogue has cut
   *  into several segments is excluded: those are the intake's own territory
   *  and there is no 1:1 claim to compare against. */
  compared: number;
  /** Catalogue VIDEOS we do not hold as a comparable record. Counted once per
   *  video, not per entry. Not a failure — the intake's own unique contribution
   *  lives here — but the denominator of "reach". */
  unmatched: number;
  /** Videos we hold that the catalogue indexes as several segments. */
  segmented: number;
  players: {
    both: number;
    one: number;
    neither: number;
    flipped: number;
    /** Records where a catalogue side is a placeholder handle — held out of
     *  both/one/neither. both + one + neither + placeholder === compared. */
    placeholder: number;
    /**
     * WHY THE MISSED SIDES MISSED, as three numbers instead of a page of rows.
     * Diagnostic only — nothing here scores anything, because substring
     * matching on handles is precisely the guessing this module refuses.
     *
     * `ours` = our handle CONTAINS theirs — extra text on our side, the shape a
     * rank prefix or a game token leaking into the handle slot takes.
     * `theirs` = their handle contains ours — a team tag THEATER_SPONSOR does
     * not strip yet (156 catalogue handles carry a `|`; the fullwidth `｜` and
     * a doubly-prefixed handle are already covered).
     * `unrelated` = neither contains the other. The only bucket worth reading
     * one row at a time.
     */
    handleAffix: { ours: number; theirs: number; unrelated: number };
  };
  characters: {
    sides: number;
    agree: number;
    subset: number;
    disagree: number;
    /** The sum of the three below — sides the catalogue could not have got
     *  right, so scoring them either way would be a lie. */
    cannotWitness: number;
    /** Our side names an id the catalogue has no word for. */
    blindSpot: number;
    /** The catalogue's own string resolves to no roster id, or it said nothing. */
    unreadable: number;
    /** Our side is longer than the catalogue's column count. */
    overCap: number;
  };
  /** The blind spots this run derived, for the report. */
  blindSpots: BlindSpot[];
  disagreements: Disagreement[];
}

/**
 * data/theater-disagreements.json — the committed home of everything the
 * cross-check knows, written ONLY by a full sweep.
 *
 * WHY THE MEASUREMENT IS COMMITTED RATHER THAN RECOMPUTED INTO report.md EVERY
 * RUN. The witness is rebuilt from scratch on each pull and holds only the pages
 * that pull read, so a cursor morning's window is a few hundred catalogue rows
 * and its numbers differ from yesterday's — a different WINDOW, not a different
 * corpus. Rendering those into report.md made the file change every single
 * morning whether or not any RECORD had, which defeats the cron's
 * no-change-no-commit rule from the other side and puts a deploy on the
 * calendar every day forever. It is the same failure the `_Generated` timestamp
 * line already has a suppression for, arriving through a new door — and here it
 * also defeats the cursor-only-change suppression, because that one only drops
 * the cursor when NOTHING ELSE changed.
 *
 * So: a FULL sweep measures and writes; every run renders report.md from what is
 * committed; a cursor morning prints its own reading to the console and leaves
 * the artifact alone. The block says which sweep it came from — by the
 * catalogue's own high-water entry id, which is content, not a clock.
 *
 * THE BLIND SPOTS LIVE HERE TOO: a fact about the catalogue's VOCABULARY
 * outlives the pull that found it, and a two-page morning cannot re-derive one.
 */
export interface WitnessArtifact {
  /** The reading, frozen at the last full sweep. */
  measured?: {
    /** The catalogue's high-water entry id at that sweep — names the sweep
     *  without a timestamp, so re-rendering it cannot churn the file. */
    atEntryId: number;
    compared: number;
    unmatched: number;
    segmented: number;
    players: CrossCheckResult['players'];
    characters: CrossCheckResult['characters'];
  };
  /** The last full sweep's derivation, and what a cursor run reads back as its
   *  carried set — see `carriedBlindSpots`. */
  blindSpots: BlindSpot[];
  disagreements: Disagreement[];
}

/** The YouTube id inside a catalogue link. The catalogue's submission form
 *  concatenates rather than builds — `https://youtu.be/<id>&t=554s` is a PATH
 *  with no query string, 686 of this catalogue's links — so this matches the id
 *  SHAPE explicitly and refuses anything else rather than guessing. Same regex
 *  the intake uses (scripts/fetch-theater.ts). */
const VIDEO_ID =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/(?:live|shorts|embed)\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

/**
 * A catalogue handle that names nobody. The measured family is `<one word>
 * Player` — Unknown / GG / Honest cover 606 of the 645 — with a bare `Unknown`
 * and a run of `?` as the obvious remainder. One word, not a phrase: a real
 * handle is free text and a two-word handle ending in "Player" is a person
 * until shown otherwise.
 *
 * MEASURED OVER ALL 43,888 SIDES of the 2026-09-07 sweep (recon flat.json,
 * 2026-09-08): the space-separated form alone flags 640 sides over 22
 * spellings; the recon's 645 also counted `GGplayer`, `VampirePlayer` (no
 * space), `SF6 PLAYER` (a digit in the word), `None`, and the bilingual `IMOG
 * Player (いもG Player)`. The first four are folded in below; the bilingual one
 * is left to surface in `handleAffix.unrelated`, which is where an unlisted
 * spelling should appear rather than vanish. Pure punctuation is a placeholder
 * too — `.` ×8, `|`, `…`, `...`, `▼▲▼▲…`, 12 sides the recon did not count —
 * because playerId() slugs it to '' and parse refuses it anyway. Total with
 * this predicate: 656 sides over 31 spellings.
 *
 * Exported so the parser's own drop rule and this witness can share ONE
 * definition — two lists of placeholder spellings would drift the first time
 * either was touched.
 */
const PLACEHOLDER_HANDLE =
  /^(?:(?:[\p{L}\p{N}]+\s*)?player|unknown|none|n\/a|tbd|[^\p{L}\p{N}]*)$/iu;
export const isPlaceholderHandle = (handle: string): boolean =>
  PLACEHOLDER_HANDLE.test(normalizeText(handle));

/**
 * Exact resolution of one catalogue character string through the roster's own
 * matcher: exactly ONE alias span, and it covers the WHOLE normalised string.
 * `Asuka R♯`, `Bedman`, `Jack-O` and `Zato-1` all resolve this way without an
 * alias-table entry for the variant, because the matcher's punctuation class is
 * flexible by construction (roster.ts buildAliasMatcher). `Sol Badguy Player`
 * does not: the span stops short of the string, and that is the point.
 */
export function exactAlias(matcher: AliasMatcher, text: string): string | undefined {
  const t = normalizeText(text);
  if (t === '') return undefined;
  const spans = matcher.find(t);
  if (spans.length !== 1) return undefined;
  const s = spans[0]!;
  return s.start === 0 && s.end === t.length ? s.id : undefined;
}

/** How many sides an id must be OUR reading of before its absence from the
 *  catalogue counts as a vocabulary gap rather than a coincidence, and how
 *  concentrated the catalogue's alternative has to be. Both are deliberately
 *  blunt: this test only has to separate "said King 330 times out of 331" from
 *  "three scattered sides on a two-page cursor morning". */
const BLIND_SPOT_MIN_SIDES = 10;
const BLIND_SPOT_CONCENTRATION = 0.9;

const charsOf = (e: WitnessEntry, side: 1 | 2): string[] =>
  ([`p${side}_char`, `p${side}_char2`, `p${side}_char3`, `p${side}_char4`] as const)
    .map((k) => (e as unknown as Record<string, unknown>)[k])
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map((c) => c.trim());

const setEq = (a: string[], b: string[]): boolean => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};
const subsetOf = (a: string[], b: string[]): boolean => a.every((x) => b.includes(x));

interface Side {
  /** The player identity key, or [] when the catalogue named nobody. */
  players: string[];
  /** The catalogue's raw handle after sponsor stripping, for the placeholder
   *  test — resolveKey would turn `Unknown Player` into `unknown-player`, a
   *  perfectly good-looking id. */
  handle: string;
  chars: string[];
}
/** One video both sides hold, with the orientation already settled. */
interface Pair {
  videoId: string;
  title: string;
  ours: Side[];
  theirs: Side[];
}

/**
 * @param witness      every entry the pull saw, tagged and untagged
 * @param committed    our published records
 * @param matcher      the roster's alias matcher (roster.ts buildAliasMatcher —
 *                     the parser's own vocabulary), used EXACTLY: see exactAlias
 * @param resolveKey   the repo's player identity key (roster.ts playerId).
 *                     Lowercases through normalizeText, which is what folds the
 *                     421 case-only handle groups (`Tatuma`/`tatuma`,
 *                     `NitroNY`/`NITRONY`) into one identity each
 * @param stripSponsor the catalogue's own handle cleanup (channels.ts
 *                     stripTheaterSponsor), applied to BOTH sides. Ours already
 *                     went through it at parse time and the strip is idempotent;
 *                     applying it here too makes the measurement independent of
 *                     that discipline. The raw chapter comparison in the recon
 *                     read 86.5% handle agreement and the residue was sponsor
 *                     prefixes (`AHS | Crantum` vs `Crantum`), so an unstripped
 *                     comparison here would understate agreement by the same
 *                     margin.
 * @param sideCap      how many characters the CATALOGUE can express per side
 *                     (four columns; a side of ours longer than that is one it
 *                     structurally cannot witness — none today, the longest
 *                     compared side on a 1v1 game is a counter-pick union)
 * @param carriedBlindSpots
 *                     blind spots this repo has ALREADY derived and committed,
 *                     applied on top of whatever this run can derive for itself.
 *                     The derivation needs BLIND_SPOT_MIN_SIDES sides of
 *                     evidence, and the daily run is a two-page cursor morning
 *                     that cannot supply them. A blind spot is a fact about the
 *                     CATALOGUE'S VOCABULARY, not about a run, so it outlives
 *                     the pull that found it. A full sweep is authoritative and
 *                     may retire one; a cursor run can only ADD.
 */
export function crossCheck(
  witness: WitnessFile,
  committed: MatchVideo[],
  matcher: AliasMatcher,
  resolveKey: (h: string) => string,
  stripSponsor: (h: string) => string,
  sideCap = 4,
  carriedBlindSpots: BlindSpot[] = [],
): CrossCheckResult {
  // ONLY WHOLE-VIDEO RECORDS FROM A TRACKED CHANNEL ARE COMPARABLE, and on this
  // game the second half of that sentence has to be tested on the intake, not
  // on the id. The siblings exclude `${videoId}@${startSeconds}` ids because
  // those are built FROM this catalogue; here the untagged arm is admitted too,
  // so 13,402 of the catalogue's rows can become records under a BARE video id
  // (types/index.ts ChannelIndex). Excluding by `@` alone would compare every
  // one of those against the row it was built from and report a spotless
  // 100% — the catalogue witnessing itself. Test `intake`, which is the dedupe
  // key and names where a record came from; keep the `@` test as well because
  // a segment has no whole-video claim to compare with regardless of source.
  const ours = new Map<string, MatchVideo>();
  for (const v of committed) {
    if (v.intake === 'replayTheater') continue;
    if (v.id.includes('@')) continue;
    ours.set(v.id, v);
  }

  const entries = witness.entries ?? [];
  const byVideo = new Map<string, WitnessEntry[]>();
  for (const e of entries) {
    const m = VIDEO_ID.exec(e.video_link ?? '');
    if (!m) continue;
    byVideo.set(m[1]!, [...(byVideo.get(m[1]!) ?? []), e]);
  }

  const resolveChar = (c: string): string | undefined => exactAlias(matcher, c);

  // THE CATALOGUE'S WHOLE VOCABULARY, read off the whole pull rather than off
  // the compared subset. A character it names once on a video we do not hold is
  // still a character it can name.
  const spoken = new Set<string>();
  for (const e of entries) {
    for (const side of [1, 2] as const) {
      for (const c of charsOf(e, side)) {
        const id = resolveChar(c);
        if (id !== undefined) spoken.add(id);
      }
    }
  }

  const r: CrossCheckResult = {
    compared: 0,
    unmatched: 0,
    segmented: 0,
    players: {
      both: 0,
      one: 0,
      neither: 0,
      flipped: 0,
      placeholder: 0,
      handleAffix: { ours: 0, theirs: 0, unrelated: 0 },
    },
    characters: {
      sides: 0,
      agree: 0,
      subset: 0,
      disagree: 0,
      cannotWitness: 0,
      blindSpot: 0,
      unreadable: 0,
      overCap: 0,
    },
    blindSpots: [],
    disagreements: [],
  };

  // ── pass 1: align, and nothing else ─────────────────────────────────────
  // ORIENTATION FIRST. The catalogue's p1/p2 is the submitter's reading of the
  // screen and ours is the title's; they agree on essentially every row but not
  // by contract, and comparing characters across a swapped pair would
  // manufacture two disagreements out of none. Aligned on the HANDLES, which is
  // the field the two sources agree on most.
  //
  // NO NAME SPLITTING. The siblings split a name cell on `/ & + -` for duo
  // formats; Strive is 1v1, the cell is one player, and that separator would
  // shred handles this catalogue actually contains — `t.tv/WhispCL`, `K/UE`,
  // `spat/pan` (channels.ts, "THERE IS NO playerSep"). One cell, one key.
  //
  // Separated from the scoring because the blind spots are derived from the
  // aligned population and there is nothing to derive them from until it exists.
  const pairs: Pair[] = [];
  for (const [videoId, list] of byVideo) {
    const mine = ours.get(videoId);
    if (!mine) {
      r.unmatched++;
      continue;
    }
    // The catalogue cut this VOD into segments. Our record is the whole video,
    // so there is no single claim to compare — and these are the intake's own
    // rows anyway.
    if (list.length > 1) {
      r.segmented++;
      continue;
    }
    const e = list[0]!;
    r.compared++;

    const theirSides: Side[] = ([1, 2] as const).map((n) => {
      const handle = stripSponsor(String(e[`p${n}_name`] ?? ''));
      const key = isPlaceholderHandle(handle) ? '' : resolveKey(handle);
      return { players: key ? [key] : [], handle, chars: charsOf(e, n) };
    });
    const ourSides: Side[] = mine.sides.map((s) => {
      const handle = stripSponsor(s.handle);
      const key = resolveKey(handle);
      return { players: key ? [key] : [], handle, chars: s.characters };
    });

    const score = (a: Side[], b: Side[]) =>
      a.reduce((n, s, i) => n + (s.players.some((p) => b[i]!.players.includes(p)) ? 1 : 0), 0);
    const flipped = score(ourSides, [theirSides[1]!, theirSides[0]!]) > score(ourSides, theirSides);
    if (flipped) r.players.flipped++;
    pairs.push({
      videoId,
      title: mine.title,
      ours: ourSides,
      theirs: flipped ? [theirSides[1]!, theirSides[0]!] : theirSides,
    });
  }

  // ── the blind spots, derived ────────────────────────────────────────────
  // Only ids the catalogue never once spoke are candidates; of those, only the
  // ones it consistently REPLACES with a single other id. Condition 1 alone
  // would be unsafe on a thin pull — a two-page morning sees a fraction of the
  // roster — and it is condition 2 that survives it, because a handful of
  // sides cannot concentrate.
  const chances = new Map<string, number>();
  const instead = new Map<string, Map<string, number>>();
  for (const p of pairs) {
    for (let i = 0; i < 2; i++) {
      const said = p.theirs[i]!.chars.map(resolveChar).filter((x): x is string => x !== undefined);
      for (const c of p.ours[i]!.chars) {
        if (spoken.has(c)) continue;
        chances.set(c, (chances.get(c) ?? 0) + 1);
        const tally = instead.get(c) ?? new Map<string, number>();
        for (const id of said) tally.set(id, (tally.get(id) ?? 0) + 1);
        instead.set(c, tally);
      }
    }
  }
  const blind = new Map<string, BlindSpot>();
  for (const [id, sides] of chances) {
    const top = [...(instead.get(id) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;
    if (sides < BLIND_SPOT_MIN_SIDES || top[1] / sides < BLIND_SPOT_CONCENTRATION) continue;
    blind.set(id, { id, mergedInto: top[0], merged: top[1], sides });
  }
  // A cursor pull is ADDITIVE: it keeps every carried blind spot it did not
  // re-derive, because absence of evidence in a hundred entries is not evidence
  // of absence. A FULL sweep has seen the whole catalogue, so what it does not
  // re-derive is genuinely gone and is allowed to lapse.
  if (witness.mode !== 'full') {
    for (const b of carriedBlindSpots) if (!blind.has(b.id)) blind.set(b.id, b);
  }
  r.blindSpots = [...blind.values()].sort((a, b) => b.sides - a.sides || a.id.localeCompare(b.id));

  // ── pass 2: score ───────────────────────────────────────────────────────
  for (const p of pairs) {
    // A PLACEHOLDER SIDE IS A WITNESS THAT DECLINED TO ANSWER. Held out of the
    // player score entirely; the characters below are still compared, because
    // `Unknown Player (Sol Badguy)` is a perfectly good character claim.
    const placeholder = p.theirs.some((s) => isPlaceholderHandle(s.handle));
    if (placeholder) {
      r.players.placeholder++;
    } else {
      const hits = p.ours.reduce(
        (n, s, i) => n + (s.players.some((x) => p.theirs[i]!.players.includes(x)) ? 1 : 0),
        0,
      );
      for (let i = 0; i < 2; i++) {
        const mineKey = p.ours[i]!.players[0] ?? '';
        const theirKeys = p.theirs[i]!.players;
        if (theirKeys.includes(mineKey)) continue;
        if (mineKey && theirKeys.some((x) => x !== mineKey && mineKey.includes(x))) {
          r.players.handleAffix.ours++;
        } else if (mineKey && theirKeys.some((x) => x !== mineKey && x.includes(mineKey))) {
          r.players.handleAffix.theirs++;
        } else {
          r.players.handleAffix.unrelated++;
        }
      }
      if (hits === 2) r.players.both++;
      else if (hits === 1) r.players.one++;
      else {
        r.players.neither++;
        r.disagreements.push({
          videoId: p.videoId,
          field: 'players',
          ours: p.ours.flatMap((s) => s.players),
          theirs: p.theirs.flatMap((s) => s.players),
          title: p.title,
        });
      }
    }

    for (let i = 0; i < 2; i++) {
      r.characters.sides++;
      const mineChars = p.ours[i]!.chars;
      // A SIDE OF OURS THE CATALOGUE HAS NO WORD FOR. Checked before anything
      // it said, because it does not matter what it said: it could not have
      // agreed.
      if (mineChars.some((c) => blind.has(c))) {
        r.characters.blindSpot++;
        continue;
      }
      // EXACT ALIAS ONLY. A catalogue string the roster does not know is not a
      // disagreement — it is a witness we cannot read, and guessing at it is
      // how a second witness becomes a second parser.
      const raw = p.theirs[i]!.chars;
      const resolved = raw.map(resolveChar);
      if (raw.length === 0 || resolved.some((x) => x === undefined)) {
        r.characters.unreadable++;
        continue;
      }
      // THE SCHEMA CEILING. The catalogue carries `sideCap` character columns;
      // MatchSide.characters is an ordered union with no such limit.
      if (mineChars.length > sideCap) {
        r.characters.overCap++;
        continue;
      }
      const theirChars = resolved as string[];
      if (setEq(mineChars, theirChars)) r.characters.agree++;
      else if (subsetOf(mineChars, theirChars) || subsetOf(theirChars, mineChars))
        r.characters.subset++;
      else {
        r.characters.disagree++;
        r.disagreements.push({
          videoId: p.videoId,
          field: 'characters',
          side: i,
          ours: mineChars,
          theirs: theirChars,
          title: p.title,
        });
      }
    }
  }
  r.characters.cannotWitness =
    r.characters.blindSpot + r.characters.unreadable + r.characters.overCap;
  return r;
}

const pct = (n: number, total: number) =>
  total === 0 ? '—' : `${((n / total) * 100).toFixed(2)}%`;

/**
 * The report.md block, rendered from the COMMITTED artifact rather than from
 * this run's result — see WitnessArtifact for why. Byte-identical between full
 * sweeps, which is what keeps a quiet morning quiet. Returns nothing until a
 * full sweep has measured once.
 */
export function formatCrossCheck(art: WitnessArtifact): string[] {
  const m = art.measured;
  if (!m || m.compared === 0) return [];
  const c = m.characters;
  const witnessable = c.agree + c.subset + c.disagree;
  const scored = m.players.both + m.players.one + m.players.neither;
  const a = m.players.handleAffix;
  const affixTotal = a.ours + a.theirs + a.unrelated;
  return [
    '## Replay Theater cross-check',
    '',
    `A second reading of **${m.compared}** of our own records, from the catalogue's`,
    'UNTAGGED entries — online replays it indexes that we also parse from a tracked',
    'channel. It changes nothing: a disagreement is recorded in',
    'data/theater-disagreements.json with both claims, never written into a record.',
    'The catalogue does not outrank a confident parse and never outranks a human',
    'override.',
    '',
    // THE CAVEAT IS PART OF THE NUMBER. Printing "neither side saw the other"
    // here — the siblings' sentence — would be false on this game: 97.27% of
    // the overlapping rows were submitted the day the VOD went up.
    "_On this game the witness is NEAR-DEPENDENT: measured 2026-09-07, the catalogue's_",
    "_upload_date equals the VOD's publish date on 97.27% of overlapping rows, so the_",
    '_submitter most likely read the same title our parser did. Agreement is a_',
    '_consistency check on two readers of one title; disagreement is a title at least_',
    '_one of them misread._',
    '',
    `_Measured on the last full sweep, at catalogue entry ${m.atEntryId}. ${m.unmatched} catalogue video(s) are ones_`,
    `_we do not hold from a tracked channel; ${m.segmented} are VODs the catalogue segments, which the intake owns._`,
    '',
    '| field | population | agree | partial | disagree | cannot witness |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| players (both handles) | ${scored} | ${m.players.both} (${pct(m.players.both, scored)}) | ${m.players.one} | ${m.players.neither} | ${m.players.placeholder} |`,
    `| characters (per side) | ${c.sides} | ${c.agree} (${pct(c.agree, c.sides)}) | ${c.subset} | ${c.disagree} (${pct(c.disagree, c.sides)}) | ${c.cannotWitness} |`,
    '',
    `Side order differed on **${m.players.flipped}** record(s); the comparison realigns on the`,
    'handles before reading characters, so a swapped pair is not counted twice as a',
    'character disagreement. Handles are compared sponsor-stripped on both sides.',
    '',
    ...(m.players.placeholder > 0
      ? [
          `**${m.players.placeholder}** record(s) carry a placeholder handle on the catalogue's side`,
          '(`Unknown Player`, `GG Player`, …) — a witness that declined to name the player, held',
          'out of the players row rather than scored as a miss. Their characters are still compared.',
          '',
        ]
      : []),
    ...(c.cannotWitness > 0
      ? [
          `**${c.cannotWitness}** side(s) the catalogue COULD NOT HAVE GOT RIGHT are held out of both`,
          `columns above: agreement over the ${witnessable} it can express is **${pct(c.agree, witnessable)}**.`,
          '',
          ...(art.blindSpots.length
            ? [
                'Its vocabulary has no word for these, derived from that sweep rather than declared —',
                'no string anywhere in the pull resolves to the id, and where we say it the',
                'catalogue says one particular other thing almost every time:',
                '',
                ...art.blindSpots.map(
                  (b) =>
                    `- \`${b.id}\` → the catalogue writes \`${b.mergedInto}\` instead, on ${b.merged} of the ` +
                    `${b.sides} side(s) where we say it (${pct(b.merged, b.sides)}).`,
                ),
                '',
              ]
            : []),
          ...(c.unreadable > 0 || c.overCap > 0
            ? [
                `A further ${c.unreadable} carried a character string that resolves to no roster id, and ${c.overCap}`,
                'named more characters on our side than the catalogue can hold in its four',
                'columns — MatchSide.characters is an ordered union and has no such limit.',
                '',
              ]
            : []),
        ]
      : []),
    ...(affixTotal > 0
      ? [
          `Of the ${affixTotal} side(s) whose handles did not match, **${a.ours}** are ours carrying extra text`,
          `the catalogue does not, **${a.theirs}** are theirs carrying a team tag THEATER_SPONSOR does not`,
          `strip yet, and **${a.unrelated}** are genuinely different names — the only bucket worth reading one`,
          'row at a time. Reported, never scored: substring matching on handles is the kind of',
          'guessing this module refuses.',
          '',
        ]
      : []),
    ...(art.disagreements.length
      ? [
          `**${art.disagreements.length} disagreement(s)** — both claims, ours first:`,
          '',
          ...art.disagreements
            .slice(0, 25)
            .map(
              (d) =>
                `- \`${d.videoId}\`${d.side !== undefined ? ` side ${d.side}` : ''} ${d.field}: ` +
                `**${d.ours.join(', ') || '(none)'}** vs catalogue **${d.theirs.join(', ') || '(none)'}** — ${d.title.slice(0, 70)}`,
            ),
          ...(art.disagreements.length > 25 ? [`- … ${art.disagreements.length - 25} more`] : []),
          '',
        ]
      : ['No disagreements on that sweep.', '']),
  ];
}
