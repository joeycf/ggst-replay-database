/**
 * Shared roster vocabulary — text normalization, SPAN EXTRACTION, player ids —
 * plus the vendor-facing half: the scrape that re-checks Arc System Works'
 * own site against what we committed.
 *
 * ── NORMALIZATION RUNS BEFORE ANYTHING ELSE, AND STRIVE'S SET IS NOT CotW's ─
 * CotW's module folds the codepoints CotW measured. Carrying that list over
 * unexamined would have shipped a fold for a character this corpus does not
 * contain and no fold for the ones it does. The live scan of all 56,951 GGST
 * titles (recon/critic.md, 2026-09-07) found:
 *   · U+202F NARROW NO-BREAK SPACE — ZERO. It is CotW's whole story (333
 *     occurrences) and it does not occur here once.
 *   · U+200B/U+FEFF/U+2060/U+200C/U+200D/U+00AD/U+2009/U+2007/U+205F/U+1680/
 *     U+180E/U+200E/U+200F/U+061C — all ZERO.
 *   · U+3000 IDEOGRAPHIC SPACE — 547 occurrences across 463 titles, sitting at
 *     the hashtag-run boundary. This is the one that matters here.
 *   · U+00A0 — 4 occurrences in 2 titles, and it sits INSIDE the game marker
 *     ("Guilty Gear Strive"), so a marker written with a literal space misses
 *     both of them.
 * The index intake carries the same shape: 10 U+3000 in `tag` and 1 in
 * `p2_name` ("ギルティギア<U+3000>ストライブ…"), and nothing else invisible across all
 * 15 fields of all 21,944 rows (recon/replay-theater-live.md §9).
 *
 * The zero-width and narrow-space classes are kept anyway. They cost one regex
 * pass and they are the classes that arrive with the next uploader, not with
 * this week's corpus — and their absence today is exactly why nobody would
 * think to add them later.
 *
 * WHERE IT BITES IS NOT THE REGEXES. Both JS and Python spell `\s` to include
 * U+3000, so a regex-boundary parser is already immune. The damage is in
 * EXACT-STRING work: `playerId()` mints a second player page for one person,
 * a Map keyed on the literal alias misses, `title.split(' ')` under-tokenises.
 * So a positive control for this must exercise IDENTITY, not the parse rate —
 * a control that only asks "does it still parse" passes on a pipeline with no
 * normalization at all. (CotW reported that upstream and then shipped 24 gates
 * with no normalization control; see recon/orientation-precedents.md §394.)
 *
 * ── FULLWIDTH IS A STRIVE PROBLEM AND IT IS FOLDED ARITHMETICALLY ──────────
 * Measured handles on the intake: `Sol＝Low tier` (U+FF1D), `400＆8th
 * Anniversary` (U+FF06), `JIG｜ナゲ` (U+FF5C, a sponsor separator), `Yato＿ｍきｎ`
 * (U+FF3F plus fullwidth Latin letters). Arc System Works' own JP page writes
 * Asuka as `飛鳥＝R♯` and Bedman as `ベッドマン？` (U+FF1F).
 * Without a fold, `Ｙａｔｏ` slugs to "" and the whole handle disappears; with
 * blanket NFKC we would also lose the halfwidth-katakana distinction and every
 * compatibility form we never measured. So the fold is the FULLWIDTH FORMS
 * block only, U+FF01–U+FF5E → codepoint − 0xFEE0, which is exactly the
 * fullwidth mirror of printable ASCII and nothing else. Halfwidth katakana
 * (U+FF61–U+FF9F) is deliberately NOT folded: it needs composition rather than
 * arithmetic, and the 56,951-title scan found none of it.
 *
 * ── THE APOSTROPHE FOLD IS ARC SYSTEM WORKS' OWN INCONSISTENCY ────────────
 * The character page's `<h1>` is `JACK-O'` with U+0027; the Ver 1.09 patch-note
 * prose on the same domain writes `Jack-O’` with U+2019. Both are first-party,
 * both are in our inputs, and uploaders use both plus `Jacko` and `Jack O`.
 * U+2019 → U+0027 before anything compares strings.
 *
 * ── CHARACTER MATCHING IS SPAN EXTRACTION, NEVER A SEPARATOR SPLIT ─────────
 * Checklist 5c. Strive needs it for a reason CotW did not have: two of the
 * eight intake channels put the character and the handle in the same segment
 * with no separator worth splitting on (`#3 LEO averageSKcitizen`, and
 * ggstHq's bracket-free `Handle Character vs …` on 2,865 of 2,994 titles), and
 * a `[/-.]` split shreds `I-No`, `Jack-O'`, `A.B.A`, `Robo-Ky` and `Zato=1`
 * into halves that half-resolve rather than failing cleanly.
 *
 * The safety net is the RESIDUE GATE (scripts/parse.ts): whatever text no span
 * covered is reported verbatim with a count, so a new nickname, an uploader's
 * typo, or a Season 5 fighter nobody has named yet surfaces as a counted line
 * instead of vanishing into a silently shorter side. On this game the residue
 * gate is not a nicety — it is the ONLY automatic detector for a new character,
 * because both remaining S5 slots are literally `???` on the vendor's own store
 * page and the UNRELEASED table therefore ships empty (see scripts/characters.ts
 * and `--scrape` below).
 *
 * Run the vendor check: `npx tsx scripts/roster.ts --scrape [--names]`
 * (there is no npm script for it — package.json was frozen before this file
 * existed; add `data:roster` when it next opens.)
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CharacterRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Space-like characters that are not U+0020, folded to a plain space.
 *
 * WRITTEN AS ESCAPES, NEVER AS LITERALS. The whole point of this list is that
 * these characters are invisible, so a diff adding or removing a literal one
 * shows nothing at review. ESLint's no-irregular-whitespace rule flags the
 * literal form for the same reason.
 */
