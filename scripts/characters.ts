/**
 * Build data/characters.json — the roster registry.
 *
 * TWO SOURCES, BOTH OF THEM BINDING:
 *
 * 1. ROSTER below: ids, official names, season, release day, site slug and the
 *    parse/search aliases. Enumerated live from
 *    https://www.guiltygear.com/ggst/en/character/ on 2026-09-07 — 34 grid
 *    hrefs, cross-checked against wp-sitemap-posts-character-1.xml (34 `<url>`)
 *    and the Fan Kit's own chara01…chara34 numbering. `npx tsx scripts/roster.ts
 *    --scrape --names` re-runs that enumeration against this file.
 *
 * 2. design/handoff/tokens.css: the accents, read from its `--char-<token>`
 *    block. THE DESIGN TOKENS ARE THE SOURCE OF TRUTH FOR ACCENTS.
 *    app/app.config.ts mirrors the same block, so config and data cannot drift,
 *    and A ROSTER ID WITH NO TOKEN FAILS THIS SCRIPT LOUD rather than shipping
 *    an unstyled fighter. Never invent an accent here — it comes from a Claude
 *    Design session.
 *
 * ── THE NAME IS THE DETAIL PAGE'S <h1>, NEVER THE GRID'S <h2> ─────────────
 * (with exactly one deliberate exception, Asuka — see `vendorName`.)
 * Arc System Works publishes each character's name in three places and they
 * disagree. The grid `<h2>` is a shortened label and differs from the `<h1>`
 * for 13 of 34 (`SOL` vs `SOL BADGUY`, `DIZZY` vs `QUEEN DIZZY`). buynow.html
 * disagrees again and is measurably the worst surface: it types Millia as
 * "Millia Rag", writes Zato with a hyphen where the character page uses an
 * EQUALS SIGN, writes Asuka's sharp as ASCII `#`, and still describes DLC #18
 * as "???" five months after Jam shipped. The `<h1>` wins, and the caps are
 * styling — these are title-cased here, exactly as the sibling repos do.
 *
 * The four spellings that a reader will assume are typos and are not:
 *   `Zato=1`    U+003D EQUALS SIGN. Every third party (ComboForge, the Replay
 *               Theater catalogue, ArcSys' own store page) writes `Zato-1`, and
 *               the alias matcher resolves all of them because `=` is one of
 *               its flexible characters. The id stays `zato-1`.
 *   `Asuka R♯`  U+266F MUSIC SHARP SIGN, not ASCII `#`. ArcSys spells it three
 *               ways across its own pages (`R♯`, `R#`, and JP `飛鳥＝R♯`).
 *   `A.B.A`     no trailing period — contrast SF6's `A.K.I.` which has one. Do
 *               not pattern-match a rule across the two games.
 *   `Jack-O'`   no surname on the official site. "Jack-O' Valentine" is fan
 *               usage and is carried as an alias because ComboForge uses it.
 * `Bedman?`'s question mark and `Queen Dizzy`'s title are likewise part of the
 * names, in the h1, the `<title>`, the grid and the DLC product names.
 *
 * ── THE IDS ARE FULL-NAME KEBAB, AND THE DESIGN HANDOFF CHOSE OTHERWISE ───
 * design/handoff/tokens.css ships its 34 accents keyed on SHORT ids (`--char-sol`,
 * `--char-dizzy`, `--char-asuka`). We ship FULL-NAME kebab (`sol-badguy`,
 * `queen-dizzy`, `asuka-r`), which is CotW's convention and the reverse of what
 * the handoff assumed. TOKEN_FOR below owns that translation, in one place, and
 * the handoff is not edited: a design file that has been reviewed and signed off
 * is not the right thing to rewrite for a naming decision made downstream of it.
 *
 * The reason we did not follow it is measured. ComboForge keys characters as
 * `${gameId}-${suffix}` and derives the suffix from our id when no override
 * exists. Against their live /api/games/ggst/characters (35 entries, fetched
 * 2026-09-07), full-name ids derive 29 of 34 with no map entry; the five that
 * need one are `a-b-a`→`a.b.a`, `asuka-r`→`asuka-r#`, `bedman`→`bedman?`,
 * `jack-o`→`jack-o'-valentine` and `jam-kuradoberi`→`jam` — four of them pure
 * punctuation. Short ids need SEVENTEEN overrides and also force
 * `extra['full name']` onto every truncated character, because their
 * name-matcher would otherwise pair our "Sol" against their "Sol Badguy" and
 * file it as absent. (The comboforge recon quotes 4 overrides for this
 * convention; that count assumed an id of `jam`. With `jam-kuradoberi` it is 5.)
 *
 * The id derivation is asserted below rather than described: lowercase, map
 * space / `_` / `-` / `=` to `-`, strip `. ? ' ’ ♯ #`, collapse runs, trim. All
 * 34 derive from their own `name`, which is why there is no exception table to
 * rot. For 33 of them `name` IS the `<h1>`; Asuka is the one row where it is
 * not, because her `<h1>` carries a glyph the display face cannot draw — see
 * her entry, and `vendorName` below, which keeps the vendor's spelling.
 *
 * `extra['full name']` is deliberately absent. On CotW it exists because `name`
 * is sometimes short (`Ken` vs their `Ken Masters`); here `name` IS the full
 * name for all 34, so the field would be an exact duplicate of `name` and the
 * first person to change one and not the other would create a phantom disagreement.
 *
 * ── THE ALIAS TABLE IS THE SHARED SEARCH AND PARSE VOCABULARY ─────────────
 * The app's search and the pipeline's parser read the same list, so a new
 * nickname is added once. Curation rules, in force below:
 *
 *  · The official name always appears (buildAliasMatcher prepends it).
 *  · SPELLINGS only, never spacing or punctuation variants. The matcher's
 *    flexible-punctuation compilation already covers them: one entry for
 *    `A.B.A` matches `ABA`/`A B A`/`A.B.A.`, `Robo-Ky` matches `RoboKy`,
 *    `Jack-O'` matches `Jacko`, `Zato=1` matches `Zato-1`, `Asuka R♯` matches
 *    `Asuka R#` and the bare `Asuka R`. Adding those as rows would be noise
 *    that hides the rows that matter.
 *  · Uploader TYPOS are included, and the table distinguishes two grades of
 *    evidence for them, because conflating the two is how nobody re-checks.
 *      COUNTED — `Chiip`, `Elphlet`, `Vemom`, `Hasppychaos`, `Goldlwis`,
 *      `Nagoroyuki`, `Potemmkin`, `Fauts`, `Jonny` come off the corpus sweep
 *      (recon channels-live.md §5d), which found ggstHq alone carrying 107.
 *      COMMUNITY-REPORTED, NOT COUNTED — `Potempkin`, `Milia`, `Goldlweis`,
 *      `Aniji`, `Bridgette`, `Elpheldt`, `Dizzie`, `Unica` come from the
 *      recon's alias table (roster-live.md §4), whose own header says it is
 *      community usage and not scraped. They are cheap and harmless; they are
 *      not evidence of anything.
 *    This is curation, not silent correction: without them those uploads become
 *    char-unresolved misses, and 271 titles (1.39% of the corpus, 8.6% of all
 *    misses) are alias/typo gaps. That 271 is itself an UPPER-BOUND-adjacent
 *    figure — the sweep never called videos.list, so the miss denominator is
 *    missing its `too-short` and `live` classes entirely.
 *  · JAPANESE FORMS ARE CARRIED. One intake channel is bilingual by design and
 *    writes `VENOM / ヴェノム [ handle ]`. Four characters are KANJI rather than
 *    katakana on ArcSys' JP page — Baiken 梅喧, Anji 闇慈, Nagoriyuki 名残雪,
 *    Jam 紗夢 — so a katakana-only table misses four of the roster outright.
 *  · A SHORTENING is included only where it is the community's dominant spelling
 *    and is not a two-letter initialism. Initialisms (`HC`, `GL`, `SB`, `JO`,
 *    `QD`, `RK`) are refused as a class: in this corpus a two-letter token is
 *    indistinguishable from a team tag or sponsor prefix (`JIG｜ナゲ`), and no
 *    measurement exists that separates them. BANNED_ALIASES holds that line as
 *    an assertion, because a comment is what a future edit deletes.
 *
 * THE TOKENS THAT ARE DANGEROUS AND ARE CARRIED ANYWAY: `May` (also the month
 * and the modal verb — the worst token in the table), `Sol`, `Leo`, `Sin`,
 * `Jam`, `Faust`, `Venom`, `Chaos`, `Slayer`, `Testament`, `Lucy`, `Dizzy`,
 * `Ram`, `Pot`. They are the characters' own names and the parser cannot work
 * without them. What protects the data is not omitting them — it is the
 * per-channel slot order, the slot-ambiguous review queue, and the
 * player-collision gate at the bottom of this file.
 *
 * Run: npm run data:characters   (only when the roster changes — never in cron)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dueExpiries, UNRELEASED } from './expiries';
import { aliasKey, buildAliasMatcher, CONFIRMED_FIGHTER_NAMED_PLAYERS, playerId } from './roster';
import type { CharacterRecord, PlayerRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = join(ROOT, 'design/handoff/tokens.css');
const PLAYERS = join(ROOT, 'data/players.json');
const OUT = join(ROOT, 'data/characters.json');

interface RosterEntry {
  id: string;
  /** The character detail page's `<h1>`, title-cased — for 33 of 34. Where the
   *  `<h1>` cannot be rendered by the display face, this is the renderable form
   *  and `vendorName` carries the `<h1>`. See the header. */
  name: string;
  /** Arc System Works' own 3-letter page slug. The only stable key back to
   *  first-party art and the character's page. */
  siteSlug: string;
  /** Content era: 0 = base roster at launch, 1–5 = Season Pass wave. */
  season: 0 | 1 | 2 | 3 | 4 | 5;
  /** ISO day the character became PLAYABLE. Taken from the BODY SENTENCE of the
   *  version's own news post, never the title's parenthetical date — the two
   *  disagree on 12 of the 18 titles that carry one (Slayer's title says May 29
   *  and the body May 30; Unika's says May 26 and the body May 27; Lucy's says
   *  Aug 20 and the body Aug 21).
   *
   *  Under that rule the playable day EQUALS the patch day for 33 of 34. The one
   *  genuine split is Bridget: Ver 1.21 landed 2022-08-08 and the DLC entitlement
   *  the next day, which is why her row carries 2022-08-09 and says so.
   *  An earlier draft of this comment generalised the split to "Elphelt onward";
   *  that was the title-vs-body gap misread as a patch-vs-unlock gap. */
  released: string;
  /** The vendor's own spelling, when it differs from `name` because `name` had
   *  to be renderable. Only Asuka R♯ needs this today — see her entry. */
  vendorName?: string;
  aliases: string[];
}

