/**
 * Diff ArcSys's own patch announcements against scripts/seasons.ts PATCHES.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * A patch table goes stale silently. A shipped patch missing from PATCHES
 * fails nothing: every replay since files under the previous token, renders,
 * filters, passes every count assertion, and is wrong. The 2026-09-02 platform
 * refresh found two of four sibling tables stale — Tekken by 96 days, 258
 * replays under the wrong patch — with every offline validator green.
 * seasons.ts validate() checks the table's SHAPE; this checks its CONTENT
 * against the vendor.
 *
 * ── THE SOURCE IS ARCSYS'S OWN WORDPRESS, NOT STEAM ────────────────────────
 * guiltygear.com is a WordPress site and its REST API is open. Category 4 is
 * `patch` ("Patch notes"). Measured 2026-09-07, 2026-09-08 and 2026-09-09: the
 * call below returns all 46 posts in one page (X-WP-Total: 46, X-WP-TotalPages: 1),
 * spanning 2021-06-11 → 2026-07-01, and every one of the 46 titles parses on
 * `/^\[Ver\s*\.?\s*(\d+\.\d{2})\]/`. Post ids survived the 2026-06-24 site
 * rebuild.
 *
 * NOT the Steam news API. It carries ~24 of the 44 versions, in five title
 * spellings, posts the Ver 1.18 SEASON OPENER as "Guilty Gear -Strive-
 * Balance Update is Out Now! Sale is Live!" with no version anywhere, and
 * carries a vendor typo (`Update Patch 1.44 (March 24, 2024)` posted
 * 2025-03-24). A checker polling Steam prints a tick forever while this table
 * rots — the failure CotW documented from the other direction, where the
 * vendor's feed was complete and Steam's was not. NOT the site RSS (10-item
 * window). NOT Dustloop (HTTP 403 behind Cloudflare, page and API alike).
 * (Reported upstream as a checklist gap: VERIFY THE VENDOR FEED IS COMPLETE
 * before adopting it — an incomplete feed makes a checker green by
 * construction. This one reads X-WP-Total and pages until it has every post.)
 *
 * ── THE FOUR HARD FAILURES THIS ENCODES (patches-live.md §3) ──────────────
 * (a) CATEGORY MEMBERSHIP IS NOT ENOUGH. Two category-4 posts carry a
 *     parseable bracket and are not patch notes:
 *       2023-12-12  [Ver.1.33] Known Issues After Recent Update (Dec. 12, 2023)
 *       2024-03-26  [Ver.1.35] Known Issues (Mar. 26, 2024)
 *     Each would mint a duplicate row for a version that already exists. So a
 *     post is a patch note only when its title ALSO matches NOTES below; a
 *     bracket without NOTES is skipped WITH A PRINTED REASON; a title matching
 *     neither is a hard failure, never a skip — an unreadable title is
 *     indistinguishable from a patch that never shipped (Tōkon's lesson).
 * (b) NEVER KEY THE DATE OFF THE FEED OR THE TITLE. Three dates exist per
 *     patch and they disagree: the WordPress `date` (which also drifts by
 *     locale — Ver 1.48 is 2025-08-13 on JP and 2025-08-19 on EN), the title
 *     parenthetical, and the body's release sentence. Measured live by this
 *     script 2026-09-08: 25 of 44 titles carry no date, and 13 of the 19 that
 *     do contradict the body (the recon's 12 of 18 did not count 1.33's
 *     "(Update: Dec. 11)", which is an update stamp and also not the release).
 *     1.41: WP 11-18, title Nov. 18, body November 20. 1.43: WP 12-20,
 *     title Dec. 19, body December 23. 2.00: WP 04-06, title April 8, body
 *     April 9 — the vendor's own title is the wrong one; Jam unlocked on the
 *     9th. The BODY SENTENCE is the only authority. The year comes from the
 *     post date with a December→January rollover guard, or from the body when
 *     it states one (2.01 and 2.02 do).
 * (c) FULLWIDTH PARENTHESES. `[Ver. 1.52] Patch Notes（February 25, 2026）`
 *     uses U+FF08/U+FF09. A `\(` matcher silently misses it; the title
 *     parenthetical reader below uses `[（(]` / `[）)]`.
 * (d) DOUBLE SPACES. `Update to  Ver1.09`, `(Nov.  18, 2024)`. Every literal
 *     space in every pattern is `\s+`, AND the text is whitespace-collapsed
 *     first — both, because one of the two will be removed by someone who
 *     thinks it redundant, and the other still holds.
 *
 * ── THE BODY REGEX IS NOT THE RECON'S, AND HERE IS WHY ────────────────────
 * patches-live.md §3(b) proposed an unanchored pattern ending in
 * `(?:on|after maintenance on)\s+([A-Z][a-z]+)\.?\s+(\d{1,2})`. Run over the
 * live bodies on 2026-09-08 it fails four rows: the `on` that ends the word
 * "Season" in "Season Pass 5" makes it read "Pass 5" as a date on 2.00 and
 * 2.02; 2.01 says "will be available May 14, 2026" with no "on" at all; and
 * 1.50 has no verb — "will have an update to Version 1.50 on October 9 after
 * maintenance". The pattern below is ANCHORED ON THE VERSION TOKEN the title
 * named, the verb and the "on" are optional, and the month is an explicit
 * alternation. It reads 41/41 of the bodies that state a date and cannot
 * match "Pass".
 *
 * ── THE BATTLE VERSION IS CROSS-CHECKED TOO ────────────────────────────────
 * The notes say "Updated the Battle Version from Ver. 4.01 to Ver. 4.02". The
 * `to` half is THIS patch's battle version, the `from` half is the value in
 * force on the patch before it, and seasons.ts transcribes both halves. A
 * mismatch on either is DRIFT — it is how a from-half copied onto the wrong
 * row shows up. A battle MAJOR bump with no SEASONS row opening on that date
 * is DRIFT as well: the battle major is this game's era authority.
 *
 * ── THE EXEMPTIONS ARE BY NAME, WITH A REASON EACH ─────────────────────────
 * The three 2021 notes (1.03, 1.05, 1.07) are past-tense and state no date.
 * 1.03's table date is deliberately the STEAM date, 2021-06-18, one week after
 * this post's PS date — see DATELESS_OK. A fourth dateless body still fails.
 *
 * NETWORK, MANUAL, NEVER IN THE CRON. A vendor outage is not a data error and
 * must not redden a refresh that produced correct data: it prints "NOT
 * verified" and exits 0. Drift and unreadable input exit 1. The last line is
 * always the machine-readable trailer `patch-check: <STATE>`, which the
 * workspace runner (check-patches.sh) files the game under — never prose.
 * The 90-day cadence alarm that makes a stale table DISCOVERABLE lives in
 * scripts/expiries.ts (STALE_PATCH_DAYS in seasons.ts); this is the check it
 * tells you to run.
 *
 * Run: npm run data:patch-check
 */

