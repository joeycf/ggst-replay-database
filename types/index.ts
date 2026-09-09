// Pipeline-track types (plain node/tsx code — never enters the Nuxt graph, so
// the engine contract is restated where emitted shapes must mirror it, exactly
// like the SF6, Tekken, 2XKO, Tōkon and CotW pipelines do).

/** The Replay.source contract: doubles as GameConfig.sourceChannels[].id
 *  (badge/filter). Grouping into Online/Tournament chips lives ONLY in
 *  app/app.config.ts sourceGroups; group ids never appear in data or URLs.
 *
 *  `replayTheater` is ONE token covering both arms of the catalogue, as on
 *  CotW. Strive's split is the reverse of every sibling's, though — measured
 *  live 2026-09-07 over all 21,944 entries: 7,184 tagged (32.74%, across 509
 *  events) against 14,760 untagged. That tagged share is the HIGHEST on the
 *  platform by 1.3× and 9× CotW's 3.64%, so the tournament arm here is a real
 *  corpus rather than a rounding error. Both arms are still the same publisher
 *  making the same kind of statement, so they share a badge; what differs is
 *  the record SHAPE, carried on the record (videoId/startSeconds). */
export type SourceId =
  | 'ggHighLevel'
  | 'guiltyGearReplays'
  | 'ggstBattleCollection'
  | 'ggstHq'
  | 'ggstHighRank'
  | 'yumegiwa'
  | 'guiltyGearVods'
  | 'ggstLowLevel'
  | 'replayTheater';

/**
 * Per-YouTube-channel intake key: names raw/<key>.json and the coverage
 * report's rows. THE DEDUPE KEY (checklist step 2) — never the SourceId, which
 * two channels may one day deliberately share.
 *
 * 1:1 with SourceId today. The two unions stay separate anyway: the moment one
 * physical channel starts publishing two kinds of footage they stop being 1:1,
 * and keying dedupe on a shared public token means channel priority silently
 * never fires between the two while override protection leaks from one
 * channel's hand corrections to the other's. Both failures look exactly like
 * working dedupe.
 */
export type ChannelKey =
  | 'ggHighLevel'
  | 'guiltyGearReplays'
  | 'ggstBattleCollection'
  | 'ggstHq'
  | 'ggstHighRank'
  | 'yumegiwa'
  | 'guiltyGearVods'
  | 'ggstLowLevel'
  | 'replayTheater';

/**
 * Which side segment of a title holds the characters.
 *
 * ON THIS GAME IT IS NOT PURE TELEMETRY, AND THAT IS THE ONE PLACE STRIVE
 * DIVERGES FROM ITS SIBLINGS (checklist 5m, contributed by this build).
 *
 * The parser still RESOLVES rather than counts slots: it asks which side of the
 * bracket resolves to a roster alias and takes the remainder as the handle, so
 * it never has to choose an order. That handles all four shapes below with one
 * code path. What it cannot handle alone is the case where BOTH sides resolve —
 * `Sol Badguy (Ky Kiske)`, or the live `A.B.A / アバ [ Beshh00 ] vs UNIKA /
 * ユニカ [ ユニカ ]` — because there the first resolving span is a coin flip.
 * Measured on the 2026-09-07 recon: 215 titles rejected for exactly this and 67
 * more filed CONFIDENTLY WRONG (player "UNIKA / ユニカ", player "JOHNNY /
 * ジョニー", player "SOL / ソル"). So the declared order below is the
 * deterministic tie-breaker for that branch ONLY, and everything else still
 * resolves by roster membership.
 *
 * The mix is recorded per channel, BOTH sides, so a channel changing its
 * grammar shows up as a shift rather than as silence. CotW's telemetry sampled
 * side 0 only and was never printed; this one is printed in report.md.
 *
 *  'handle-outside'    HANDLE (Character)      — ggHighLevel, guiltyGearReplays,
 *                                                guiltyGearVods, yumegiwa（ ）
 *  'chars-outside'     CHARACTER (handle)      — ggstHighRank, and
 *                                                ggstBattleCollection with [ ]
 *  'handle-first-bare' Handle Character vs …   — ggstHq, no brackets at all
 *                                                (129 of 2,994 titles carry one,
 *                                                and the 1-in-50 is "(OLD)")
 *  'chars-only'        Character vs Character  — ggstLowLevel, which names no
 *                                                player on 96.5% of its titles
 */
