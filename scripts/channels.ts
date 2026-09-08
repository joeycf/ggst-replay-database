/**
 * The source channels — checklist step 1, done before a fetcher existed.
 *
 * Nine intakes: eight YouTube channels and one third-party INDEX. All eight
 * channels are ordinary daily uploaders; there is no backfill-once mechanism on
 * this platform and never was. The first cron run IS the backfill, which is why
 * the cron-preservation gate (a simulated daily run proving untouched channels
 * survive) is the one that matters.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY MEASUREMENT BELOW WAS TAKEN 2026-09-07 against the live corpus: 56,951
 * uploads enumerated across 24 candidate channels, 21,657 GGST-marked, 19,538 of
 * those on the eight intakes kept here. "parse" is the share of a channel's
 * GGST-marked uploads from which both sides resolve to exactly one roster
 * character — 16,388 of 19,538 = 83.88% across the intake, 14.43 records/day
 * over the trailing 30 days.
 *
 * THAT 83.88% IS AN UPPER BOUND, NOT THE PARSE RATE. The sweep spent its quota
 * on playlistItems.list and never called videos.list, so no duration and no
 * liveBroadcastContent was read anywhere: the `too-short` and `live` miss
 * classes are absent from the split entirely. Re-derive it from the first real
 * fetch before quoting the number where a reader will take it as final.
 *
 * ARRAY ORDER IS DEDUPE PRECEDENCE. Reordering changes which copy of a
 * cross-posted match survives, so the order is argued, not incidental. It is
 * committed-corpus size first, because day-one volume is what decides most
 * cross-post ties, with grammar quality breaking near-ties:
 *
 *   1 ggHighLevel          5,850 GGST of 5,908 uploads (99.0%) · 98.2% orient.
 *                          "GGST ▰ Jack (#1 Ranked Robo-Ky) vs Phaxy (#1 Ranked
 *                          Testament). High Level Gameplay" — the richest
 *                          metadata on the platform for this game: both
 *                          characters AND both players' live leaderboard
 *                          positions. Largest single contributor.
 *   2 guiltyGearReplays    3,560 of 3,560 (100%) · 89.1%. Same slot order,
 *                          plainer grammar, and 305 shorts in a second grammar
 *                          that names no player at all.
 *   3 ggstBattleCollection 3,375 of 3,377 (99.9%) · 67.3%. Bilingual on BOTH
 *                          fields and the source of the `GGST2.0` marker trap.
 *                          Ranked here on volume; its 1,026 bracket-less titles
 *                          are Japanese lab shorts, not failures.
 *   4 ggstHq               2,994 of 3,000 (99.8%) · 93.1%. NO BRACKETS AT ALL,
 *                          so the roster span IS the boundary. Carries a vendor
 *                          version token ("5.2", "5.1") on 2,864 of 2,994
 *                          titles — the richest patch grammar on any channel of
 *                          any game here.
 *   5 ggstHighRank         1,486 of 1,490 (99.7%) · 96.4%. THE MIRROR TWIN:
 *                          character outside, handle inside. Created 2026-02-06
 *                          and already the fastest-publishing GGST channel at
 *                          4.80/day, so it will climb this list; it sits at 5
 *                          on committed corpus today, not on quality.
 *   6 yumegiwa             1,412 of 3,589 (39.3%) · 70.5%. THE ONLY MULTI-GAME
 *                          INTAKE (GBVSR 960, GG Xrd Rev2 328) and therefore
 *                          the only channel the marker gate exists for. Below
 *                          ggstHighRank because 403 of its uploads are
 *                          tournament index pages rather than matches.
 *   7 guiltyGearVods         144 of 144 (100%) · 93.8%. A grammar clone of
 *                          ggHighLevel with a different decoration. Clean but
 *                          0.13 uploads/day, so it loses every tie.
 *   8 ggstLowLevel           717 of 723 · FROZEN on day one, last upload
 *                          2026-07-16. 96.5% of its titles name no player.
 *   9 replayTheater         the INDEX, 21,944 entries. Last, deliberately —
 *                          array order is dedupe precedence and lowest is right
 *                          for a source that re-indexes other people's uploads.
 *                          Measured: 77.70% of its 14,928 videos are already
 *                          ours, submitted the same day in 97.27% of cases, so
 *                          on the overlap it is a near-dependent witness rather
 *                          than a source.
 *
 * REJECTED, MEASURED, AND NOT TO BE RE-ADDED: @alwayssimplegaming
 * (UCuwk7U1cXiZBG1LxPxTwLTg). 12,748 uploads across 13 games, 494 of them GGST,
 * and all 494 are CPU-vs-CPU character showcases — "Guilty Gear -Strive- Bridget
 * VS Faust", "… Bridget VS Bedman", one per roster entry — with ZERO handles
 * anywhere. Parse rate 0.0% by construction: it would contribute 494 rows with
 * no player to attribute them to. This is the VF5 "per-character showcases, no
 * pairings" failure repeating, and volume is exactly what makes it tempting to
 * re-add. It is not ranked last; it is out.
 *
 * Seven more channels were swept and left out as dormant or near-empty
 * (@tirnanogasukareplays 33 GGST, @ggstfraudgameplay 7, @ggstrivereplay 46,
 * @ggstfaustreplay 153, @ledsanreplays8225 83, @ggstreplays 6) or as player
 * channels whose GGST uploads are commentary and rank logs rather than records
 * (@nobodynemo, @churara, @away, @grandmastaj, @joystarkim, @siccombat — 100%
 * of their marked titles fail the shape gate).
 *
 * THE DEDUPE KEY IS `id` (the intake ChannelKey), never `source`. They are 1:1
 * today and the types are still kept distinct; types/index.ts carries the
 * reason. Briefly: the moment one physical channel starts publishing two kinds
 * of footage, keying dedupe on a shared public token means channel priority
 * silently never fires between the two while override protection leaks from one
 * channel's hand corrections to the other's, and both failures look exactly like
 * working dedupe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PRE_RELEASE } from './seasons';
import type { ChannelConfig } from '../types/index';

/** The uploads playlist is always 'UU' + channelId.slice(2). Pinned rather than
 *  looked up: it saves a quota unit per channel per run, and the id is stable
 *  where a handle is not. */