import type { PatchBoundary, SeasonBoundary } from '../types/index';
import { PATCHES, SEASONS, STALE_PATCH_DAYS } from './seasons';

const ENDPOINT =
  process.env.PATCH_CHECK_URL ??
  'https://www.guiltygear.com/ggst/en/wp-json/wp/v2/posts' +
    '?categories=4&per_page=100&orderby=date&order=asc&_fields=id,date,link,title,content';
const UA = 'ggst-replay-database/patch-check';

/** Fewer posts than this and the category id has been reassigned or the
 *  endpoint has moved: every "missing" line after that would be noise. 46 on
 *  2026-09-08; the feed only grows, but a vendor may prune a known-issues post. */
export const FLOOR_POSTS = 40;

/** The vendor's version grammar — X.YY, minor zero-padded — as the leading
 *  bracket of every patch-category title. 46/46 on 2026-09-08. */
const VER = /^\[Ver\s*\.?\s*(\d+\.\d{2})\]/;
/** What makes a bracketed post a PATCH NOTE rather than a known-issues post.
 *  Three spellings across five years: "Patch Notes", "Version 1.03 Update
 *  Changes", "Changes Made in Update to Ver1.09". */
const NOTES = /patch\s*notes?|update\s*changes|changes\s+made\s+in\s+update/i;
/** A numbered table row. Date-token rows (launch, the three pre-release
 *  builds) have no vendor post by construction. */