/**
 * Thirty-four released characters. There is NO thirty-fifth.
 *
 * Season 5 sells four characters and has shipped two. The other two are
 * announced and UNNAMED: guiltygear.com/ggst/en/buynow/ reads
 * `DLC Additional Character #20 ??? (Available Winter 2026)` and
 * `#21 ??? (Available Spring 2027)` — verified live 2026-09-07. There is no
 * character page, no sitemap entry, no Fan Kit asset and no portrait for
 * either, and the site slugs are opaque three-letter codes with no derivable
 * pattern (`cos` = Happy Chaos, `rbk` = Robo-Ky, `jko` = Jack-O'), so a
 * placeholder id would be a fabrication rather than a guess worth keeping.
 *
 * So UNRELEASED in scripts/expiries.ts ships EMPTY, and the gate's wiring stays
 * intact for the day a name appears. Anything claiming this roster is "about
 * 35" is counting a slot with no name in it.
 */
const ROSTER: RosterEntry[] = [
  // ── Base roster (2021-06-11; the Ultimate Edition's early access opened
  //    2021-06-08, which is the reason the pre-release era in scripts/seasons.ts
  //    reaches back past launch rather than a rounding of it) ────────────────
  {
    id: 'sol-badguy',
    name: 'Sol Badguy',
    siteSlug: 'sol',
    season: 0,
    released: '2021-06-11',
    aliases: ['Sol', 'ソル'],
  },
  {
    id: 'ky-kiske',
    name: 'Ky Kiske',
    siteSlug: 'kyk',
    // Bare `Kiske` is deliberately absent — two Kiskes on this roster, see
    // BANNED_ALIASES. `Ky` is two characters and lives inside `Robo-Ky` and
    // `Sin Kiske`; only the matcher's longest-first ordering makes it safe.
    season: 0,
    released: '2021-06-11',
    aliases: ['Ky', 'カイ'],
  },
  {
    id: 'may',
    name: 'May',
    siteSlug: 'may',
    season: 0,
    released: '2021-06-11',
    aliases: ['メイ'],
  },
  {
    id: 'axl-low',
    name: 'Axl Low',
    siteSlug: 'axl',
    season: 0,
    released: '2021-06-11',
    aliases: ['Axl', 'アクセル'],
  },
  {
    id: 'chipp-zanuff',
    name: 'Chipp Zanuff',
    siteSlug: 'chp',
    // `Chip` with one p is NOT here: "chip damage" is a term of art that appears
    // in fighting-game titles constantly. See BANNED_ALIASES.
    season: 0,
    released: '2021-06-11',
    aliases: ['Chipp', 'Zanuff', 'チップ', 'Chiip'],
  },
  {
    id: 'potemkin',
    name: 'Potemkin',
    siteSlug: 'pot',
    // `Potempkin` is a measured misspelling, kept deliberately.
    season: 0,
    released: '2021-06-11',
    aliases: ['Pot', 'Potempkin', 'ポチョムキン', 'Potemmkin'],
  },
  {
    id: 'faust',
    name: 'Faust',
    siteSlug: 'fau',
    // `Doc` and `Bag Man` are lore nicknames with no measured character-slot
    // use, and `Doc` is a classic FGC handle. Left out; the residue gate will
    // report them if uploaders start using them.
    //
    // `Fauts` IS DELIBERATELY ABSENT, and it was here for a day. The recon
    // listed it among the measured uploader typos (channels-live.md §5d) and it
    // was added on that word. Its ONE occurrence in the whole corpus is
    // "GGST | Fauts (Faust) VS iDom (Testament)" — `Fauts` is the PLAYER, and
    // the character is spelled correctly in the same title. As an alias it made
    // a real handle resolve to a fighter and tripped the registry invariant on
    // the first full parse. A typo list assembled by eye needs its SLOT checked,
    // not just its spelling.
    season: 0,
    released: '2021-06-11',
    aliases: ['ファウスト'],
  },
  {
    id: 'millia-rage',
    name: 'Millia Rage',
    siteSlug: 'mll',
    // `Milia` is a measured misspelling. buynow.html adds a fourth spelling of
    // its own, "Millia Rag" — that is a vendor typo on a page we do not read
    // names from, not an alias.
    season: 0,
    released: '2021-06-11',
    aliases: ['Millia', 'Milia', 'ミリア'],
  },
  {
    id: 'zato-1',
    name: 'Zato=1',
    siteSlug: 'zat',
    // `Eddie` is absent on purpose: Eddie is Zato's shadow here but a SEPARATE
    // character in the older Guilty Gear titles, so a title naming Eddie may not
    // be about this game at all.
    season: 0,
    released: '2021-06-11',
    aliases: ['Zato', 'ザトー'],
  },
  {
    id: 'ramlethal-valentine',
    name: 'Ramlethal Valentine',
    siteSlug: 'ram',
    // Bare `Valentine` is banned — three characters can claim it.
    // `Ram` is the dominant community spelling and also collides with hardware
    // and with "Rambo"; it survives because it must, not because it is safe.
    season: 0,
    released: '2021-06-11',
    aliases: ['Ram', 'Ramlethal', 'Ramu', 'ラムレザル'],
  },
  {
    id: 'leo-whitefang',
    name: 'Leo Whitefang',
    siteSlug: 'leo',
    season: 0,
    released: '2021-06-11',
    aliases: ['Leo', 'Whitefang', 'レオ'],
  },
  {
    id: 'nagoriyuki',
    name: 'Nagoriyuki',
    siteSlug: 'nag',
    // KANJI, not katakana — 名残雪. A katakana-only JP table misses him.
    season: 0,
    released: '2021-06-11',
    aliases: ['Nago', 'Nagori', '名残雪', 'Nagoroyuki'],
  },
  {
    id: 'giovanna',
    name: 'Giovanna',
    siteSlug: 'gio',
    season: 0,
    released: '2021-06-11',
    aliases: ['Gio', 'ジオヴァーナ'],
  },
  {
    id: 'anji-mito',
    name: 'Anji Mito',
    siteSlug: 'anji',
    // KANJI — 闇慈. Note the site slug is `anji` on /en/ but `anj` on /jp/ and in
    // every Fan Kit filename; never build an art filename from siteSlug.
    // `Aniji` is a measured misspelling.
    season: 0,
    released: '2021-06-11',
    aliases: ['Anji', 'Aniji', '闇慈'],
  },
  {
    id: 'i-no',
    name: 'I-No',
    siteSlug: 'ino',
    // `Ino`, `I No` and `INo` all resolve from the name — the hyphen is one of
    // the matcher's flexible characters.
    season: 0,
    released: '2021-06-11',
    aliases: ['イノ'],
  },

  // ── Season 1 (2021–2022) ────────────────────────────────────────────────
  {
    id: 'goldlewis-dickinson',
    name: 'Goldlewis Dickinson',
    siteSlug: 'gld',
    // `Goldlweis` is a measured misspelling. Bare `Gold` is banned.
    season: 1,
    released: '2021-07-27',
    aliases: ['Goldlewis', 'Goldlweis', 'Dickinson', 'ゴールドルイス', 'Goldlwis'],
  },
  {
    id: 'jack-o',
    name: "Jack-O'",
    siteSlug: 'jko',
    // "Jack-O' Valentine" is fan usage — ArcSys gives her no surname — and is
    // carried because it is the string ComboForge and much of the community use.
    // Bare `Jack` is BANNED: it is a real, prolific player handle on this corpus.
    season: 1,
    released: '2021-08-27',
    aliases: ["Jack-O' Valentine", 'ジャック・オー'],
  },
  {
    id: 'happy-chaos',
    name: 'Happy Chaos',
    siteSlug: 'cos',
    // `ケイオス` on its own is measured on the bilingual channel
    // ("Rank 1st HappyChaos / ケイオス"). `Chaos` is measured in a character slot
    // ("Jack (#1 Ranked Chaos)"). Bare `Happy` and the lore name "That Man" are
    // banned — the recon's alias table gave "That Man" to this character AND to
    // Asuka, and only one of those can be right.
    season: 1,
    released: '2021-11-30',
    aliases: ['Chaos', 'ハッピーケイオス', 'ケイオス', 'Hasppychaos'],
  },
  {
    id: 'baiken',
    name: 'Baiken',
    siteSlug: 'bkn',
    // KANJI — 梅喧.
    season: 1,
    released: '2022-01-28',
    aliases: ['梅喧'],
  },
  {
    id: 'testament',
    name: 'Testament',
    siteSlug: 'tst',
    // `Test` and `Tes` are banned English words.
    season: 1,
    released: '2022-03-28',
    aliases: ['テスタメント'],
  },

  // ── Season 2 (2022–2023) ────────────────────────────────────────────────
  {
    id: 'bridget',
    name: 'Bridget',
    siteSlug: 'bgt',
    // 2022-08-09, not the 8th, and the vendor states both. The Ver 1.21 post
    // reads "An update to Version 1.21 will be released on August 8 … *Bridget
    // will be available after purchasing the GGST Season Pass 2 or Bridget DLC
    // items, both to be released on August 9." The patch landed on the 8th; the
    // entitlement that makes her playable landed on the 9th, and PLAYABLE is
    // what this field means everywhere else in the table.
    // `Bridgette` is a measured misspelling; bare `Bridge` is banned.
    season: 2,
    released: '2022-08-09',
    aliases: ['Bridgette', 'ブリジット'],
  },
  {
    id: 'sin-kiske',
    name: 'Sin Kiske',
    siteSlug: 'sin',
    // `Sin` is a bare English word and is carried anyway — it is what everyone
    // calls him. Bare `Kiske` is banned (see ky-kiske).
    season: 2,
    released: '2022-11-24',
    aliases: ['Sin', 'シン'],
  },
  {
    id: 'bedman',
    name: 'Bedman?',
    siteSlug: 'bed',
    // The `?` is part of the name — h1, <title>, grid, DLC product name, and the
    // JP `ベッドマン？`. It is stripped from the id and is optional in the
    // matcher, so `Bedman` and `Bedman?` both resolve. `Delilah` is the girl and
    // is occasionally used for the character.
    season: 2,
    released: '2023-04-06',
    aliases: ['Delilah', 'ベッドマン'],
  },
  {
    id: 'asuka-r',
    // DISPLAY NAME IS THE ASCII FORM, AND THIS IS A TYPEFACE CONSTRAINT, NOT A
    // TRANSCRIPTION SLIP. ArcSys's detail-page <h1> spells her `ASUKA R♯` with
    // U+266F MUSIC SHARP SIGN, and that is the authority this file follows for
    // every other name. It cannot be followed here: the display face is Black
    // Ops One, and parsing its real cmap on 2026-09-07 found 693 mapped
    // codepoints WITHOUT U+266F. Every other roster punctuation mark is present
    // (U+0027 ' · U+002D - · U+0023 # · U+002E . · U+003F ? · U+003D = · the
    // digits), so this is the one glyph in the roster the wordmark cannot draw.
    //
    // Shipping `R♯` would fall back to a system font for that single glyph, mid
    // string, on the character page and the OG card — checklist 5d's exact
    // failure: a plausible render that no naive check reports.
    //
    // The ASCII form is not a compromise invented here. ArcSys itself writes
    // `Asuka R#` on buynow.html's colour-pack list, so both spellings are
    // first-party; this picks the one that renders. The vendor's own U+266F
    // form is preserved in extra.vendorName and resolves as an alias either way,
    // because the matcher treats ♯ as a flexible character.
    name: 'Asuka R#',
    siteSlug: 'ask',
    // The id `asuka-r` reads truncated, and it is still the right one: it is what
    // the stated derivation produces and what ComboForge derives from. `Asuka R#`
    // and `Asuka R` both resolve from the name — `♯` is a flexible character.
    season: 2,
    released: '2023-05-25',
    aliases: ['Asuka', '飛鳥＝R♯'],
    vendorName: 'Asuka R♯',
  },

  // ── Season 3 (2023–2024) ────────────────────────────────────────────────
  {
    id: 'johnny',
    name: 'Johnny',
    siteSlug: 'jhn',
    // `Jonny` is a measured misspelling. There is also a PLAYER called Johnny on
    // this corpus — see CONFIRMED_FIGHTER_NAMED_PLAYERS in scripts/roster.ts.
    season: 3,
    released: '2023-08-24',
    aliases: ['Jonny', 'ジョニー'],
  },
  {
    id: 'elphelt-valentine',
    name: 'Elphelt Valentine',
    siteSlug: 'elp',
    // `Elpheldt` is a measured misspelling. `Elf` and bare `Valentine` are banned.
    season: 3,
    released: '2023-12-08',
    aliases: ['Elphelt', 'Elpheldt', 'エルフェルト', 'Elphlet'],
  },
  {
    id: 'aba',
    name: 'A.B.A',
    siteSlug: 'aba',
    // No trailing period. `ABA`, `A B A` and the over-punctuated `A.B.A.` all
    // resolve from the name.
    season: 3,
    released: '2024-03-26',
    aliases: ['アバ'],
  },
  {
    id: 'slayer',
    name: 'Slayer',
    siteSlug: 'sly',
    // `Sly` is banned. The handle "Lasagna Slayer" appears on 120 rows across two
    // channels and is a person; that is the allow-list's job, not this table's.
    season: 3,
    released: '2024-05-30',
    aliases: ['スレイヤー'],
  },

  // ── Season 4 (2024–2025) ────────────────────────────────────────────────
  {
    id: 'queen-dizzy',
    name: 'Queen Dizzy',
    siteSlug: 'dzy',
    // The h1 and the DLC product name say "Queen Dizzy"; the grid <h2> says
    // "DIZZY" and so does everyone else. Both resolve, and the id keeps the
    // official form so that ComboForge's `queen-dizzy` derives — they carry
    // BOTH `ggst-dizzy` and `ggst-queen-dizzy` as separate entries.
    // `Dizzie` is a measured misspelling.
    season: 4,
    released: '2024-10-31',
    aliases: ['Dizzy', 'Dizzie', 'ディズィー'],
  },
  {
    id: 'venom',
    name: 'Venom',
    siteSlug: 'ven',
    season: 4,
    released: '2025-03-24',
    aliases: ['ヴェノム', 'Vemom'],
  },
  {
    id: 'unika',
    name: 'Unika',
    siteSlug: 'uni',
    // `Unica` is a measured misspelling. Bare `Uni` is banned. `ユニカ` is also a
    // player handle on this corpus — the allow-list carries it.
    season: 4,
    released: '2025-05-27',
    aliases: ['Unica', 'ユニカ'],
  },
  {
    id: 'lucy',
    name: 'Lucy',
    siteSlug: 'luc',
    // Her full Cyberpunk name is used in titles. `Edgerunner` is not carried: it
    // names the anime as often as the character.
    // ART LICENSING NOTE: Article 5 of the Fan Kit licence carves Lucy out
    // entirely — her materials are governed by CD PROJEKT RED's fan-content
    // guidelines, not ArcSys'. scripts/art.ts is where that has to be honoured.
    season: 4,
    released: '2025-08-21',
    aliases: ['Lucyna', 'Lucyna Kushinada', 'ルーシー'],
  },

  // ── Season 5 (2026, two of four shipped) ────────────────────────────────
  {
    id: 'jam-kuradoberi',
    name: 'Jam Kuradoberi',
    siteSlug: 'jam',
    // KANJI — 紗夢. `Jam` is the community name and is also an English word; it
    // is carried because ComboForge and every uploader use it.
    season: 5,
    released: '2026-04-09',
    aliases: ['Jam', 'Kuradoberi', '紗夢'],
  },
  {
    id: 'robo-ky',
    name: 'Robo-Ky',
    siteSlug: 'rbk',
    // The one detail page whose h1 is not all-caps (a newer template shipped
    // with the June 2026 site rebuild). `RoboKy` and `Robo Ky` resolve from the
    // name; `Robokai` is the JP reading. Bare `Robo` is banned.
    season: 5,
    released: '2026-07-02',
    aliases: ['Robokai', 'ロボカイ'],
  },
];