const uploads = (channelId: string) => `UU${channelId.slice(2)}`;

export const CHANNELS: ChannelConfig[] = [
  {
    id: 'ggHighLevel',
    source: 'ggHighLevel',
    name: 'GGST: High Level Gameplay',
    channelId: 'UC9yCvz0M2Fzcn6d3gb0v2dA',
    uploadsPlaylist: uploads('UC9yCvz0M2Fzcn6d3gb0v2dA'),
    // "GGST ▰ Jack (#1 Ranked Robo-Ky) vs Phaxy (#1 Ranked Testament). High
    //  Level Gameplay" — handle outside, character inside, and a leaderboard
    // position ("#1 Ranked", "TOP Ranked", "Day 1") in front of the character
    // that has to be stripped before the roster lookup. 50 of 50 sampled paren
    // groups resolve to exactly one roster character and 0 hold a handle;
    // 5,746 of 5,850 do over the whole corpus.
    //
    // Two thirds of the 104 that do not are ONE handle: `Lasagna Slayer`, 69
    // rows here alone, a player named after a fighter. That is the case
    // slotOrder decides — everywhere else the parser resolves by roster
    // membership and never has to choose an order.
    slotOrder: 'handle-outside',
    striveSignal: 'title',
  },
  {
    id: 'guiltyGearReplays',
    source: 'guiltyGearReplays',
    name: 'Guilty Gear Replays',
    channelId: 'UC02g4N_lH8coWbU80fzW21w',
    uploadsPlaylist: uploads('UC02g4N_lH8coWbU80fzW21w'),
    // "GGST | DarkLord (Sol Badguy) VS Dentran (Robo Ky) | Guilty Gear Strive
    //  High level gameplay" — 3,237 of 3,560 titles carry parens and 3,172
    // resolve. Note `SnowFight Bard(ABA)`, with no space before the bracket:
    // the paren rule survives it, a whitespace split does not.
    //
    // The 323 with no parens at all are a SECOND GRAMMAR that names no player;
    // its two biggest blocks are "I-No Perfect Round #ggst #gaming …" (191) and
    // "GGST | Anji VS Bridget #shorts …" (115). Those are misses, not records,
    // and must stay misses: both sides are characters and there is nobody to
    // attribute the match to.
    slotOrder: 'handle-outside',
    striveSignal: 'title',
  },
  {
    id: 'ggstBattleCollection',
    source: 'ggstBattleCollection',
    name: 'GGST Battle Collection',
    channelId: 'UCu8olUM72Dagi8E_BoJmPrQ',
    uploadsPlaylist: uploads('UCu8olUM72Dagi8E_BoJmPrQ'),
    // "GGST2.0➤Rank 1st SOL / ソル [ tatuma ] vs Rank 4th Jack-O' / ジャックオー
    //  [ APOLLO ] Guilty Gear" — character OUTSIDE, handle inside SQUARE
    // brackets. 2,359 of 3,375 carry brackets; 0 of those hold only a roster
    // name and 2,272 hold a handle.
    //
    // Three traps, all measured on this channel:
    //  · `GGST2.0` is its dominant spelling of the marker. See STRIVE_MARKER —
    //    `\bGGST\b` loses 1,003 of this channel's videos silently.
    //  · Both fields are bilingual, and independently so: characters as
    //    `SOL / ソル`, handles as `TAKASHI/タカシ`.
    //  · The handle `(ノ-_-)ノ` (3 of the sampled 50) puts ROUND parens INSIDE
    //    the square brackets. Any bracket regex that matches "the outermost
    //    bracket" without distinguishing `[` from `(` reads this as a slot.
    //
    // The 1,026 bracket-less titles are Japanese lab and stream-announcement
    // shorts ("まだ判定が強いメイHS", "GGST バトコレ配信 シンキスクです。"). They
    // are the largest single block of correct rejections in the intake.
    slotOrder: 'chars-outside',
    striveSignal: 'title',
  },
  {
    id: 'ggstHq',
    source: 'ggstHq',
    name: 'Guilty Gear Strive HQ',
    channelId: 'UCDWJJRvMmKhlnGbdx2MXZ5w',
    uploadsPlaylist: uploads('UCDWJJRvMmKhlnGbdx2MXZ5w'),
    // "Guilty Gear Strive 5.2 Seisei Happy Chaos VS PIETRO Slayer High Level
    //  Gameplay" — NO PUNCTUATION between handle and character anywhere. Only
    // 129 of 2,994 titles carry a bracket at all and the one in fifty that does
    // is "(OLD)", a note rather than a slot. This is CotW's `ffCotwReplays`
    // case exactly: there is no separator, so the roster span IS the boundary
    // and everything it does not cover is the handle. 2,788 of 2,994 resolve.
    //
    // Handle FIRST here, which is the opposite of CotW's `bestOfSnk`, and the
    // channel contradicts itself often enough to matter: "Hotashi Robo Ky VS
    // Zato Brian" writes side 2 character-first (the player is Brian). A span
    // parser survives that; a positional one swaps the record silently.
    //
    // It also writes its hashtags unseparated — "#ggst#guiltygear" — which is
    // why HASHTAG_RUN below must not require whitespace between tags.
    //
    // 2,864 of its 2,994 titles carry the vendor version ("5.2", "5.1", "2.0")
    // as a bare token. That is a free cross-check on date-derived patch
    // attribution and the only channel on any game here that offers one.
    slotOrder: 'handle-first-bare',
    striveSignal: 'title',
    // THE ONE CHANNEL WITH A DURATION FLOOR OF ITS OWN. Hydrated 2026-09-08:
    // 434 of its 2,994 uploads run under 120s and 434 of those are fully titled
    // matchups — YouTube Shorts, median exactly 60s. 242 are the only footage
    // of that matchup the channel ever posted. The platform default of 120 is
    // the measured clip boundary everywhere else and would drop 14.5% of this
    // channel silently; 30 keeps them and cuts only the 7 sub-30s stubs. The
    // card shows the duration, so nothing here pretends a Short is a set.
    // See types/index.ts minDurationSec and ggst-notes/hydration.md.
    minDurationSec: 30,
  },
  {
    id: 'ggstHighRank',
    source: 'ggstHighRank',
    name: 'GGST High Rank Replays',
    channelId: 'UCwgegz4TiPyse1HHqlIhRQA',
    uploadsPlaylist: uploads('UCwgegz4TiPyse1HHqlIhRQA'),
    // "GGST 🔥 #1 VENOM (Papaya) vs #2 I-NO (Daru_I-No) | High Level Gameplay"
    // — THE EXACT MIRROR of ggHighLevel: 1,280 of 1,486 titles carry parens,
    // 0 of them resolve to a roster character and 1,433 hold a handle. A single
    // "the character is inside the parens" rule would score 98.2% on channel 1
    // and 0.0% here, filing all 1,486 with player and fighter swapped — and
    // every one of them would look completely normal on the page. That pair is
    // the whole argument for slotOrder being per-channel config.
    //
    // Created 2026-02-06 and publishing 4.80 GGST/day, the fastest on this
    // game. Two shapes to survive: sponsor prefixes INSIDE the parens
    // ("SKB | Mafurako", "GGA | Kaelus" — see THEATER_SPONSOR; the `|` is not a
    // duo delimiter), and nested parens ("(Tsuku (PS5))"). An older bracket-less
    // shape appears deeper in its history at the same slot order, 5 titles:
    // "[GGST-REPLAY] #2 MAY Venom Snake vs TOP JACK-O Daimster".
    slotOrder: 'chars-outside',
    striveSignal: 'title',
  },
  {
    id: 'yumegiwa',
    source: 'yumegiwa',
    name: 'Yumegiwa Tournament Replays',
    channelId: 'UCH6fMEc6mptwnjp71tZa-lA',
    uploadsPlaylist: uploads('UCH6fMEc6mptwnjp71tZa-lA'),
    // The channel's own title is "GGST & GBVSR & Rev2 online tournament replay";
    // shortened for the badge because two thirds of that string names games this
    // site does not carry.
    //
    // "【わらわ（RoboKy ロボカイ）VS 筋肉質な骸骨（Ramlethal ラムレザル）】#ggst
    //  No.476 日曜から夜更し 🔥Ver2.1🔥Season5🔥" — handle outside, character
    // inside FULLWIDTH parens, same slot order as ggHighLevel with a different
    // glyph. 1,029 of 1,412 carry brackets, 995 resolve.
    //
    // THE ONLY MULTI-GAME INTAKE, and the sole reason the marker gate exists:
    // GGST 1,412 / GBVSR 960 / GG Xrd Rev2 328 on one uploads playlist. The two
    // Guilty Gear rosters overlap heavily, so an ungated Rev2 upload parses into
    // a Strive record that looks entirely normal. The game is an explicit token
    // in every title here, so a TITLE gate is sufficient — no description read
    // is needed on this channel or any other, which saves a videos.list
    // round-trip on the daily cron.
    //
    // Two structural traps: "）VS " has NO whitespace before the VS, so a
    // /\svs\s/ split returns zero matches on this channel (measured: 0.1% until
    // the split accepted a closing bracket as the left boundary); and the
    // character field carries both spellings at once ("Sol ソル") and sometimes
    // two characters ("Giovanna ABA ジオヴァーナ アバ"), a genuine counter-pick
    // on 69 titles.
    //
    // 403 of its uploads are tournament INDEX pages, not matches ("GGST JPN
    // on-line Tournament No483 日曜から夜更かし", digests, bracket-group pages).
    // Those are correct rejections. NOT `eventsOnly`: the footage is this
    // organiser's own weekly bracket, not a branded event archive, and an
    // event-brand requirement would file 995 real records as `not-an-event`.
    // The tournament corpus on this game lives in the index intake instead —
    // 7,184 tagged rows across 509 events.
    slotOrder: 'handle-outside',
    striveSignal: 'title',
  },
  {
    id: 'guiltyGearVods',
    source: 'guiltyGearVods',
    name: 'Guilty Gear VODs',
    channelId: 'UCW7c4MXEChXplHaI1PLle1g',
    uploadsPlaylist: uploads('UCW7c4MXEChXplHaI1PLle1g'),
    // "GGST ✪ YAMAMOTO (#1 Ranked Elphelt) VS DAISHOJI (#2 Ranked Dizzy) | GGST
    //  High Level Match Replay" — a grammar clone of ggHighLevel down to the
    // rank prefix, with a different decoration and uppercase handles. 142 of
    // 144 carry parens, 135 resolve. The smallest live intake at 0.13
    // uploads/day, which is why it sits last among the live channels: it loses
    // every cross-post tie, and 7 of its 144 are the handle-contains-a-roster-
    // name case that slotOrder settles.
    slotOrder: 'handle-outside',
    striveSignal: 'title',
  },
  {
    id: 'ggstLowLevel',
    source: 'ggstLowLevel',
    name: 'GGST Low Level Gameplay',
    channelId: 'UCrFZRXfLzfTovN0-XZdpBag',
    uploadsPlaylist: uploads('UCrFZRXfLzfTovN0-XZdpBag'),
    // THIS SHIPS FROZEN, which no sibling's frozen channel did on day one.
    // Last upload 2026-07-16, 53 days silent at the sweep, same operator family
    // as ggHighLevel (identical ▰/▶ decorations, same "Level Gameplay" suffix).
    //
    // "GGST Floor 1 ▶ Chipp vs Nagoriyuki . Low Level Gameplay" — 606 of its
    // 717 GGST titles name NO PLAYER AT ALL, and this is the one channel where
    // "the paren is the handle slot" is actively false: it puts a rank tier
    // there. "GGST ▶ Testament (Floor 1) vs Slayer (Floor 4)", "GGST ▶ Johnny
    // (F5) vs Sin Kiske (F3)" sit in the same year as "May (Facasma) vs Elphelt
    // (Starry)". Only 51 of 717 carry a bracket at all. Declared 'chars-only'
    // because that is what 96.5% of the corpus is; the handful of real records
    // resolve by roster membership like everywhere else.
    //
    // ── THE PIN IS A PLACEHOLDER AND MUST NOT BE COMMITTED AS ONE ──────────
    // `records` is hard-asserted against the committed data file, which is both
    // the source and the target of the carry, so a wrong pin poisons the next
    // run's reference permanently and silently. The true count cannot be known
    // until the first real parse: the recon's estimate is ~84 parseable of 717,
    // but that was a title-shape sketch with no duration or liveBroadcast data,
    // so it is not a pin.
    //
    // SHIPPING ORDER, and it is not optional: fetch and parse this channel ONCE
    // with the freeze lifted, commit the records it yields, read the count off
    // report.md, then set it here. -1 is deliberate — it can never equal a
    // carried count, so skipping that step throws on the first parse instead of
    // shipping an empty channel that looks like a working freeze.
    frozen: {
      since: '2026-07-16',
      reason: 'stopped publishing GGST on 2026-07-16; 96.5% of its titles name no player',
      records: -1,
    },
    slotOrder: 'chars-only',
    striveSignal: 'title',
  },
  {
    /**
     * THE INDEX SOURCE. replaytheater.app is a fan-curated match catalogue: it
     * hosts no video, it points AT video. See types/index.ts ChannelIndex for
     * the measurements that shaped this intake — briefly:
     *
     *   · 21,944 entries, the largest catalogue on the platform by a wide margin
     *     and 64% of all five prior catalogues combined. 7,184 are TAGGED
     *     tournament segments across 509 event tags (98.6% carry a t= offset);
     *     14,760 are UNTAGGED, mostly one entry per whole video (9.9% carry an
     *     offset). Both arms are load-bearing, so the record id follows the
     *     ENTRY: `${videoId}@${startSeconds}` when there is a real offset, the
     *     plain YouTube id when there is not.
     *   · 77.70% of its 14,928 videos are already ours, with RT's upload_date
     *     equal to the VOD's publishedAt on 97.27% of overlapping rows. On the
     *     overlap it is a near-dependent witness — it agrees because it read the
     *     same title — so character agreement measured against it carries that
     *     caveat rather than counting as verification.
     *   · 9.20% of rows point at videos that no longer resolve, and unlike CotW
     *     that is NOT age-graded decay: 2025 reads 0.23% and 2023 reads 34.63%,
     *     the deaths sit entirely outside the tracked-channel corpus (0 dead of
     *     1,571 sampled overlap rows) and cluster in contiguous id blocks. It is
     *     a per-match channel that submitted its back catalogue and later
     *     deleted it. Re-measure at ingest; do not pin the number.
     *
     * NO channelId, NO uploadsPlaylist, NO striveSignal: there is no channel and
     * no title to gate. The game is checked per ENTRY against `gameLabel`,
     * because ?game= is a filter the catalogue answers, not one we control —
     * 21,944 of 21,944 pass today.
     */
    id: 'replayTheater',
    source: 'replayTheater',
    name: 'Replay Theater',
    index: {
      endpoint: 'https://replaytheater.app/api/matches',
      // THEIR slug, not ours. `?game=ggst` returns HTTP 400 "Invalid game", as
      // do `gg`, `guiltygear` and `ggs`. Probed 2026-09-07.
      slug: 'strive',
      gameLabel: 'Guilty Gear -Strive-',
      pageSize: 50,
      pacingMs: 1200,
      admitUntagged: true,
    },
    cronFetchedWithCarry: true,
    // Inert, and declared anyway because the type requires a value for every
    // intake: this source parses no title. Its records are built from the
    // catalogue's discrete p1_name/p1_char fields and its title is SYNTHESIZED
    // from them, in "HANDLE (Char) vs HANDLE (Char)" shape — so 'handle-outside'
    // is the one value that does not make the report's per-channel slot-order
    // mix describe a title shape that does not exist.
    slotOrder: 'handle-outside',
    // The catalogue's oldest Strive rows are 2020-04-18, FOURTEEN MONTHS before
    // the 2021-06-11 launch. Measured from the catalogue tail 2026-09-07:
    // 221 pre-launch rows in three runs, separated by gaps of 174 and 122 days
    // where every other gap is <= 28 — the April 2020 closed beta (81 rows), an
    // isolated October 2020 build (3), and the 2021 run from the February open
    // beta through the May second beta to launch (137). scripts/seasons.ts
    // carries a date-token patch row for each, because a season is not a patch
    // and emit throws on a record whose patch no boundary accounts for.
    //
    // On the 84 this supersedes: recon/replay-theater-live.md:203 counts only the 2020 builds
    // (81 April + 3 October = 84) and scopes its sentence to them; the 2021
    // Feb–Jun run adds 137 more. Its 439-page sweep was complete and matched
    // total_count exactly — the number was narrower, not wrong.
    //
    // IMPORTED, not a literal, so this floor and the era that has to cover it
    // cannot drift apart. A floor earlier than seasons.ts's pre-release era
    // admits records with no patch token, and emit throws on those — loudly,
    // which is right, but the coupling is better expressed than discovered.
    preReleaseFrom: PRE_RELEASE,
  },
];