export type SlotOrder = 'handle-outside' | 'chars-outside' | 'handle-first-bare' | 'chars-only';

/**
 * An INDEX source: a third-party catalogue that points AT video rather than
 * hosting it. (Checklist step 12, contributed by CotW and written up during
 * this build.)
 *
 * STRIVE'S CATALOGUE IS THE PLATFORM'S LARGEST BY A WIDE MARGIN — 21,944
 * entries against CotW's 3,489 and SF6's 15,568, and 64% of all five prior
 * catalogues combined. Measured live 2026-09-07:
 *
 *   tagged    7,184 entries (32.74%) across 509 event tags · 98.6% carry a
 *             `t=` offset. A real tournament corpus.
 *   untagged  14,760 entries · 9.9% carry `t=`. Mostly one entry per WHOLE
 *             video, CotW's shape.
 *
 * So the record id follows the ENTRY, not the source: composite
 * `${videoId}@${startSeconds}` when there is a real offset, the plain YouTube
 * id when there is not (checklist 12b). Both arms are load-bearing here at
 * 8,542 offset-carrying rows against 13,402 without — this is not the edge case
 * it was on CotW.
 */
export interface ChannelIndex {
  /** Catalogue endpoint, paged with &page=N. */
  endpoint: string;
  /** The index's own token for this game, used as the ?game= query value.
   *  'strive' — NOT our slug. `?game=ggst` returns HTTP 400 "Invalid game", as
   *  do `gg`, `guiltygear` and `ggs`. Probed 2026-09-07. */
  slug: string;
  /** The game string each ENTRY states about itself. Checked per entry, because
   *  ?game= is a filter someone else answers and a mistagged submission arrives
   *  looking exactly like a real one. 21,944/21,944 pass today. */
  gameLabel: string;
  /** Entries per page. Theirs, not ours. 439 pages at 50. */
  pageSize: number;
  /** ms between requests — politeness, not rate-limit avoidance. */
  pacingMs: number;
  /**
   * Untagged entries are ADMITTED as an online source, not just kept as a
   * witness.
   *
   * THE PRICE, MEASURED, AND IT IS NOT CotW's PRICE. Two independent stratified
   * samples (n=3,054 rows over 2,502 videos, plus a video-uniform n=900) put the
   * dead-link rate at 9.20% of rows / 12.00% of videos — a third of CotW's
   * 32.1%. And the shape is different in a way that matters: CotW's decay is
   * age-graded and monotone; Strive's is NOT. 2025 reads 0.23% and 2026 0.47%,
   * 2022 reads 1.36% and 2021 — the oldest real year — 6.43%, while 2023 reads
   * 34.63%. The deaths sit entirely outside the tracked-channel corpus (0 dead
   * of 1,571 sampled overlap rows against 336 of 1,483 RT-unique) and cluster in
   * contiguous id blocks, 206 of 260 probed neighbours also 404. That is a
   * per-match channel submitting its back catalogue and later deleting it, not
   * decay. Do not carry CotW's sentence over; re-measure at ingest and do not
   * pin this number either.
   */
  admitUntagged: boolean;
}