/**
 * Roster id → the `--char-<token>` key the design handoff actually used.
 *
 * THIS MAP IS THE WHOLE COST OF THE ID DECISION, and it is deliberately one
 * explicit table rather than a derivation. A rule ("take the first word") would
 * be wrong for `happy-chaos`, `robo-ky`, `i-no` and `zato-1`, and a rule that is
 * right for 30 of 34 is the kind that gets trusted until the 31st fighter.
 *
 * app/app.config.ts keys its accents by ROSTER ID, not by token — the handoff's
 * short keys stop here.
 */
const TOKEN_FOR: Record<string, string> = {
  'sol-badguy': 'sol',
  'ky-kiske': 'ky',
  may: 'may',
  'axl-low': 'axl',
  'chipp-zanuff': 'chipp',
  potemkin: 'potemkin',
  faust: 'faust',
  'millia-rage': 'millia',
  'zato-1': 'zato-1',
  'ramlethal-valentine': 'ramlethal',
  'leo-whitefang': 'leo',
  nagoriyuki: 'nagoriyuki',
  giovanna: 'giovanna',
  'anji-mito': 'anji',
  'i-no': 'i-no',
  'goldlewis-dickinson': 'goldlewis',
  'jack-o': 'jack-o',
  'happy-chaos': 'happy-chaos',
  baiken: 'baiken',
  testament: 'testament',
  bridget: 'bridget',
  'sin-kiske': 'sin',
  bedman: 'bedman',
  'asuka-r': 'asuka',
  johnny: 'johnny',
  'elphelt-valentine': 'elphelt',
  aba: 'aba',
  slayer: 'slayer',
  'queen-dizzy': 'dizzy',
  venom: 'venom',
  unika: 'unika',
  lucy: 'lucy',
  'jam-kuradoberi': 'jam',
  'robo-ky': 'robo-ky',
};