export const CHANNEL_BY_ID = new Map(CHANNELS.map((c) => [c.id, c]));

/**
 * THE GAME-MARKER GATE (checklist step 3).
 *
 * ── WHY IT EXISTS HERE, WHICH IS NARROWER THAN ON CotW ──────────────────────
 * Seven of the eight intake channels are single-game at 99.0–100%. ONE is not:
 * yumegiwa publishes GGST 1,412 / GBVSR 960 / GG Xrd Rev2 328 on one uploads
 * playlist. The Granblue uploads name characters no Strive roster lookup will
 * resolve, but the 328 Xrd Rev2 uploads name Guilty Gear characters — the two
 * rosters overlap heavily — so without this gate they become Strive records
 * that look entirely normal. That is CotW's KOF XV lesson on a different game.
 *
 * ── THREE CORRECTIONS CotW's MARKER DID NOT NEED ────────────────────────────
 * 1. `GGST(?![A-Za-z])`, NEVER `\bGGST\b`. "GGST2.0", "GGST5.2" and "ggst2.0"
 *    are the dominant spelling on ggstBattleCollection and common on ggstHq, and
 *    `\b` does not fire between "T" and "2" because both are word characters.
 *    Measured: word-boundary matching loses 1,003 videos — 4.6% of the corpus —
 *    and loses them silently, as a channel that simply looks smaller than it is.
 *
 * 2. STRIVE IS THE MARKER; "GUILTY GEAR" IS NOT. The series is 27 years old and
 *    its back catalogue is live on these channels. Matching the series name
 *    reads 576 non-Strive uploads (328 Xrd Rev2 on yumegiwa alone, 123 on the
 *    rejected ASG, 94 on nobodyNemo, 31 on churara). The same rule applies to
 *    the Japanese and Korean series names: bare ギルティギア tails every lab
 *    short on ggstBattleCollection as a hashtag, and bare 길티기어 is likewise
 *    just "Guilty Gear".
 *
 * 3. STRIP THE TRAILING HASHTAG RUN FIRST, and the run pattern must NOT require
 *    whitespace between tags — ggstHq writes "#ggst#guiltygear" unseparated, and
 *    a run regex that demands a space stops at the first pair and leaves the
 *    marker decorating a title that never stated the game in prose. The reason
 *    for stripping is CotW's: the marker must be LOAD-BEARING in the title, not
 *    decorative in a run. "JIG｜ナゲ ファウストやり込みコンボ #ggstfaust
 *    #onlinetournament #ggst #arcsystemworks" is a Faust combo clip, not a
 *    match, and its only #ggst is in the run.
 *
 *    This does not blind the gate on yumegiwa, which is the channel that needs
 *    it: yumegiwa writes "#ggst" MID-title ("…】#ggst  No.476 日曜から夜更し"),
 *    so its 1,412 records survive the strip while its GBVSR and Rev2 uploads
 *    still fail the token test.
 *
 *    EXPECT THE PER-CHANNEL MARKED COUNTS TO READ BELOW THE RECON'S. The sweep
 *    counted a hashtag-run "#ggst" as a marker and this gate does not, so a
 *    title whose only marker is in the run — much of ggstBattleCollection's
 *    1,052 Japanese lab shorts — now fails HERE instead of failing the shape
 *    check later. That is a reclassification between two miss columns, not a
 *    loss: none of those titles was ever parseable into a record.
 *
 * ── WHITESPACE, AND WHY IT IS LOAD-BEARING FOR A DIFFERENT REASON THAN CotW ──
 * All 56,951 titles were scanned for every non-ASCII Zs/Cf/Zl/Zp codepoint.
 * U+202F — CotW's carrier — DOES NOT OCCUR AT ALL, nor do U+200B, U+FEFF,
 * U+2060, U+200C/D, U+00AD or the direction marks. Do not carry CotW's sentence
 * over. What occurs is:
 *   · U+3000 IDEOGRAPHIC SPACE, 547 occurrences in 463 titles (yumegiwa,
 *     ggstBattleCollection), sitting at the HASHTAG-RUN BOUNDARY — so the run
 *     pattern must use `\s`, never a literal space. JS `\s` matches U+3000.
 *   · U+00A0 NO-BREAK SPACE, 4 occurrences in 2 titles on ggstLowLevel, and it
 *     sits INSIDE THE GAME MARKER: "Guilty<U+00A0>Gear<U+00A0>Strive".
 * The marker below survives that because STRIVE is its own branch and never
 * part of a multi-word literal. Anyone "simplifying" it into a
 * /Guilty Gear Strive/i phrase would both re-admit the 27-year back catalogue
 * and miss those two titles; where the marker does contain a space, it is `\s*`
 * for the same reason.
 */