const SPACE_LIKE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
/**
 * IN-WORD hyphens, folded to ASCII '-'.
 *
 * Five roster names carry a real hyphen (`I-No`, `Jack-O'`, `Robo-Ky`, and via
 * the alias table `Zato-1`, `Asuka R#`), so a non-ASCII hyphen inside one of
 * them makes the alias matcher miss and the character read as absent. On CotW
 * that exact miss cost 18 records before anyone noticed, and it was cheap to
 * find only because the miss was visible rather than wrong.
 *
 * The em and en dashes are deliberately NOT here. They are SEPARATORS in these
 * titles (`Handle - Character vs …`, `… - GGST High Level Gameplay`), and
 * folding a separator into a name merges two spans that were never one.
 *
 * U+FF0D FULLWIDTH HYPHEN-MINUS is not here either, and its absence is not an
 * omission: the fullwidth fold above already turned it into an ASCII '-' two
 * lines earlier. Re-adding it would be a branch that can never fire.
 */
const IN_WORD_HYPHEN = /[\u2010\u2011\u2012\u2212\uFE63\u00AD]/g;
/** Zero-width and directional marks, deleted outright — they are not spaces and
 *  folding them to one would split a word that was never split. */
const ZERO_WIDTH = /[\u200B-\u200F\u2060\uFEFF\u061C\u180E]/g;
/** FULLWIDTH FORMS of printable ASCII. Arithmetic, so the reviewable claim is
 *  the range and the offset rather than a hand-typed table nobody can check. */
const FULLWIDTH = /[\uFF01-\uFF5E]/g;
/** RIGHT SINGLE QUOTATION MARK → APOSTROPHE. See the header: ArcSys ships both
 *  spellings of Jack-O' on the same domain. */
const CURLY_APOSTROPHE = /\u2019/g;

/**
 * NFC + fullwidth fold + space folding + zero-width removal + collapse.
 *
 * NFC FIRST, and it matters beyond the spaces: Japanese uploaders write with
 * both precomposed and decomposed dakuten (`ヴ` is U+30F4 or U+30A6+U+3099),
 * and a Map keyed on one spelling misses the other silently. Venom is `ヴェノム`
 * on the bilingual channel, so this is not hypothetical.
 *
 * WHAT THIS COSTS: the stored title and the displayed handle lose their
 * fullwidth glyphs (`Ｙａｔｏ＿ｍきｎ` renders as `Yato_mきn`). That is the
 * deliberate trade — one canonical spelling per person beats a prettier string
 * on a page nobody can find because it was minted twice.
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .replace(FULLWIDTH, (c) => String.fromCodePoint(c.codePointAt(0)! - 0xfee0))
    .replace(CURLY_APOSTROPHE, "'")
    .replace(SPACE_LIKE, ' ')
    .replace(IN_WORD_HYPHEN, '-')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function loadCharacters(): Promise<CharacterRecord[]> {
  const raw = await readFile(join(ROOT, 'data', 'characters.json'), 'utf8');
  const characters = JSON.parse(raw) as CharacterRecord[];
  if (characters.length === 0) {
    throw new Error('data/characters.json is empty — run `npm run data:characters` first.');
  }
  return characters;
}

/**
 * The lookup key an alias and a matched literal share.
 *
 * KEEPS EVERY UNICODE LETTER. CotW's version is
 * `.toLowerCase().replace(/[^a-z0-9]/g,'')`, and porting that verbatim would
 * have been this file's worst bug: a third of this roster's aliases are
 * Japanese (`ソル`, `名残雪`, `ベッドマン`, `紗夢`…), every one of them keys to the
 * EMPTY STRING under an [a-z0-9] filter, and a Map keyed that way keeps only
 * the last writer. Every Japanese-language title would then have resolved to
 * whichever character happened to sit last in the table — confidently, with no
 * error anywhere.
 *
 * scripts/characters.ts asserts alias uniqueness through THIS function, not a
 * lookalike of its own: a validator that normalises differently from the
 * matcher passes while the matcher collides.
 */