/**
 * Aliases that must STAY rejected, keyed the way the matcher keys them.
 *
 * Written as an assertion rather than a comment, because the comment is what a
 * future edit deletes. Each one names the failure it prevents.
 */
const BANNED_ALIASES: { key: string; why: string }[] = [
  // Measured player handles — the CotW "Griffon" case, reproduced.
  {
    key: 'jack',
    why: 'a prolific PLAYER on ggHighLevel and ggstBattleCollection ("Jack (#1 Ranked Chaos)", "[ Jack ]"). Adding it files a person as Jack-O\'.',
  },
  // Ambiguous across the roster — cannot resolve, must reach the residue gate.
  {
    key: 'kiske',
    why: 'two Kiskes on this roster (Ky and Sin). A bare surname resolves to a coin flip.',
  },
  {
    key: 'valentine',
    why: "three Valentines (Ramlethal, Elphelt, and Jack-O' in fan usage).",
  },
  {
    key: 'thatman',
    why: 'the recon alias table assigned "That Man" to Happy Chaos AND to Asuka R♯; at most one is right, and two common words are not a name.',
  },
  {
    key: 'eddie',
    why: "Zato's shadow here, a separate character in the older Guilty Gear titles — the title may not be about this game.",
  },
  // Common English words and fighting-game vocabulary.
  { key: 'chip', why: '"chip damage" is a term of art and appears in titles constantly.' },
  { key: 'test', why: 'English word; also the first four letters of every "test" upload.' },
  { key: 'tes', why: 'as above, shorter and worse.' },
  { key: 'bed', why: 'English word.' },
  { key: 'uni', why: 'English prefix and a common handle.' },
  { key: 'elf', why: 'English word.' },
  { key: 'gold', why: 'English word; `Goldlewis` is already unambiguous.' },
  { key: 'happy', why: 'English word.' },
  { key: 'bridge', why: 'English word.' },
  { key: 'doc', why: 'a classic FGC handle.' },
  { key: 'sly', why: 'a classic FGC handle.' },
  { key: 'robo', why: 'generic; `Robo-Ky` already matches without it.' },
  { key: 'poet', why: 'English word, and not obviously a Potemkin typo rather than a handle.' },
  { key: 'ven', why: 'three-letter fragment; also a plausible handle.' },
  { key: 'mil', why: 'three-letter fragment.' },
  { key: 'brid', why: 'three-letter fragment.' },
  // Two- and three-letter initialisms, refused as a class. See the header.
  { key: 'sb', why: 'initialism — indistinguishable from a team tag.' },
  { key: 'gl', why: 'initialism, and "GL" is "good luck" in half the FGC corpus.' },
  { key: 'jo', why: 'initialism.' },
  {
    key: 'hc',
    why: "initialism. The recon marks it as Happy Chaos' dominant short form; it still waits for a measurement that separates it from a sponsor prefix.",
  },
  { key: 'qd', why: 'initialism.' },
  { key: 'rk', why: 'initialism.' },
  { key: 'jn', why: 'initialism.' },
  { key: 'bk', why: 'initialism.' },
  { key: 'ars', why: 'initialism.' },
  { key: 'tst', why: 'initialism, and it is also the site slug for Testament.' },
];