const VERSION_SHAPE = /^\d+\.\d{2}$/;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const MONTH =
  '(January|February|March|April|May|June|July|August|September|October|November|December)';

/** The title parenthetical: "(Oct. 31, 2024)", "（February 25, 2026）",
 *  "(Update: Dec. 11)". Read ONLY to count how often it contradicts the body;
 *  never for a date. (c) and (d) both live here. */
const TITLE_PAREN = /[（(]\s*(?:Update:\s*)?([A-Z][a-z]+)\.?\s+(\d{1,2})(?:,\s*(\d{4}))?\s*[）)]/;
/** "Updated the Battle Version from Ver. 4.01 to Ver. 4.02", "The battle
 *  version has been updated from 1.04 to 1.05", "Updated the Battle Version
 *  to Ver.4.06". The "Ver." between the numbers is why a `[^.]` window cannot
 *  reach the second one. Not "a new Battle Version (Ver.5.00)" and not
 *  "(Battle Version 4.09)" — neither has a `to`, and the second names an OLD
 *  version. */
const BATTLE =
  /battle\s+version\s+(?:has\s+been\s+updated\s+|updated\s+)?(?:from\s+(?:Ver\.?\s*)?(\d+\.\d{2})\s+)?to\s+(?:Ver\.?\s*)?(\d+\.\d{2})/i;

/**
 * Patch-note posts that state no release date, and why each is allowed. Keyed
 * by version so a NEW dateless body still fails. The table's date for each is
 * the Steam post title's, the best source that exists for a past-tense note.
 */
export const DATELESS_OK: Record<string, string> = {
  '1.03':
    'past-tense PS4/PS5-only note ("We have released…"), no release sentence. The table ' +
    'carries the STEAM date 2021-06-18 (Steam: "v1.03 Update Notice (2021/6/18)"), one week ' +
    "after this post's PS date 2021-06-11, because the corpus is PC/YouTube-sourced — see " +
    'the 1.03 row in scripts/seasons.ts. The vendor post date is NOT the table date, on purpose.',
  '1.05':
    'past-tense ("has been released"), no date in the body; table date is Steam\'s 2021-06-29',
  '1.07':
    'past-tense ("has been released"), no date in the body; table date is Steam\'s 2021-07-27',
};

// ── the feed ────────────────────────────────────────────────────────────────

interface WpPost {
  id: number;
  /** Site-local, no zone: "2026-07-01T14:24:47". Read for the YEAR only. */
  date: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
}

/** Tags out, entities decoded, whitespace collapsed — (d) at the source. */
export const strip = (s: string | undefined): string =>
  (s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&reg;/g, '®')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** Every post in the category, across every page. Throws on any transport or
 *  shape problem — the caller turns that into UNVERIFIED. */
async function upstream(): Promise<WpPost[]> {
  const posts: WpPost[] = [];
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    // PATCH_CHECK_URL is the network control's override and may carry no query
    // string of its own; the page parameter joins with whichever separator is right.
    const res = await fetch(`${ENDPOINT}${ENDPOINT.includes('?') ? '&' : '?'}page=${page}`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
    });
    if (!res.ok)
      throw new Error(`guiltygear.com wp-json returned HTTP ${res.status} on page ${page}`);
    pages = Number(res.headers.get('x-wp-totalpages') ?? 1);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) throw new Error('wp-json returned a non-array — the endpoint moved');
    posts.push(...(body as WpPost[]));
  }
  return posts;
}