export const aliasKey = (s: string): string =>
  normalizeText(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

export interface AliasMatch {
  id: string;
  /** [start, end) span of the alias inside the searched text. */
  start: number;
  end: number;
  /** The literal text that matched, for the residue report and for telemetry. */
  literal: string;
}

export interface AliasMatcher {
  /** All character matches in the text, longest-alias-first, overlaps
   *  suppressed — so "Robo-Ky" absorbs the inner "Ky", and "Sin Kiske" is never
   *  seen as "Ky Kiske" with a stray "Sin". */
  find(text: string): AliasMatch[];
  /** Ordered, de-duplicated ids — the union a side fielded, first appearance
   *  first, which is exactly the engine's `Side.characters` contract. */
  ids(text: string): string[];
  /** The single character a fragment names, or null when it names zero or 2+. */
  one(text: string): string | null;
  /** The characters of `text` that no span covered and that are not ordinary
   *  separator punctuation or known decoration. Non-empty residue is a report
   *  line, never a silent drop. */
  residue(text: string): string;
  /** Every alias key, for gates and for the report. */
  aliasCount: number;
}

/**
 * Punctuation and decoration that is never part of a handle or a name, so its
 * presence in the residue means nothing. Kept narrow on purpose: the residue
 * gate is only useful if it still reports real words.
 *
 * The `ggst[\d.]*` term is separate from the `\b`-anchored group and that is
 * checklist 5l's lesson in miniature: `GGST2.0` is the dominant spelling on
 * ggstBattleCollection, and `\bggst\b` does not match inside it because `T`/`2`
 * is not a word boundary.
 *
 * The CJK terms are also outside the `\b` group. JS spells `\b` off `\w` =
 * [A-Za-z0-9_], so `\bギルティギア\b` can never match — a CJK stopword written
 * inside the anchored group is dead text that looks like it works.
 */
const RESIDUE_NOISE = new RegExp(
  [
    'ggst[\\d.]*',
    'ギルティギア|ストライブ|対戦|配信|ランクマ|動画|練習|コンボ',
    '\\b(?:strive|guilty|gear|vs|versus|ft|feat|and|the|de|la|el|a|an|of|match|matches|' +
      'replay|replays|gameplay|high|low|mid|level|rank|ranked|ranking|rankings|floor|celestial|' +
      'online|offline|set|sets|day|round|rounds|perfect|combo|combos|guide|guides|training|lab|' +
      'season|dlc|patch|update|ver|version|new|full|best|top|pro|player|players|' +
      'tournament|tourney|final|finals|grand|semi|winners|losers|pools|bracket|evo|arcrevo|' +
      'hd|4k|1080p|60fps|shorts|short|live|stream|clip|clips|highlight|highlights|old)\\b',
    '[^\\p{L}\\p{N}]+',
    // The ordinal suffix has to be part of the NUMBER term, not a word in the
    // \b-anchored group: replacement is progressive but the boundaries are
    // evaluated against the original string, so there is no \b between "3" and
    // "rd" and the rank marker "Rank 3rd" reported a nickname "rd".
    '\\d+(?:st|nd|rd|th)?',
  ].join('|'),
  'giu',
);

/**
 * Build the matcher.
 *
 * LONGEST-FIRST IS THE WHOLE CORRECTNESS ARGUMENT, and this roster is the one
 * that proves it. Aliases are sorted by length descending and compiled into one
 * alternation; the scan then takes non-overlapping matches left to right.
 * Without that ordering `Ky` wins inside `Robo-Ky` and inside `Ky Kiske`, and
 * `Sin` wins inside `Sin Kiske` — two of those resolve to the WRONG character.
 * The trailing `(?![\p{L}\p{N}])` guard makes the mid-word case impossible
 * independently; the ordering makes the whole class impossible.
 *
 * THE BOUNDARY GUARDS COST US UNDELIMITED JAPANESE, KNOWINGLY. Kana are
 * `\p{L}`, so `メイ` inside `まだ判定が強いメイHS` does not match: Japanese does
 * not space its words and a lookaround cannot segment them. The alternative —
 * dropping the guard for non-Latin aliases — makes `イノ` fire inside `イノシシ`,
 * and a false character is worse than a miss because the miss is REPORTED.
 * Measured cost: the undelimited-Japanese titles are lab shorts and stream
 * announcements, which are 1,052 of ggstBattleCollection's misses and are
 * correct rejections either way (recon/channels-live.md §5a). The one channel
 * that writes Japanese names in a character slot delimits them —
 * `VENOM / ヴェノム [ Lasagna Slayer ]` — and those resolve.
 */
export function buildAliasMatcher(characters: CharacterRecord[]): AliasMatcher {
  const pairs: { alias: string; id: string }[] = [];
  for (const c of characters) {
    const aliases = (c.extra?.aliases as string[] | undefined) ?? [];
    // Normalised at BUILD time, because the text side is normalised at match
    // time. `ベッドマン？` and `飛鳥＝R♯` are written here in ArcSys' own fullwidth
    // spelling and must be compiled in the folded form or they never fire.
    for (const a of [c.name, ...aliases]) pairs.push({ alias: normalizeText(a), id: c.id });
  }
  pairs.sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias));

  // A literal alias becomes a pattern in which every run of the punctuation
  // below matches any amount of it, including none. One entry for `A.B.A` then
  // covers `ABA`, `A B A`, `A-B-A` and `A.B.A.`; one for `Robo-Ky` covers
  // `RoboKy` and `Robo Ky`; one for `Jack-O'` covers `Jacko`, `Jack O` and
  // `Jack-O`; one for `Zato-1` covers `Zato1` and ArcSys' own `Zato=1`; and one
  // for `Asuka R#` covers `Asuka R♯` and the bare `Asuka R`. That is why the
  // alias list enumerates SPELLINGS, never spacing or punctuation variants.
  //
  // `*` rather than a bounded repeat is safe only because normalizeText has
  // already collapsed whitespace runs — do not remove one without the other.
  const FLEXIBLE = /[.?\-\s'=#\u266F\u30FB]/;
  const flex = (a: string) =>
    a
      .split('')
      .map((ch) =>
        FLEXIBLE.test(ch)
          ? "[.?\\-\\s'=#\\u266F\\u30FB]*"
          : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('');
  const RE = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${pairs.map((p) => flex(p.alias)).join('|')})(?![\\p{L}\\p{N}])`,
    'giu',
  );
  const byKey = new Map<string, string>();
  for (const p of pairs) byKey.set(aliasKey(p.alias), p.id);

  const resolve = (literal: string): string | undefined => byKey.get(aliasKey(literal));

  const find = (text: string): AliasMatch[] => {
    const t = normalizeText(text);
    const out: AliasMatch[] = [];
    RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE.exec(t)) !== null) {
      const id = resolve(m[0]);
      if (id) out.push({ id, start: m.index, end: m.index + m[0].length, literal: m[0] });
      // The flexible-punctuation class is `*`, so a pathological alias could
      // match empty and spin the cron forever. characters.ts refuses such an
      // alias; this guard is what makes that refusal non-load-bearing.
      if (m[0].length === 0) RE.lastIndex += 1;
    }
    return out;
  };

  const ids = (text: string): string[] => {
    const seen: string[] = [];
    for (const m of find(text)) if (!seen.includes(m.id)) seen.push(m.id);
    return seen;
  };

  return {
    find,
    ids,
    one: (text) => {
      const found = ids(text);
      return found.length === 1 ? found[0]! : null;
    },
    residue: (text) => {
      const t = normalizeText(text);
      const spans = find(t);
      let prev = 0;
      const gaps: string[] = [];
      for (const s of spans) {
        gaps.push(t.slice(prev, s.start));
        prev = s.end;
      }
      gaps.push(t.slice(prev));
      return gaps.join(' ').replace(RESIDUE_NOISE, ' ').replace(/\s+/g, ' ').trim();
    },
    aliasCount: byKey.size,
  };
}

/**
 * Slug a handle into a stable player id — the PUBLIC id, and the URL.
 *
 * NORMALIZED FIRST: this is the function the invisible-space and fullwidth
 * findings in the header are really about. `Sol＝Low tier` and `Sol=Low tier`
 * are one person and must be one page.
 *
 * THE NON-LATIN FALLBACK IS TŌKON'S, AND STRIVE NEEDS IT FAR MORE THAN TŌKON
 * DID. The ASCII path strips to [a-z0-9] and returns "" for a handle written
 * entirely in another script. Tōkon had one such player (`シルクちゃん`, record
 * LxwV1YO7eGE) and shipped `{"id": "", "handle": "シルクちゃん"}` into
 * data/players.json, which seeded a prerender route for `/players/` that
 * collided with the index. CotW and SF6 answer that by dropping the record.
 * On this corpus dropping is not a rounding error: Japanese-only handles are
 * routine here (`[ ユニカ ]`, `こん@メイ`, `シルクちゃん`), and one intake channel
 * is bilingual by design. So the empty case falls back to Unicode letters and
 * digits — combining marks first, since NFKD splits them out and a bare
 * combining mark is not `\p{L}`.
 *
 * Applied ONLY when the ASCII slug is empty, so no Latin id ever moves. The
 * price is a MIXED-script handle: `Ｙａｔｏ＿ｍきｎ` slugs to "yato-m-n" and loses its
 * one kana, because the ASCII path is non-empty and wins. That is the right
 * trade — the alternative moves every existing Latin id the day a kana appears
 * in one. A handle that is pure punctuation still returns "" and must still be
 * refused at parse: `!playerId(h)` is the check, on the SLUG rather than on the handle,
 * because an all-CJK handle is a perfectly good 6-character string.
 */
export function playerId(handle: string): string {
  const nfkd = normalizeText(handle).normalize('NFKD').toLowerCase();
  const ascii = nfkd.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (ascii) return ascii;
  return nfkd
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Players whose handle contains a fighter's name ON PURPOSE — the allow-list
 * for checklist 5n, asserted by scripts/characters.ts.
 *
 * WHY THIS EXISTS. The guard says no player-registry entry may collide with a
 * roster name, because the failure it prevents is a fighter filed as a person:
 * `GGST | chocoservant (Jam) VS Johnny (Johnny)` files a player called
 * "Johnny", and `GGST➤Rank 3rd UNIKA / ユニカ [ ユニカ ]` files a player called
 * "UNIKA / ユニカ". Sixty-seven live titles were parsed CONFIDENTLY WRONG that
 * way and 215 more were rejected for the same ambiguity
 * (recon/channels-live.md §4/§5).
 *
 * WHY IT NEEDS AN ALLOW-LIST RATHER THAN A BAN. Strive's playerbase names
 * itself after the roster more than any sibling's: `Lasagna Slayer` alone has
 * 69 rows on ggHighLevel and 51 more as the typo `Lasanga Slayer` on
 * ggstHighRank. Those are real people. A guard with no exemptions would fail
 * every run; a guard with a blanket exemption catches nothing.
 *
 * WHY IT RUNS THROUGH THE ALIAS MATCHER. The only implementation on the
 * platform (tokon/scripts/e2e.ts:341-350) compares `c.name.toLowerCase()` — a
 * plain name set. Under this roster's full-name ids `c.name` is "Sol Badguy",
 * so a player literally called "SOL" is not caught, and it runs after
 * `npm run generate`, by which time the bad data is on disk. Ours compares
 * through the matcher (punctuation-flexible, alias-expanded, longest-first) and
 * runs in the roster build, before anything is written.
 *
 * EVIDENCE IS A VIDEO ID, one per entry, and it is the point of the row: the
 * claim being made is "a human watched this and it is a person, not a fighter".
 * TODO: every `video: null` below is seeded from the recon's title samples and
 * must be replaced with the id of a real record the first parse produces —
 * recon/channels-live.md quotes the titles but not their video ids. An entry
 * that still has no evidence after the first parse is a guess, and the console
 * output names them so they cannot go quiet.
 *
 * Note `johnny` and `may`: the player id and the character id are the same
 * string. That is not a defect — /players/johnny and /characters/johnny are
 * different routes and CotW already ships the same collision (`mr-karate`) —
 * but it is the reason this file, and not a shared id namespace, is where the
 * two are reconciled.
 */
export interface ConfirmedFighterNamedPlayer {
  /** playerId() of the handle, i.e. the id the registry will carry. */
  id: string;
  /** The handle as the uploader spells it, for the reviewer's eyes. */
  handle: string;
  /** A record whose footage confirms this is a person. null = not yet checked. */
  video: string | null;
  note: string;
}

export const CONFIRMED_FIGHTER_NAMED_PLAYERS: ConfirmedFighterNamedPlayer[] = [
  {
    id: 'lasagna-slayer',
    handle: 'Lasagna Slayer',
    video: null,
    note: '69 rows on ggHighLevel plus 51 as the typo "Lasanga Slayer" on ggstHighRank; plays Goldlewis, Venom and Happy Chaos, not Slayer.',
  },
  {
    id: 'lasanga-slayer',
    handle: 'Lasanga Slayer',
    video: null,
    note: 'The same person as lasagna-slayer, spelled the way ggstHighRank writes them. Left as a separate row deliberately — merging two handles is scripts/parse.ts’ job and needs its own evidence.',
  },
  {
    id: 'leo-whatsapp',
    handle: 'Leo Whatsapp',
    video: null,
    note: '10 rows. Contains the whole of "Leo", so the span matcher covers the fighter name exactly.',
  },
  {
    id: 'zato-van',
    handle: 'Zato-VaN',
    video: null,
    note: '13 rows across the spellings Zato-VaN / Zato-2 / "Zato - 2".',
  },
  { id: 'zato-2', handle: 'Zato-2', video: null, note: 'See zato-van.' },
  {
    id: 'sol-low-tier',
    handle: 'Sol＝Low tier',
    video: null,
    note: 'Fullwidth U+FF1D in the handle; folded to "sol-low-tier" by playerId(). Filed as the PLAYER on a ggstBattleCollection title whose bracket is the handle slot.',
  },
  { id: 'sol-mugi', handle: 'SOL mugi', video: null, note: 'ggHighLevel.' },
  { id: 'millia-thighs', handle: 'Millia Thighs', video: null, note: 'ggHighLevel.' },
  { id: 'bbl-dizzy', handle: 'BBL Dizzy', video: null, note: 'ggHighLevel.' },
  { id: 'axl-the-grappler', handle: 'Axl The Grappler', video: null, note: 'ggHighLevel.' },
  { id: 'sabamiso-bedman', handle: 'Sabamiso bedman', video: null, note: 'ggHighLevel.' },
  { id: 'unika-8-deluxe', handle: 'Unika 8 Deluxe', video: null, note: 'ggHighLevel.' },
  { id: 'futa-elphelt-67', handle: 'Futa Elphelt 67', video: null, note: 'ggHighLevel.' },
  {
    id: 'johnny',
    handle: 'Johnny',
    video: null,
    note: 'A player whose handle IS a fighter’s whole name: "GGST | chocoservant (Jam) VS Johnny (Johnny)". The severe class — this is exactly what the guard exists to catch, so it must be confirmed by a human before it is exempted.',
  },
  {
    id: 'may',
    handle: 'May',
    video: null,
    note: 'Same severe class: "GGST | May (May) VS tms (Ramlethal)". May is also the month and the modal verb.',
  },
  {
    id: 'ユニカ',
    handle: 'ユニカ',
    video: null,
    note: 'The bracket handle in "Rank 3rd UNIKA / ユニカ [ ユニカ ]". All-katakana, so playerId() takes the non-Latin fallback and the id is the handle. Severe class.',
  },
  {
    id: 'こん-メイ',
    handle: 'こん@メイ',
    video: null,
    note: 'Contains メイ (May). Reaches the guard only because the "@" delimits the kana — an undelimited Japanese handle would not match at all.',
  },
];

// ── VENDOR SCRAPE ───────────────────────────────────────────────────────────
// The provenance half. Everything below talks to guiltygear.com and answers one
// question: does the site still say what data/characters.json says it said?
//
// It matters more here than on any sibling, because the UNRELEASED table in
// scripts/expiries.ts ships EMPTY. Arc System Works has announced two more
// Season 5 characters and named neither: the store page reads
// `DLC Additional Character #20 ??? (Available Winter 2026)` and
// `#21 ??? (Available Spring 2027)`, there is no character page, no sitemap
// entry and no Fan Kit asset for either, and the site slugs are opaque
// three-letter codes with no derivable pattern (`cos` = Happy Chaos,
// `rbk` = Robo-Ky, `jko` = Jack-O'). There is nothing to pre-seed and guessing
// would put a fabricated fighter on the roster. So the two detectors for a new
// character are the residue gate at parse time and THIS — a `???` slot that
// stops reading `???`.

const SITE = 'https://www.guiltygear.com/ggst/en';
/** Politeness, not rate-limit avoidance. 37 requests at this pacing is ~12s. */
const PACING_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': 'ggst-replay-database/roster-check' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  await sleep(PACING_MS);
  return res.text();
}