export interface ChannelConfig {
  /** Raw-dump key / report row (unique per YouTube channel). */
  id: ChannelKey;
  /** The source this channel's replays publish under. */
  source: SourceId;
  /** Display name (mirrors app/app.config.ts sourceChannels[].name). */
  name: string;
  /** YouTube channel id. Absent on an `index` source, which has no channel. */
  channelId?: string;
  /** The channel's uploads playlist (UU + channelId.slice(2), pinned — saves a
   *  quota unit per channel per run, and the id is stable where a handle is
   *  not). Absent on an `index` source. */
  uploadsPlaylist?: string;
  /** This intake is a third-party INDEX, not a YouTube channel. Its dump is
   *  built by scripts/fetch-theater.ts, its records are not built by a title
   *  parse, and data:fetch skips it. Mutually exclusive with channelId. */
  index?: ChannelIndex;
  /**
   * The channel's declared slot order — the tie-breaker for a side segment
   * where BOTH the bracketed and unbracketed spans resolve to roster aliases.
   * See SlotOrder: everywhere else the parser resolves by roster membership and
   * this field is only recorded.
   */
  slotOrder: SlotOrder;
  /**
   * CRON-FETCHED, WITH A CARRY FALLBACK. raw/ is gitignored and the cron works
   * from a fresh checkout, so a run whose pull failed has no dump. When the
   * dump is ABSENT OR EMPTY the intake's committed records are CARRIED (the
   * mechanism `frozen` uses); when it has rows they are rebuilt and merged over
   * the committed set add-only. The carry pin lives in data/source-pins.json
   * because this kind of source GROWS — a constant in this file would be
   * friction that teaches people to skip the check.
   */
  cronFetchedWithCarry?: boolean;
  /**
   * Where the is-Strive game marker may appear. Default 'title'.
   *
   * MANDATORY, but for a narrower reason than on CotW: seven of the eight
   * intake channels are single-game at 99%+, and only `yumegiwa` mixes titles
   * (GGST 1,412 / GBVSR 960 / GG Xrd Rev2 328). It writes the game as an
   * explicit token in every title, so a TITLE gate is sufficient and no intake
   * channel needs a description fetch — which saves a videos.list round-trip on
   * the daily cron.
   *
   * The marker itself needs two corrections CotW's did not (checklist 5l):
   * `GGST(?![A-Za-z])` and never `\bGGST\b`, because `GGST2.0` is the dominant
   * spelling on ggstBattleCollection and word-boundary loses 150 of the eight
   * intake dumps' videos (1,003 across the recon's wider 24-channel sweep —
   * measured both ways 2026-09-09 by the verify-gates control, which asserts
   * the marked total falls and prints the real number)
   * silently; and STRIVE is the marker while GUILTY GEAR is NOT, because the
   * series is 27 years old and matching it reads 576 Xrd/Rev2 uploads.
   */
  striveSignal?: 'title' | 'titleOrDescription';
  /** This channel is ingested for EVENT FOOTAGE ONLY: a title carrying no
   *  event-brand signal is a miss (`not-an-event`), not a record. */
  eventsOnly?: boolean;
  /**
   * This channel's duration floor in seconds, in place of the global
   * MIN_MATCH_SEC (parse.ts, 120). A record shorter than the floor is a
   * `too-short` miss, counted per channel in report.md.
   *
   * WHY THIS IS PER-CHANNEL, MEASURED 2026-09-08 (ggst-notes/hydration.md): the
   * first videos.list pass over all 18,509 marked uploads found the 60–120s band
   * on every channel to be clips and lab shorts — except ggstHq, where 434
   * uploads under 120s are FULLY TITLED MATCHUPS ("GGST 5.2 Gobou Robo Ky VS
   * Nanashi Zato", 69s). They are YouTube Shorts (median exactly 60s, the
   * Shorts ceiling), and 242 of them are the ONLY footage of that matchup the
   * channel ever posted (title-stem match against every ≥120s upload, ±7 days:
   * 26 duplicates, 242 with no long counterpart at all). A global 120 would
   * silently drop 14.5% of that channel, all of it parseable and most of it
   * unique. The record carries its own durationSec, so a 1:09 clip is honest on
   * the card; what changes is the wording — "sets and short clips", never
   * "matches" — not the schema.
   *
   * Absent means the global floor. Only ggstHq sets it today.
   */
  minDurationSec?: number;
  /**
   * This channel's date floor, in place of the global LAUNCH gate.
   *
   * Strive's pre-release footage reaches back further than any sibling's: the
   * catalogue's oldest rows are 2020-04-18, fourteen months before the
   * 2021-06-11 launch, and the 221 rows there span THREE separate pre-release
   * runs rather than CotW's single OBT window — clustered from the catalogue
   * tail 2026-09-07 and separated by gaps of 174 and 122 days, against ≤28 days
   * everywhere else: the April 2020 closed beta (81), an isolated October 2020
   * build (3), and the 2021 run from the February open beta to launch (137).
   * scripts/seasons.ts carries one date-token patch row per run. Only meaningful together
   * with a pre-release era in scripts/seasons.ts: emit throws on a patch token
   * no boundary accounts for, so a record admitted here with no era to file
   * under fails loudly rather than shipping undated.
   */
  preReleaseFrom?: string;
  /** A channel that stopped publishing this game. Its committed records are
   *  still real and still play at their URLs, so they are CARRIED FORWARD
   *  byte-stable rather than pruned; fetch skips it entirely. `records` is a
   *  hard-asserted pin — the committed data file is both the source and the
   *  target of the carry, so one bad run would poison the next run's reference
   *  permanently and silently. Editing the pin IS the deliberate-prune
   *  mechanism, and it shows up in review. (Checklist step 7.)
   *
   *  UNLIKE CotW, THIS SHIPS WITH A LIVE CONSUMER: ggstLowLevel last published
   *  2026-07-16. The mechanism is therefore exercised on day one rather than
   *  waiting to be needed, and verify:gates carries a control that injects a
   *  pin mismatch — the gap CotW left open (its frozen branch has never run). */
  frozen?: { since: string; reason: string; records: number };
}