// ── parsing one post ────────────────────────────────────────────────────────

export interface Announced {
  version: string;
  id: number;
  link: string;
  title: string;
  /** ISO day of the WP `date` — context in messages, never an authority. */
  posted: string;
  /** The body's release day, or null on a DATELESS_OK version. */
  start: string | null;
  /** What the title parenthetical says, when it carries one. Counted only. */
  titleDate: string | null;
  battle?: { from?: string; to: string; phrase: string };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const monthIndex = (name: string): number => MONTHS.indexOf(name.toLowerCase());
const abbrevIndex = (name: string): number =>
  MONTHS.findIndex((m) => m.startsWith(name.slice(0, 3).toLowerCase()));

/** A month/day (and maybe a year) into an ISO day. Without a stated year the
 *  post's year is used, with a rollover guard in BOTH directions: a December
 *  post announcing January, and a January post recapping December. */
function isoDay(month: number, day: number, year: number | null, posted: string): string {
  let y = year ?? Number(posted.slice(0, 4));
  if (year === null) {
    const postedMonth = Number(posted.slice(5, 7)) - 1;
    if (month < postedMonth - 6) y += 1;
    else if (month > postedMonth + 6) y -= 1;
  }
  return `${y}-${pad2(month + 1)}-${pad2(day)}`;
}

/** The release day the body states for THIS version, or null. Anchored on the
 *  version token so a sentence about a Season Pass, a DLC item or an
 *  availability period cannot be read as the release. */
export function bodyDate(version: string, body: string, posted: string): string | null {
  const v = version.replace('.', '\\.');
  const re = new RegExp(
    `Ver(?:sion)?\\.?\\s*${v}\\s+` +
      `(?:will\\s+be\\s+(?:released|available)|was\\s+released|has\\s+been\\s+released)?` +
      `(?:\\s*after\\s+maintenance)?(?:\\s*on)?\\s*${MONTH}\\.?\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?`,
  );
  const m = re.exec(body);
  if (!m) return null;
  const month = monthIndex(m[1]!);
  if (month < 0) return null;
  return isoDay(month, Number(m[2]), m[3] ? Number(m[3]) : null, posted);
}

function titleDate(title: string, posted: string): string | null {
  const m = TITLE_PAREN.exec(title);
  if (!m) return null;
  const month = abbrevIndex(m[1]!);
  if (month < 0) return null;
  return isoDay(month, Number(m[2]), m[3] ? Number(m[3]) : null, posted);
}

function battleVersion(body: string): Announced['battle'] | undefined {
  const m = BATTLE.exec(body);
  if (!m) return undefined;
  return { ...(m[1] ? { from: m[1] } : {}), to: m[2]!, phrase: m[0] };
}

export interface Classified {
  announced: Announced[];
  /** Bracketed, not a patch note — the two Known Issues posts. Printed. */
  skipped: { title: string; posted: string }[];
  /** Neither a patch note nor a bracket, a patch note with no bracket, a
   *  patch note whose body states no date and is not exempt, or a version
   *  announced twice. Any of these refuses the run. */
  unreadable: { title: string; posted: string; why: string }[];
}

/** Sort every post into announced / skipped / unreadable. Pure. */
export function classify(posts: WpPost[]): Classified {
  const out: Classified = { announced: [], skipped: [], unreadable: [] };
  const seen = new Map<string, number>();
  for (const p of posts) {
    const title = strip(p.title?.rendered);
    const posted = String(p.date ?? '').slice(0, 10);
    const ver = VER.exec(title)?.[1];
    const notes = NOTES.test(title);
    if (!ver) {
      out.unreadable.push({
        title,
        posted,
        why: notes
          ? 'a patch note whose version bracket will not parse — teach VER the new spelling'
          : 'neither a version bracket nor a patch-note title — teach VER/NOTES or explain the post',
      });
      continue;
    }
    if (!notes) {
      out.skipped.push({ title, posted });
      continue;
    }
    if (seen.has(ver)) {
      out.unreadable.push({
        title,
        posted,
        why: `a second patch note for ${ver} (first was post-${seen.get(ver)}) — which is canonical?`,
      });
      continue;
    }
    seen.set(ver, p.id);
    const body = strip(p.content?.rendered);
    const start = DATELESS_OK[ver] ? null : bodyDate(ver, body, posted);
    if (start === null && !DATELESS_OK[ver]) {
      out.unreadable.push({
        title,
        posted,
        why:
          'body states no release date this script can read — the WP date and the title are ' +
          'NOT substitutes (b); teach bodyDate the new sentence, or exempt the version in DATELESS_OK with a reason',
      });
      continue;
    }
    const battle = battleVersion(body);
    out.announced.push({
      version: ver,
      id: p.id,
      link: p.link,
      title,
      posted,
      start,
      titleDate: titleDate(title, posted),
      ...(battle ? { battle } : {}),
    });
  }
  return out;
}

// ── the diff ────────────────────────────────────────────────────────────────

export interface Finding {
  /** + announced, not in the table · ~ a row the vendor contradicts · - a row on
   *  no vendor post · ⓘ informational */
  glyph: '+' | '~' | '-' | 'ⓘ';
  text: string;
}
export const fatal = (f: Finding): boolean => f.glyph !== 'ⓘ';

const major = (v: string): number => Number(v.split('.')[0]);
/** Post id → the table's own permalink grammar, so a printed row pastes. */
const postRef = (a: Announced): string =>
  /\/news\/post-(\d+)\/$/.test(a.link) ? `post(${a.id})` : `'${a.link}'`;

/** Compare the announced set with PATCHES and SEASONS. Pure; `now` injectable. */
export function diff(
  announced: Announced[],
  table: PatchBoundary[],
  seasons: SeasonBoundary[],
  now = new Date(),
): Finding[] {
  const findings: Finding[] = [];
  const rows = new Map(table.map((r) => [r.version, r]));
  const byDate = [...announced].sort((a, b) =>
    (a.start ?? a.posted).localeCompare(b.start ?? b.posted),
  );
  const numbered = table
    .filter((r) => VERSION_SHAPE.test(r.version))
    .sort((a, b) => a.start.localeCompare(b.start));
  const prevRow = (v: string): PatchBoundary | undefined => {
    const i = numbered.findIndex((r) => r.version === v);
    return i > 0 ? numbered[i - 1] : undefined;
  };

  // exemptions, printed so nobody has to open this file to know why
  for (const a of announced) {
    if (a.start === null)
      findings.push({ glyph: 'ⓘ', text: `${a.version}: no body date — ${DATELESS_OK[a.version]}` });
  }

  for (const a of announced) {
    const row = rows.get(a.version);
    if (!row) {
      const bv = a.battle ? `battleVersion: '${a.battle.to}', ` : '';
      findings.push({
        glyph: '+',
        text:
          `${a.version} (${a.start ?? `${a.posted} — WP date, body dateless; VERIFY`}) — announced by ArcSys, ` +
          `missing from PATCHES in scripts/seasons.ts:\n` +
          `    { version: '${a.version}', start: '${a.start ?? a.posted}', ${bv}url: ${postRef(a)}, announcedOn: 'guiltygear-news' },` +
          (a.start === null
            ? ' // start is the WP date, not a body date — VERIFY before pasting'
            : ''),
      });
      continue;
    }
    // (b): the body date is the authority; WP date and title date are context
    if (a.start !== null && a.start !== row.start) {
      findings.push({
        glyph: '~',
        text:
          `${a.version} — the table says ${row.start}, the vendor's body sentence says ${a.start}` +
          ` (WP date ${a.posted}${a.titleDate ? `, title says ${a.titleDate}` : ''} — neither is the authority)`,
      });
    }
    if (a.battle) {
      // the `to` half is this row's battle version
      if (row.battleVersion && row.battleVersion !== a.battle.to) {
        findings.push({
          glyph: '~',
          text:
            `${a.version} — the table says battle ${row.battleVersion}, the vendor's note says ${a.battle.to} ` +
            `("${a.battle.phrase}")` +
            (a.battle.from === row.battleVersion
              ? ' — the FROM half was transcribed onto this row; it belongs on the row before'
              : ''),
        });
      } else if (!row.battleVersion) {
        findings.push({
          glyph: 'ⓘ',
          text: `${a.version} — vendor states battle ${a.battle.to}${a.battle.from ? ` (from ${a.battle.from})` : ''}; the table row carries none — fillable`,
        });
      }
      // the `from` half is the value in force on the row before
      const prev = a.battle.from ? prevRow(a.version) : undefined;
      if (prev && a.battle.from) {
        if (prev.battleVersion && prev.battleVersion !== a.battle.from) {
          findings.push({
            glyph: '~',
            text:
              `${prev.version} — the table says battle ${prev.battleVersion}, but ${a.version}'s note says the ` +
              `version in force before it was ${a.battle.from} ("${a.battle.phrase}")`,
          });
        } else if (
          !prev.battleVersion &&
          !announced.find((x) => x.version === prev.version)?.battle
        ) {
          findings.push({
            glyph: 'ⓘ',
            text: `${prev.version} — ${a.version}'s note implies battle ${a.battle.from} was in force; the table row carries none — fillable`,
          });
        }
      }
      // a battle MAJOR bump is a season boundary, in the vendor's own words
      if (a.battle.from && major(a.battle.to) !== major(a.battle.from) && a.start !== null) {
        const opens = seasons.find((s) => s.start === a.start);
        if (!opens) {
          findings.push({
            glyph: '~',
            text:
              `${a.version} (${a.start}) bumps the battle major ${a.battle.from} → ${a.battle.to} and no ` +
              `SEASONS row opens on that date — the era authority on this game is the battle major`,
          });
        } else if (opens.battleMajor !== major(a.battle.to)) {
          findings.push({
            glyph: '~',
            text: `S${opens.season} opens ${opens.start} with battleMajor ${opens.battleMajor}, but ${a.version}'s note goes to battle ${a.battle.to}`,
          });
        }
      }
    }
  }

  // reverse: every numbered row needs a vendor post. The feed is COMPLETE (it
  // is the vendor's own archive, read in full), so unlike CotW's aged-out feed
  // a row on no post is not "fine" — it is invented, or the post was deleted.
  const announcedVersions = new Set(announced.map((a) => a.version));
  for (const r of numbered) {
    if (!announcedVersions.has(r.version)) {
      findings.push({
        glyph: '-',
        text: `${r.version} (${r.start}) — in PATCHES, on no vendor patch note (invented, or the post was removed)`,
      });
    }
  }

  // how often the title contradicts the body — the live number behind (b)
  const dated = announced.filter((a) => a.titleDate !== null && a.start !== null);
  const contradict = dated.filter((a) => a.titleDate !== a.start);
  if (dated.length) {
    findings.push({
      glyph: 'ⓘ',
      text:
        `title parenthetical contradicts the body on ${contradict.length} of ${dated.length} titles that carry one` +
        (contradict.length ? ` (${contradict.map((a) => a.version).join(', ')})` : '') +
        ' — why nothing here reads a date from a title',
    });
  }

  // the feed's own age. A quiet vendor and a dark feed look alike.
  const newest = byDate.at(-1);
  if (newest) {
    const day = newest.start ?? newest.posted;
    const age = Math.floor((now.getTime() - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
    findings.push({
      glyph: 'ⓘ',
      text:
        `feed: newest patch note ${newest.version} (${day}), ${age} days ago — the ${STALE_PATCH_DAYS}-day ` +
        `alarm in scripts/expiries.ts reads only the table; this is the check it points at`,
    });
  }
  return findings;
}

// ── the run ─────────────────────────────────────────────────────────────────
//
// isMain, not a bare argv check, as in scripts/seasons.ts: this module exports
// pure functions and must be importable by a fixture without firing the run.
const isMain = !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);

if (isMain) {
  const reason = (e: unknown): string => {
    const cause = (e as { cause?: { code?: string } })?.cause?.code;
    return `${e instanceof Error ? e.message : String(e)}${cause ? ` (${cause})` : ''}`;
  };

  const posts = await upstream().catch((e: unknown) => {
    // Cannot-verify is not drift. Say so plainly and leave the run green.
    console.warn(`⚠ patch table NOT verified — ${reason(e)}`);
    console.log('patch-check: UNVERIFIED');
    process.exit(0);
  });

  if (posts.length < FLOOR_POSTS) {
    console.error(
      `✖ only ${posts.length} post(s) in category 4 (floor ${FLOOR_POSTS}; 46 on 2026-09-08) — the category ` +
        'id has been reassigned or the endpoint moved. Refusing to report: every "missing" line would be noise.',
    );
    console.log('patch-check: UNREADABLE');
    process.exit(1);
  }

  const { announced, skipped, unreadable } = classify(posts);

  const newestPost = [...posts]
    .map((p) => p.date.slice(0, 10))
    .sort()
    .at(-1);
  const newestRow = PATCHES.at(-1);
  console.log(
    `ArcSys news: ${posts.length} posts in category 4 (patch), ${announced.length} patch notes, ` +
      `${skipped.length} bracketed non-notes skipped, newest post ${newestPost}`,
  );
  console.log(
    `Table:       ${PATCHES.length} rows (${PATCHES.filter((p) => VERSION_SHAPE.test(p.version)).length} versioned), ` +
      `newest ${newestRow?.version} (${newestRow?.start})\n`,
  );
  for (const s of skipped)
    console.log(
      `  ⓘ ${s.posted}  ${JSON.stringify(s.title)} — a bracket but not a patch note; skipped`,
    );

  if (unreadable.length) {
    console.error(`\n✖ ${unreadable.length} category-4 post(s) this script cannot read:\n`);
    for (const u of unreadable)
      console.error(`    ${u.posted}  ${JSON.stringify(u.title)}\n      ${u.why}`);
    console.error(
      '\n  Refusing to report on the rest. A post this script cannot read is indistinguishable\n' +
        '  from a patch that never shipped, and skipping it quietly is how a checker ends up\n' +
        '  confirming exactly the staleness it exists to catch.',
    );
    console.log('patch-check: UNREADABLE');
    process.exit(1);
  }

  const findings = diff(announced, PATCHES, SEASONS);
  const info = findings.filter((f) => !fatal(f));
  const drift = findings.filter(fatal);
  for (const f of info) console.log(`  ${f.glyph} ${f.text}`);

  if (drift.length === 0) {
    console.log(
      `\n✓ the patch table matches every ArcSys patch note — ${announced.length} versions, every body date ` +
        'and every stated battle version identical',
    );
    console.log('patch-check: CURRENT');
    process.exit(0);
  }

  console.error(`\n✖ patch table has drifted from guiltygear.com (${drift.length}):\n`);
  for (const f of drift) console.error(`  ${f.glyph} ${f.text}`);
  console.error(
    '\nEdit PATCHES in scripts/seasons.ts (rows in date order, the BODY date, both halves of\n' +
      'the battle version), run `npm run data:seasons` to validate, then `npm run data:parse` —\n' +
      'not `data:emit` alone: MatchVideo.patch is stored on each record at parse time and\n' +
      'emit copies it, so only a re-parse refiles the replays under the corrected window.\n' +
      'Every replay published since a missing patch is currently filed under the previous\n' +
      'token — it renders and filters cleanly, and is wrong.\n',
  );
  console.log('patch-check: DRIFT');
  process.exit(1);
}