/** Tags to spaces, then collapse. The `<br>` is why: `HAPPY  <br>CHAOS` and
 *  `GOLDLEWIS  <br>DICKINSON` yield a DOUBLE space under naive innerText, and
 *  an untrimmed double space is a name that matches nothing. */
const textOf = (html: string): string =>
  normalizeText(
    html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#8217;/g, "'"),
  );

export interface DlcSlot {
  /** The store page's own DLC number, 1-based, release order. */
  dlc: number;
  /** The name as printed, or '???' for an announced-but-unnamed slot. */
  name: string;
  /** '(Available …)' window text, present only on unreleased slots. */
  window: string | null;
}

export interface RosterScrape {
  /** Site slugs from the grid's own hrefs. */
  slugs: string[];
  /** Site slugs from the sitemap — an independent second count. */
  sitemapSlugs: string[];
  /** slug → `<h1>` text, only when --names was passed. */
  names: Map<string, string>;
  dlc: DlcSlot[];
}

/**
 * Enumerate the roster from the vendor's own pages.
 *
 * TWO INDEPENDENT ENUMERATIONS, ON PURPOSE. The grid is a server-rendered list
 * that a season filter reorders client-side, and it carries a 35th `<h2>` that
 * is not a character ("Battle types are shown here") — so the grid is read by
 * `href`, never by heading, and the sitemap is the control. Verified live
 * 2026-09-07: 34 hrefs, 34 sitemap `<url>` entries, same set.
 */