/** One upload as fetched from the YouTube Data API (raw/<key>.json). */
export interface RawVideoRecord {
  id: string;
  /** Intake channel, NOT the source — parse maps it via CHANNELS. */
  channel: ChannelKey;
  title: string;
  description: string;
  publishedAt: string; // ISO
  /** ISO8601 duration decoded to seconds; 0 = live/upcoming/unknown. */
  durationSec: number;
  viewCount?: number;
  /** 'none' for normal VODs; 'live'/'upcoming' are excluded by parse. */
  liveBroadcastContent: string;
  tags?: string[];
}

/**
 * One record in raw/replayTheater.json — an index entry already joined to its
 * VOD's YouTube metadata. Extends RawVideoRecord so the dump reads like any
 * other, but the fields below are what the record is actually BUILT from:
 * nothing here is recovered by parsing a title.
 */
export interface TheaterRawRecord extends RawVideoRecord {
  /** `${videoId}@${startSeconds}` for a tagged SEGMENT; the plain YouTube id
   *  for an untagged whole-video entry. See ChannelIndex. */
  id: string;
  /** The catalogue's own entry id. Provenance, and the fetch resume key. */
  theaterId: number;
  /** The YouTube id this record lives in or is. */
  videoId: string;
  /** Offset into videoId, in seconds. Absent when the entry carried no `t=`. */
  startSeconds?: number;
  /** The catalogue's event tag, '' on the untagged arm. TRIM IT: 43 rows across
   *  3 tags carry a trailing newline, and an untrimmed tag keys a phantom
   *  event. Three more spelling groups collapse under [^a-z0-9] normalisation
   *  (STRIVE CUP / StriveCup / STRIVECUP), which is SF6's double-submission
   *  lesson reproducing at ~4 events. */
  tag: string;
  /** The VOD's own uploader, for the report. */
  uploader: string;
  /** [side0, side1] handles, exactly as the catalogue spells them — sponsor
   *  prefixes intact, for the parser to strip. */
  players: [string, string];
  /** [side0, side1] character names, exactly as the catalogue spells them.
   *  Strive is 1v1 so a side is normally 1 long — but the length is OBSERVED,
   *  never assumed: the catalogue carries four columns per side and 70 of
   *  21,944 entries use a second (0.319%), 5 a third. */
  characters: [string[], string[]];
}

/**
 * Which stage produced a side's characters. Ordered weakest → strongest.
 *
 * THREE MEMBERS, NOT FIVE, AND THAT IS A MEASUREMENT NOT A SHORTCUT. Strive's
 * titles state both characters on the great majority of marked uploads across
 * all seven live channels, so there is no footage-extraction track in this repo
 * at all — the surface the checklist calls "the most defect-dense on the
 * platform" is simply not needed here.
 *
 * The DESCRIPTION tier is DECLINED, and unlike CotW that is not a close call:
 * only one intake channel is multi-game and it writes the game token in the
 * title, so nothing needs a description read. Re-measure before adding a
 * channel.
 *
 * THE ORDER OF THIS UNION IS DOCUMENTATION, NOT CONTROL FLOW. Precedence is
 * the order of application in code, and nothing ever downgrades a side.
 */