/** The id derivation, applied to the vendor's own `<h1>`. Asserted against every
 *  row rather than described, so a hand-typed id cannot drift from the rule.
 *
 *  BOTH SHARP SPELLINGS STRIP. `♯` U+266F is what the character page writes and
 *  `#` U+0023 is what buynow.html writes — both are first-party, and the shipped
 *  display name uses the ASCII one because the display face has no U+266F glyph
 *  (see the Asuka entry). Stripping only `♯` would derive `asuka-r#` from the
 *  name this roster actually ships, and `#` in a URL slug is a fragment
 *  delimiter, so the id would break routing rather than merely read oddly. */
const kebab = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[\s_\-=]+/g, '-')
    .replace(/[.?'’♯#]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/** Read the `--char-<token>: #hex;` block out of the design handoff. */
async function readAccents(): Promise<Map<string, string>> {
  const css = await readFile(TOKENS, 'utf8');
  const out = new Map<string, string>();
  for (const m of css.matchAll(/--char-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    out.set(m[1]!, m[2]!.toUpperCase());
  }
  return out;
}

/** data/players.json, or [] before the first parse has produced one. */
async function readPlayers(): Promise<PlayerRecord[]> {
  try {
    return JSON.parse(await readFile(PLAYERS, 'utf8')) as PlayerRecord[];
  } catch {
    return [];
  }
}

/** WCAG relative luminance / contrast, so the AA floor is asserted rather than
 *  trusted. The handoff states a ratio per accent; this recomputes it. */
const SURFACE = '#12151B';
const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

async function main(): Promise<void> {
  const warnsEarly: string[] = [];
  // A manual roster run is the RIGHT place for a hard stop — it is not the cron
  // and nobody is blocked by it — but ONLY for the expiry that is actually about
  // the roster. An announced fighter whose window has closed is a roster fact
  // this rebuild would bake in wrong, so that one exits.
  //
  // The other two kinds are NOT roster facts and must not block a roster edit.
  // A stale patch table fires on vendor silence: ArcSys has a documented
  // 127-day gap (Ver 1.51 → 1.52), and STALE_PATCH_DAYS is 90, so this WILL go
  // due during a normal hiatus. Hard-stopping there would make the roster
  // unbuildable for a reason that has nothing to do with the roster — observed
  // live during the build, before the threshold was corrected from CotW's 40.
  const due = dueExpiries();
  const blocking = due.filter((d) => d.kind === 'unreleased-character');
  const advisory = due.filter((d) => d.kind !== 'unreleased-character');
  for (const d of advisory) {
    warnsEarly.push(`${d.id} (${d.kind}, due ${d.date}) — ${d.action.split('. ')[0]}.`);
  }
  if (blocking.length) {
    console.error(
      `✖ ${blocking.length} roster expiry(s) due — resolve them before rebuilding the roster:\n`,
    );
    for (const d of blocking) {
      console.error(`  ${d.id} (${d.kind}, due ${d.date})\n    ${d.action}\n`);
    }
    process.exit(1);
  }

  const accents = await readAccents();
  const errs: string[] = [];
  const warns: string[] = [...warnsEarly];

  // 1. Every id derives from its own name. No exception table, so none can rot.
  for (const c of ROSTER) {
    const want = kebab(c.name);
    if (c.id !== want) {
      errs.push(`${c.id}: name "${c.name}" derives the id "${want}" — one of the two is wrong`);
    }
  }

  // 2. Ids, names and site slugs are unique. A duplicated site slug means two
  //    rows point at one vendor page, which the scrape would then call a match.
  const seenId = new Set<string>();
  const seenSlug = new Map<string, string>();
  const seenName = new Map<string, string>();
  for (const c of ROSTER) {
    if (seenId.has(c.id)) errs.push(`duplicate id ${c.id}`);
    seenId.add(c.id);
    const slugOwner = seenSlug.get(c.siteSlug);
    if (slugOwner) errs.push(`site slug "${c.siteSlug}" claimed by both ${slugOwner} and ${c.id}`);
    seenSlug.set(c.siteSlug, c.id);
    const nameOwner = seenName.get(c.name.toLowerCase());
    if (nameOwner) errs.push(`name "${c.name}" claimed by both ${nameOwner} and ${c.id}`);
    seenName.set(c.name.toLowerCase(), c.id);
  }

  // 3. The design-token bridge, BOTH DIRECTIONS. A roster id with no token ships
  //    an unstyled character; a token nothing claims is either a typo or a
  //    character somebody forgot to add.
  const tokenOwner = new Map<string, string>();
  for (const c of ROSTER) {
    const token = TOKEN_FOR[c.id];
    if (!token) {
      errs.push(`${c.id}: no entry in TOKEN_FOR — the handoff keys accents on short ids`);
      continue;
    }
    const owner = tokenOwner.get(token);
    if (owner) errs.push(`--char-${token} claimed by both ${owner} and ${c.id}`);
    tokenOwner.set(token, c.id);
    if (!accents.has(token)) {
      errs.push(`${c.id}: no --char-${token} in design/handoff/tokens.css`);
    }
  }
  for (const token of accents.keys()) {
    if (!tokenOwner.has(token)) {
      errs.push(
        `design/handoff/tokens.css declares --char-${token} and no roster row claims it — ` +
          `either a character is missing from ROSTER or the token is stale`,
      );
    }
  }
  for (const id of Object.keys(TOKEN_FOR)) {
    if (!seenId.has(id)) errs.push(`TOKEN_FOR has "${id}", which is not a roster id`);
  }

  // 4. An announced-but-unreleased character must never reach the roster. The
  //    table is empty today (both remaining Season 5 slots are literally "???"
  //    on the vendor's store page) and this check is what keeps the mechanism
  //    honest when it stops being empty.
  for (const u of UNRELEASED) {
    if (seenId.has(u.id)) errs.push(`${u.id} is in ROSTER and in UNRELEASED — pick one`);
  }

  // 5. Aliases are unique ACROSS the roster, keyed the way the MATCHER keys them
  //    (scripts/roster.ts aliasKey). A validator with its own normalisation
  //    passes while the matcher silently collides — and aliasKey is also what
  //    keeps the 34 Japanese aliases from all colliding on the empty string.
  const aliasOwner = new Map<string, string>();
  for (const c of ROSTER) {
    for (const a of [c.name, ...c.aliases]) {
      const k = aliasKey(a);
      if (!k) {
        errs.push(
          `${c.id}: alias "${a}" has no letters or digits — it would compile to a ` +
            `zero-width pattern and spin the scan`,
        );
        continue;
      }
      const owner = aliasOwner.get(k);
      if (owner && owner !== c.id) errs.push(`alias "${a}" claimed by both ${owner} and ${c.id}`);
      aliasOwner.set(k, c.id);
    }
  }

  // 6. The banned list.
  for (const b of BANNED_ALIASES) {
    const owner = aliasOwner.get(b.key);
    if (owner) errs.push(`"${b.key}" is a BANNED alias but ${owner} claims it — ${b.why}`);
  }

  // 7. The AA floor, recomputed rather than trusted.
  for (const c of ROSTER) {
    const hex = accents.get(TOKEN_FOR[c.id] ?? '');
    if (!hex) continue;
    const ratio = contrast(hex, SURFACE);
    if (ratio < 4.5) {
      errs.push(`${c.id}: accent ${hex} is ${ratio.toFixed(2)}:1 on ${SURFACE} (<4.5)`);
    }
  }

  const records: CharacterRecord[] = ROSTER.map((c) => ({
    id: c.id,
    name: c.name,
    imgPortrait: `/img/char/${c.id}.webp`,
    imgSplash: `/img/splash/${c.id}.webp`,
    accent: accents.get(TOKEN_FOR[c.id] ?? '') ?? '#000000',
    extra: {
      aliases: c.aliases,
      season: c.season,
      released: c.released,
      siteSlug: c.siteSlug,
      // Carried into the emitted record, not just the source comment, so the
      // vendor's own spelling survives anywhere this file travels. Present on
      // exactly one row today.
      ...(c.vendorName ? { vendorName: c.vendorName } : {}),
    },
  }));

  // 8. POSITIVE CONTROL ON THE MATCHER ITSELF. Every name and every alias must
  //    resolve to its OWN character and to exactly one character. This is what
  //    catches a longest-first regression: without the ordering, "Ky" wins
  //    inside "Ky Kiske" (harmless) and inside "Robo-Ky" (wrong character), and
  //    nothing else in this file would notice.
  //    vendorName is included deliberately: the Asuka row's whole premise is
  //    that ArcSys's own U+266F spelling still resolves even though we ship the
  //    ASCII form. That works today only because ♯ is in roster.ts's FLEXIBLE
  //    class — an unrelated regex someone could narrow later. Asserting it here
  //    turns that comment into a gate.
  const matcher = buildAliasMatcher(records);
  for (const c of ROSTER) {
    for (const a of [c.name, ...(c.vendorName ? [c.vendorName] : []), ...c.aliases]) {
      const got = matcher.one(a);
      if (got !== c.id) {
        errs.push(`matcher: "${a}" should resolve to ${c.id} and resolves to ${got ?? 'nothing'}`);
      }
    }
  }

  // 9. CHECKLIST 5n — NO PLAYER-REGISTRY ENTRY MAY CARRY A ROSTER NAME.
  //
  //    The failure: a title grammar that puts the fighter in the handle slot
  //    mints a player page for a character. It is LIVE on this corpus — 67
  //    titles parsed confidently wrong that way in the recon, filing players
  //    called "UNIKA / ユニカ", "JOHNNY / ジョニー" and "SOL / ソル".
  //
  //    Compared THROUGH THE ALIAS MATCHER, not against a name set. The only
  //    other implementation on the platform compares c.name.toLowerCase(), which
  //    under full-name ids never catches a handle spelled "SOL"; and it runs in
  //    e2e, after `npm run generate`, when the bad data is already on disk.
  //
  //    Exemptions are per-player and evidence-backed, in
  //    CONFIRMED_FIGHTER_NAMED_PLAYERS (scripts/roster.ts). On day one
  //    data/players.json is [] and this loop does nothing — which is the point:
  //    the mechanism ships before the data does, rather than being added after
  //    the first bad player page.
  const confirmed = new Map(CONFIRMED_FIGHTER_NAMED_PLAYERS.map((p) => [p.id, p]));
  for (const p of CONFIRMED_FIGHTER_NAMED_PLAYERS) {
    if (playerId(p.handle) !== p.id) {
      errs.push(`allow-list: handle "${p.handle}" slugs to "${playerId(p.handle)}", not "${p.id}"`);
    }
    if (matcher.find(p.handle).length === 0) {
      errs.push(
        `allow-list: "${p.handle}" no longer collides with any roster name — either the alias ` +
          `table changed or the row was never needed; delete it rather than leaving a dead exemption`,
      );
    }
    // NAMED, NOT JUST COUNTED, AND OUTSIDE THE players.json LOOP ON PURPOSE.
    // An exemption with no evidence is a guess wearing an allow-list's clothes,
    // and day one — when players.json is [] — is precisely when every row is
    // still a guess. Reporting these only once real players exist would stay
    // silent through the whole window where it matters.
    if (!p.video) {
      warns.push(
        `allow-list: "${p.handle}" (${p.id}) is exempted with no evidence. Watch a record, ` +
          `confirm a person is behind the handle, and put its video id on the row.`,
      );
    }
  }
  const players = await readPlayers();
  for (const p of players) {
    const spellings = [p.handle, ...((p.extra?.aliases as string[] | undefined) ?? [])];
    const hits = [...new Set(spellings.flatMap((s) => matcher.ids(s)))];
    if (!hits.length) continue;
    const row = confirmed.get(p.id);
    if (!row) {
      errs.push(
        `player "${p.handle}" (${p.id}) contains roster name(s) ${hits.join(', ')} and is not on ` +
          `CONFIRMED_FIGHTER_NAMED_PLAYERS. Watch a record and decide: a real person goes on the ` +
          `list WITH a video id; a fighter parsed into the handle slot is a parse bug, and the fix ` +
          `is the channel's slotOrder or an overrides.json entry — never an exemption`,
      );
    } else if (!row.video) {
      warns.push(`allow-list entry ${p.id} still has no video id (seeded, never confirmed)`);
    }
  }
  if (players.length) {
    for (const p of CONFIRMED_FIGHTER_NAMED_PLAYERS) {
      if (!players.some((q) => q.id === p.id)) {
        warns.push(`allow-list entry ${p.id} is not in data/players.json — stale?`);
      }
    }
  }

  if (errs.length) {
    console.error(`✖ roster is invalid:\n${errs.map((e) => `    ${e}`).join('\n')}`);
    process.exit(1);
  }

  await writeFile(OUT, `${JSON.stringify(records, null, 2)}\n`);

  const worst = ROSTER.map((c) => ({
    id: c.id,
    r: contrast(accents.get(TOKEN_FOR[c.id]!)!, SURFACE),
  })).sort((a, b) => a.r - b.r)[0]!;
  const bySeason = [0, 1, 2, 3, 4, 5].map((s) => ROSTER.filter((c) => c.season === s).length);
  console.log(
    `✓ data/characters.json — ${records.length} characters ` +
      `(${bySeason[0]} base + S1 ${bySeason[1]} + S2 ${bySeason[2]} + S3 ${bySeason[3]} + ` +
      `S4 ${bySeason[4]} + S5 ${bySeason[5]}), ${aliasOwner.size} unique alias keys ` +
      `(${matcher.aliasCount} compiled); lowest accent contrast ${worst.id} ` +
      `${worst.r.toFixed(2)}:1 on ${SURFACE}; ${UNRELEASED.length} announced-but-unreleased ` +
      `held back; ${CONFIRMED_FIGHTER_NAMED_PLAYERS.length} fighter-named players allow-listed, ` +
      `${CONFIRMED_FIGHTER_NAMED_PLAYERS.filter((p) => !p.video).length} of them still unconfirmed`,
  );
  for (const w of warns) console.warn(`  ⚠ ${w}`);
}

main();