const HASHTAG_RUN = /(?:^|\s)#[\p{L}\p{N}_]+(?:\s*#[\p{L}\p{N}_]+)*\s*$/u;

/** Remove the trailing hashtag block, repeatedly (a title can end in several
 *  runs separated by other punctuation). */
export function stripHashtagRun(title: string): string {
  let out = title.trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(HASHTAG_RUN, '').trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

/** The Strive subtitle in the spellings the corpus actually uses. Deliberately
 *  NOT the series name, in any script.
 *
 *  The Korean branch is here for a hangul subtitle; the one Korean-language
 *  uploader the sweep found writes it in Latin ("길티기어 STRIVE 2026 08 17 이노
 *  랭크 01"), which the STRIVE branch already catches. Bare 길티기어 is not a
 *  branch, for the same reason "GUILTY GEAR" is not. */
export const STRIVE_MARKER =
  /(?<![A-Za-z])GGST(?![A-Za-z])|STRIVE(?![A-Za-z])|ギルティギア\s*ストライ[ヴブ]|길티기어\s*스트라이브/iu;

/** Does this text carry a load-bearing Strive marker? */
export function hasStriveMarker(text: string): boolean {
  return STRIVE_MARKER.test(stripHashtagRun(text ?? ''));
}

/** Channels the daily fetch actually contacts, and the channels whose records
 *  are built by a TITLE PARSE — the two happen to be the same set.
 *
 *  A frozen channel is skipped: its committed records are carried forward
 *  byte-stable by parse, which also hard-asserts the pinned count. UNLIKE EVERY
 *  SIBLING, that branch has a live consumer on day one — ggstLowLevel stopped
 *  publishing 2026-07-16 — so the mechanism is exercised by the first real run
 *  rather than waiting years to be needed for the first time.
 *
 *  An INDEX source is skipped for a different reason: it has no channel to fetch
 *  and no title to parse, and its records are built by their own function. Note
 *  both are still in CHANNELS, so the collapse guard and the report still see
 *  them; only these two jobs skip them. */
export const ACTIVE_CHANNELS = CHANNELS.filter((c) => !c.frozen && !c.index);

/**
 * Sponsor/team prefix on a handle: "SKB | Mafurako", "GGA | Kaelus",
 * "AHS | Crantum", "OEG | Lovebound". STRIPPED, never split — "|" is not a duo
 * delimiter here, and treating it as one would mint a player called "SKB" with a
 * page of its own. 156 catalogue handles carry one, and so do titles on
 * ggstHighRank, which writes the prefix INSIDE the character's paren group.
 *
 * APPLIED REPEATEDLY, and that is not defensive coding: doubly-prefixed handles
 * exist, and a single .replace() leaves a handle that still CONTAINS a sponsor
 * tag — a worse outcome than not stripping at all, because the minted player
 * looks like a real name rather than an obvious mistake. Loop until stable.
 *
 * The fullwidth "｜" is included where CotW's is ASCII-only: this corpus uses it
 * as a sponsor separator too ("JIG｜ナゲ" on yumegiwa).
 */
export const THEATER_SPONSOR = /^[^|｜]{1,12}\s*[|｜]\s*/;

export const stripTheaterSponsor = (handle: string): string => {
  let out = handle.trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(THEATER_SPONSOR, '').trim();
    if (next === out || next === '') break;
    out = next;
  }
  return out;
};

/*
 * THERE IS NO `playerSep`, AND ADDING ONE WOULD DESTROY REAL DATA.
 *
 * 2XKO splits duo handles on /\s*[/&+]\s*|\s+-\s+/. Strive is 1v1, the
 * catalogue's p1_name/p2_name are already one player each, and that separator
 * would shred handles this corpus actually contains: `t.tv/WhispCL`,
 * `ttv/pedrito_ky`, `KingAfrica4/ttv`, `jeonaru/Jonaru`, `K/UE`, `spat/pan`,
 * `fairie/varus D:` — 12 handles with "/", one with " - ", one with "&". Every
 * one would become two players, and both halves would look like plausible
 * names. The bilingual handles on ggstBattleCollection ("TAKASHI/タカシ",
 * "GOBOU/御傍") are the same handle twice, not two players, and would split the
 * same way.
 */