export const CHAR_TIERS = ['title', 'index', 'human'] as const;

export type CharTier = (typeof CHAR_TIERS)[number];

/**
 * Per-side character provenance — the answer to "how did this record get its
 * characters", recorded at the moment it is decided (checklist 8b).
 *
 * SUBSTRATE ONLY. The engine's `Side` is { player, players?, characters, rank? }
 * with no `extra` bag. scripts/emit.ts projects sides field-by-field rather
 * than spreading, so provenance cannot leak into replays.json by construction;
 * emit asserts that anyway.
 */
export interface CharProvenance {
  /** The tier that produced the FINAL list (the strongest that contributed). */
  tier: CharTier;
  /** Every tier that contributed, in the order applied. */
  tiers: CharTier[];
  /** Ids the TITLE stated. Always present on a title-parsed record. An index
   *  intake parses no title — its title is synthesized FROM the catalogue's own
   *  character fields, so citing it as a source would be circular — and those
   *  sides carry `[]` here. */
  fromTitle: string[];
  /** Ids a third-party INDEX stated for this side, as discrete fields. */
  fromIndex?: string[];
  /** Ids a PERSON entered, resolving a review-queue item. Authoritative. */
  fromHuman?: string[];
  /** Which slot order this side's title segment resolved to. Recorded for
   *  EVERY side, not sampled — the per-channel mix is printed in report.md. */
  slotOrder?: SlotOrder;
  /** The tie-breaker fired: both spans resolved to roster aliases and the
   *  channel's declared slotOrder decided it. Counted per channel, because a
   *  rising rate means a channel is drifting. */
  tieBroken?: boolean;
  /** Tiers disagreed. The record is queued for review, WITHHELD rather than
   *  published: a union of two disagreeing tiers asserts a matchup neither
   *  source stated. */
  conflict?: boolean;
  /** characters.length >= charactersPerSide (1 here), i.e. the side is known. */
  complete: boolean;
}

/** One parsed side: one pilot, and every character they fielded.
 *
 *  Strive is 1v1, so a normal side holds exactly ONE. It is still a union of
 *  1..N in first-appearance order, not a fixed-length tuple:
 *   · MORE than 1 is a counter-pick inside a set — legal data, counted in
 *     characterUsage. 134 YouTube titles (0.69%) and 75 catalogue rows name
 *     two or more on one side. There is no pairing surface on a 1v1 game, so
 *     the sibling's C(n,2) fabrication hazard does not arise here.
 *   · ZERO is the only failure, and emit hard-fails on it. */
export interface MatchSide {
  /** Player id (slug of handle). */
  player: string;
  /** Display handle, nicest casing seen. */
  handle: string;
  /** Roster character ids (data/characters.json), 1..N, first-appearance order. */
  characters: string[];
  /** How this side's characters were sourced. Substrate only — never emitted. */
  provenance: CharProvenance;
}

/** The committed parse substrate (data/videos.json): only structurally parsed
 *  matches enter it; misses are reported, not stored. */
export interface MatchVideo {
  id: string;
  /** Resolved source (Replay.source), not the intake channel. */
  channel: SourceId;
  /** The INTAKE channel — the dedupe key (checklist step 2). */
  intake: ChannelKey;
  title: string;
  publishedAt: string;
  durationSec: number;
  viewCount?: number;
  /** Balance era token — a SEASON here, resolved from the date boundaries.
   *  NEVER inferred from the game major, which is wrong four times in five:
   *  Seasons 2, 3 and 4 all open inside the 1.x line (Ver 1.18, 1.29, 1.40)
   *  and only Season 5 coincides with a major bump. See scripts/seasons.ts —
   *  the real era authority is ArcSys's separate Battle Version. */
  season: number;
  /** The vendor patch token in force on `publishedAt`, e.g. '2.02'. */
  patch: string;
  /** The YouTube id, when `id` is not it. */
  videoId?: string;
  /** Where this record's footage starts inside `videoId`, in seconds. Absent
   *  means the whole video. */
  startSeconds?: number;
  sides: [MatchSide, MatchSide];
}

