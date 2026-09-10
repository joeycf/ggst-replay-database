/**
 * Roster drift check — is data/characters.json still what Arc System Works ships?
 *
 * WHY THIS EXISTS. A roster goes stale silently: a fighter who is not on it
 * fails no build and trips no assertion, they just leave every match they
 * appear in filed with one side missing. See ../check-rosters.sh.
 *
 * THIS REPO ALREADY HAD THE HARD PART. scripts/roster.ts::scrapeRoster() reads
 * BOTH the character grid and the sitemap — two independent enumerations, for
 * the reasons documented there (the grid carries a 35th <h2> that is not a
 * character, and a season filter reorders it client-side). This file adds the
 * comparison and a machine-readable verdict; it does not re-implement the scrape.
 *
 * IT COMPARES SITE SLUGS, NOT NAMES, and that is load-bearing here more than
 * anywhere else: ArcSys publishes each fighter's name in three places and they
 * disagree for 13 of 34 (`SOL` vs `SOL BADGUY`, `DIZZY` vs `QUEEN DIZZY`).
 * The roster carries the vendor's slug in extra.siteSlug precisely so this
 * comparison can be exact. Names are for humans; slugs are for machines.
 *
 * THE PAIR THIS FORMS WITH scripts/expiries.ts. This checker is CONTENT-AWARE
 * and fires on the real event — a new slug appearing upstream. expiries.ts is
 * CLOCK-ONLY and nothing upstream can blind it. Keep both; this repo's siblings
 * learned that the sophisticated check is the one that goes quietly blind.
 *
 * NETWORK, MANUAL, NEVER IN THE CRON.
 *
 * Run: npm run data:roster-check
 */

import { UNRELEASED } from './expiries';
import { loadCharacters, scrapeRoster } from './roster';

type State = 'CURRENT' | 'DRIFT' | 'UNVERIFIED' | 'UNREADABLE';
const verdict = (state: State, detail = ''): never => {
  if (detail) console.log(detail);
  console.log(`roster-check: ${state}`);
  process.exit(state === 'CURRENT' || state === 'UNVERIFIED' ? 0 : 1);
};

async function main(): Promise<void> {
  const local = await loadCharacters();
  const gated = new Set(UNRELEASED.map((u) => u.id));

  /** roster id → the vendor slug it claims. A roster row with no siteSlug can
   *  never be matched upstream, so it is a defect in itself, not drift. */
  const slugOf = new Map<string, string>();
  const noSlug: string[] = [];
  for (const c of local) {
    const slug = (c.extra as { siteSlug?: string } | undefined)?.siteSlug;
    if (slug) slugOf.set(c.id, slug);
    else noSlug.push(c.id);
  }
  if (noSlug.length)
    return void verdict(
      'UNREADABLE',
      `✖ ${noSlug.length} roster row(s) carry no extra.siteSlug: ${noSlug.join(', ')}\n` +
        '  Nothing can be compared upstream for these. Fix ROSTER in scripts/characters.ts.',
    );

  let scrape: Awaited<ReturnType<typeof scrapeRoster>>;
  try {
    scrape = await scrapeRoster(false);
  } catch (e) {
    return void verdict('UNVERIFIED', `! could not reach guiltygear.com — ${(e as Error).message}`);
  }

  const grid = new Set(scrape.slugs);
  const sitemap = new Set(scrape.sitemapSlugs);
  if (grid.size === 0)
    return void verdict('UNREADABLE', '✖ the character grid yielded no slugs — markup drift.');

  // The sitemap is the grid's control. If the vendor's own two surfaces
  // disagree, neither is a trustworthy baseline and no verdict on OUR roster
  // would mean anything — so say so rather than picking a side.
  const gridOnly = [...grid].filter((s) => !sitemap.has(s)).sort();
  const mapOnly = [...sitemap].filter((s) => !grid.has(s)).sort();
  if (gridOnly.length || mapOnly.length)
    return void verdict(
      'UNREADABLE',
      '✖ the vendor’s own two enumerations disagree — no baseline to compare against.\n' +
        (gridOnly.length ? `  grid only:    ${gridOnly.join(', ')}\n` : '') +
        (mapOnly.length ? `  sitemap only: ${mapOnly.join(', ')}\n` : '') +
        '  Re-read scrapeRoster() in scripts/roster.ts before trusting either.',
    );

  const known = new Set(slugOf.values());
  const missing = [...grid].filter((s) => !known.has(s)).sort();
  const extra = [...slugOf.entries()].filter(([, s]) => !grid.has(s)).sort();

  console.log(
    `  ${grid.size} slug(s) on the grid (sitemap agrees) · ${local.length} in characters.json`,
  );
  const unnamed = scrape.dlc.filter((d) => d.name === '???');
  if (unnamed.length)
    console.log(
      `  ${unnamed.length} announced DLC slot(s) still unnamed: ` +
        unnamed.map((d) => `#${d.dlc} ${d.window ?? ''}`.trim()).join(' · '),
    );
  if (gated.size) console.log(`  ${gated.size} gated in UNRELEASED: ${[...gated].join(', ')}`);

  if (!missing.length && !extra.length)
    return void verdict('CURRENT', '✓ roster matches the character grid and the sitemap');

  const lines = ['✖ roster has drifted from guiltygear.com', ''];
  for (const slug of missing)
    lines.push(
      `  MISSING  site slug "${slug}" — upstream, with no roster row claiming it.`,
      `           A new fighter, or a slug ArcSys renamed. The name is the DETAIL PAGE'S`,
      `           <h1>, never the grid's <h2>. Full runbook in scripts/expiries.ts —`,
      `           remember TOKEN_FOR, which no other repo has.`,
    );
  for (const [id, slug] of extra)
    lines.push(
      `  EXTRA    ${id} (siteSlug "${slug}") — in characters.json, not upstream.`,
      `           Confirm before deleting: records already reference this id.`,
    );
  verdict('DRIFT', lines.join('\n'));
}

await main();