export async function scrapeRoster(withNames: boolean): Promise<RosterScrape> {
  const grid = await get(`${SITE}/character/`);
  const slugs = [
    ...new Set(
      [...grid.matchAll(/href="[^"]*\/ggst\/en\/character\/([a-z0-9]+)\/"/g)].map((m) => m[1]!),
    ),
  ];

  const sitemap = await get(`${SITE}/wp-sitemap-posts-character-1.xml`);
  const sitemapSlugs = [
    ...new Set(
      [...sitemap.matchAll(/<loc>[^<]*\/character\/([a-z0-9]+)\/<\/loc>/g)].map((m) => m[1]!),
    ),
  ];

  const names = new Map<string, string>();
  if (withNames) {
    for (const slug of slugs) {
      const page = await get(`${SITE}/character/${slug}/`);
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(page);
      if (!h1) throw new Error(`${slug}: no <h1> on the character page`);
      names.set(slug, textOf(h1[1]!));
    }
  }

  // The store page is the ONLY surface that mentions an unnamed slot. Its blocks
  // are read by splitting on the "Additional Character #N" run rather than by a
  // greedy capture: Robo-Ky's block carries no "(Available …)" clause, so a
  // greedy name capture swallows the whole of the next block with it.
  const buynow = textOf((await get(`${SITE}/buynow/`)).replace(/<script[\s\S]*?<\/script>/g, ' '));
  const dlc: DlcSlot[] = [];
  const seen = new Set<number>();
  for (const m of buynow.matchAll(/Additional Character\s*#(\d+)\s+([\s\S]{0,50})/g)) {
    const n = Number(m[1]);
    if (seen.has(n)) continue;
    seen.add(n);
    const rest = m[2]!.split(/\s(?:GGST|This|DLC|Additional)\b/)[0]!;
    const window = /\(Available ([^)]+)\)/.exec(m[2]!);
    dlc.push({
      dlc: n,
      name: rest.replace(/\(Available[\s\S]*$/, '').trim(),
      window: window ? window[1]!.trim() : null,
    });
  }
  dlc.sort((a, b) => a.dlc - b.dlc);
  return { slugs, sitemapSlugs, names, dlc };
}

// ── standalone `--scrape` ───────────────────────────────────────────────────
// isMain, not a bare argv check. scripts/seasons.ts and scripts/redirects.ts
// both take `--check` inside `npm run typecheck`, and CotW's own note records
// what a bare flag test costs: a validator firing inside an unrelated script,
// where its process.exit(1) kills a run that was doing something else.
const isMain = !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain && process.argv.includes('--scrape')) {
  const withNames = process.argv.includes('--names');
  const characters = await loadCharacters();
  const scrape = await scrapeRoster(withNames);
  const errs: string[] = [];

  const ours = new Map(
    characters.map((c) => [(c.extra?.siteSlug as string | undefined) ?? '', c] as const),
  );
  for (const slug of scrape.slugs) {
    if (!ours.has(slug)) {
      errs.push(
        `site slug "${slug}" is on guiltygear.com/ggst/en/character/ and NOT in ` +
          `data/characters.json — a character shipped. Add them to ROSTER in ` +
          `scripts/characters.ts with the <h1> spelling, get an accent into ` +
          `design/handoff/tokens.css from a Claude Design session, and re-run ` +
          `\`npm run data:characters\`.`,
      );
    }
  }
  for (const [slug, c] of ours) {
    if (!scrape.slugs.includes(slug)) {
      errs.push(
        `we carry ${c.id} at site slug "${slug}" and the vendor's grid no longer lists it — ` +
          `check for a slug rename before removing anything; the committed records are still real.`,
      );
    }
  }
  // The sitemap is the control on the grid, not on us: if the two vendor
  // surfaces disagree, one of the two scrapes is broken and neither count can
  // be trusted to say a character shipped.
  const gridOnly = scrape.slugs.filter((s) => !scrape.sitemapSlugs.includes(s));
  const mapOnly = scrape.sitemapSlugs.filter((s) => !scrape.slugs.includes(s));
  if (gridOnly.length || mapOnly.length) {
    errs.push(
      `grid and sitemap disagree (grid-only: ${gridOnly.join(', ') || 'none'}; ` +
        `sitemap-only: ${mapOnly.join(', ') || 'none'}) — fix the extraction before trusting ` +
        `either count.`,
    );
  }

  // COMPARE AGAINST THE VENDOR SPELLING, WHICH IS NOT ALWAYS THE SHIPPED NAME.
  //
  // The h1 is the authority for what ARC SYSTEM WORKS calls a character, and
  // that is what this loop checks. It is not always what we can display: when
  // the two must differ, characters.ts carries the vendor's own string in
  // `extra.vendorName` and this check reads that instead.
  //
  // Exactly one row needs it today. ArcSys spells Asuka `ASUKA R♯` with U+266F
  // MUSIC SHARP SIGN; the display face is Black Ops One, whose real cmap (693
  // codepoints, parsed 2026-09-07) has no U+266F, so shipping that string would
  // fall back to a system font for one glyph mid-name on the character page and
  // the OG card — checklist 5d's exact failure. The shipped name uses the ASCII
  // `#` that ArcSys itself writes on buynow.html.
  //
  // DO NOT "FIX" THIS BY FOLDING THE TWO FIELDS BACK TOGETHER. An earlier
  // version of this loop compared the h1 to `name` and told whoever read the
  // error that the h1 was the authority — i.e. it instructed the next person to
  // undo the typeface decision, in an error message, with no way to know why.
  const vendorName = (c: CharacterRecord): string =>
    (c.extra?.vendorName as string | undefined) ?? c.name;

  for (const [slug, h1] of scrape.names) {
    const c = ours.get(slug);
    if (!c) continue;
    // Case-insensitive: the site renders 33 of 34 h1s in caps and Robo-Ky's in
    // title case (a newer page template), and the caps are styling. Everything
    // else — the U+003D in ZATO=1, the U+266F in ASUKA R♯, the '?' in BEDMAN?,
    // the apostrophe in JACK-O' — is the vendor NAME and must match exactly.
    if (h1.toLowerCase() !== vendorName(c).toLowerCase()) {
      errs.push(
        `${c.id}: vendor <h1> is "${h1}" and we carry vendor name "${vendorName(c)}". The h1 ` +
          `is the authority for the VENDOR spelling — the grid <h2> and buynow.html both ` +
          `disagree with it on purpose (13 of 34 and 2 of 34 respectively). If the shipped ` +
          `display name differs deliberately, update extra.vendorName, not the display name.`,
      );
    }
  }

  const named = new Set(characters.map((c) => vendorName(c).toLowerCase()));
  const unnamed = scrape.dlc.filter((d) => d.name === '???');
  for (const d of scrape.dlc) {
    if (d.name === '???' || named.has(d.name.toLowerCase())) continue;
    // A named DLC slot we do not carry. This is the announcement, and it is the
    // only automatic one that arrives BEFORE any footage exists.
    if (
      ![...ours.values()].some((c) => d.name.toLowerCase().startsWith(vendorName(c).toLowerCase()))
    ) {
      errs.push(
        `store page DLC #${d.dlc} is now named "${d.name}"${
          d.window ? ` (${d.window})` : ''
        } and is not on our roster. Add a row to UNRELEASED in scripts/expiries.ts ` +
          `dated to the CLOSE of that window, and an accent to design/handoff/tokens.css.`,
      );
    }
  }

  console.log(
    `roster scrape — ${SITE}\n` +
      `  grid ${scrape.slugs.length} slugs · sitemap ${scrape.sitemapSlugs.length} · ` +
      `committed ${characters.length}\n` +
      `  store DLC ledger ${scrape.dlc.length} slots, ${unnamed.length} still unnamed: ` +
      `${unnamed.map((d) => `#${d.dlc} ${d.window ?? 'no window'}`).join(', ') || 'none'}\n` +
      `  ${withNames ? `${scrape.names.size} <h1> names checked` : '<h1> names NOT checked (pass --names)'}`,
  );
  if (errs.length) {
    console.error(`\n✖ the vendor and data/characters.json disagree:`);
    for (const e of errs) console.error(`    ${e}`);
    process.exit(1);
  }
  console.log('✓ vendor roster matches data/characters.json');
}