/** data/source-pins.json — the carry pin for every `cronFetchedWithCarry`
 *  intake, keyed by ChannelKey. Written by every rebuilding run, hard-asserted
 *  by every carry, and refused if a rebuild would move it DOWN. */
export type SourcePins = Partial<Record<ChannelKey, number>>;

/** data/players.json entry (mirrors the engine's Player). */
export interface PlayerRecord {
  id: string;
  handle: string;
  featured?: boolean;
  extra?: { aliases?: string[] };
}

/** data/characters.json entry (mirrors the engine's Character). `aliases` is
 *  the shared search/parse key — the app's search vocabulary and the parser's
 *  vocabulary are the same data, which is why a new nickname only has to be
 *  added once. */
export interface CharacterRecord {
  id: string;
  name: string;
  imgPortrait: string;
  imgSplash?: string;
  accent: string;
  extra?: {
    aliases: string[];
    /** Arc System Works' own 3-letter page slug (`sol`, `kyk`, … `rbk`). The
     *  ONLY stable key back to first-party art and the character's page: the
     *  detail-page filenames are opaque hashes and cannot be constructed, and
     *  the Fan Kit's trailing code is a THIRD spelling again (anji→anj,
     *  chp→chipp). Never build a fankit filename from this. */
    siteSlug?: string;
    [k: string]: unknown;
  };
}

/** Per-video manual corrections (data/overrides.json). A hand verdict beats
 *  every automatic tier. */
export type VideoOverride = Partial<Pick<MatchVideo, 'season' | 'patch' | 'sides' | 'channel'>> & {
  /** Free-text provenance note. JSON has no comment syntax and this file is
   *  read by humans as often as by code, so an entry says how it got there. */
  '//'?: string;
  exclude?: boolean;
  /** Who resolved this. Load-bearing for dedupe: only HAND-AUTHORED `sides`
   *  overrides protect a record from dedupe (checklist step 2), so the priority
   *  check must test THIS field rather than the mere presence of `sides`. */
  resolvedBy?: 'human';
};

/** One pending item in data/review-queue.json — footage the pipeline refuses to
 *  publish. REGENERATED by every parse run (derived state: resolutions live
 *  solely in overrides.json, so the queue self-clears as verdicts land).
 *  Pending items NEVER reach videos.json or replays.json.
 *
 *  Kinds:
 *   'character-completion' — match-shaped footage whose characters no text
 *                            states.
 *   'source-classification'— a title carrying signals for two games, or an
 *                            events-only channel's upload with no event brand.
 *   'index-conflict'       — the catalogue and the uploader's own title
 *                            disagree about a side. Held, not merged.
 *   'slot-ambiguous'       — BOTH spans of a side segment resolved to roster
 *                            aliases and the channel declares no slotOrder, so
 *                            which one names the character is a guess. Never
 *                            guessed. This is the queue's biggest kind on this
 *                            game by design (checklist 5m). */
export interface ReviewQueueItem {
  id: string;
  kind: 'character-completion' | 'source-classification' | 'index-conflict' | 'slot-ambiguous';
  channel: ChannelKey;
  title: string;
  publishedAt: string;
  durationSec: number;
  /** Handles the title DID state, canonicalised against players.json.
   *  Pre-fills the review form so a reviewer answers only the characters — and,
   *  more importantly, stops a verdict minting a second player page under a
   *  different spelling of an existing player. */
  handles?: [string, string];
  /** For 'index-conflict': what each tier claimed. */
  conflict?: { side: 0 | 1; fromTitle: string[]; fromIndex: string[] };
  /** For 'slot-ambiguous': the two readings, so the reviewer picks rather than
   *  re-derives. */
  readings?: { handle: string; characters: string[] }[];
}

/** One balance era (a named Season). */
export interface SeasonBoundary {
  season: number;
  start: string; // ISO date, inclusive
  end: string | null; // exclusive; null = open (current season)
  confirmed: boolean;
  /** The Battle Version major this era opens on. THE ERA AUTHORITY on this
   *  game: ArcSys versions the balance separately from the build, and its major
   *  bumps land on all four season boundaries with zero exceptions (1.09→2.00
   *  at Ver 1.18, 2.06→3.00 at 1.29, 3.07→4.00 at 1.40, 4.09→5.00 at 2.00).
   *  Null on the pre-release era, which predates the scheme. */
  battleMajor: number | null;
  /** Facet-parent display label. Defaults to `Season ${season}`, which reads
   *  wrong for the pre-release era — "Season 0" names a balance era the vendor
   *  never shipped. */
  label?: string;
  note?: string;
}

/**
 * One released Strive patch.
 *
 * THE VENDOR PUBLISHES A VERSION STRING and it is `X.YY` — exactly two
 * segments, minor always zero-padded, no third segment in five years and 44
 * patches. The source is ArcSys's OWN WordPress REST API
 * (`guiltygear.com/ggst/en/wp-json/wp/v2/posts?categories=4`), NOT the Steam
 * news feed: measured 2026-09-07, the REST call returns all 46 patch-category
 * posts and parses 46/46 on `/^\[Ver\s*\.?\s*(\d+\.\d{2})\]/`, while Steam
 * carries ~24 of 44 in five different title spellings and posts the Ver 1.18
 * season opener with no version in the title at all. A checker polling Steam
 * prints a tick forever.
 *
 * NOTHING FOLDS. Tekken folds X.YY.ZZ→X.YY because it has a hotfix segment to
 * shed; this token has none, and folding on the major would collapse 41 of 44
 * patches into one bucket.
 *
 * NEVER INVENT A VERSION TO FILL A GAP. ArcSys published no patch note for
 * 1.00, 1.01, 1.02, 1.04, 1.06, 1.08, 1.12, 1.14, 1.15, 1.17, 1.20 or 1.42.
 * Those numbers do not appear here. 1.42 has no record anywhere, and the Battle
 * Version is 4.01 on both sides of the 1.41→1.43 gap, so if it shipped it
 * changed no battle behaviour.
 */
export interface PatchBoundary {
  /** Vendor version string, e.g. '2.02' — unique, and never an era token. */
  version: string;
  /** ISO release day, inclusive. THE BODY SENTENCE IS THE AUTHORITY, not the
   *  WordPress date and not the title parenthetical: three dates exist per
   *  patch and 12 of the 18 titles that carry one contradict the body. The S5
   *  opener is the inverse of CotW's marketing trap — here the VENDOR'S OWN
   *  TITLE says April 8 and the body says April 9. Jam unlocked on the 9th. */
  start: string;
  /** ArcSys's separate Battle Version at this patch, e.g. '5.02'. Recorded
   *  because its major is what actually defines a season, and because it is a
   *  free cross-check on date-derived era attribution. */
  battleVersion?: string;
  /** Canonical vendor patch-notes URL. */
  url?: string;
  /** Where the vendor announced it. An undocumented row cannot hide. */
  announcedOn: 'guiltygear-news' | 'steam' | 'launch' | 'beta';
  /** Short community-facing hint, surfaced beside the child in the dropdown. */
  note?: string;
}

/** A patch plus its computed window and resolved era. */
export interface PatchWindow extends PatchBoundary {
  /** exclusive end: the next patch's start within the era, else the era's end,
   *  else null (open). Computed, never authored. */
  end: string | null;
  season: number;
}

/** A time-bomb that has gone off: something the data can tell us is due, rather
 *  than something a human has to remember. See scripts/expiries.ts. */
export interface Expiry {
  kind: 'unreleased-character' | 'unconfirmed-season' | 'stale-patch-table';
  /** roster id, `S${n}` for a season row, or 'patch-table' */
  id: string;
  /** the ISO date that has now passed */
  date: string;
  /** what a human must do to clear it */
  action: string;
}
