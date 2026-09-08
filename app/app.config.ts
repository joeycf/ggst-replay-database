import patchGroups from '../data/patchGroups.json';
import type { GameConfig } from '@engine/types';

/**
 * The GUILTY GEAR -STRIVE- GameConfig — merged OVER the engine's neutral
 * default. Everything game-shaped the engine renders comes from here via
 * useGame(); the visual skin lives separately in app/assets/theme.css.
 *
 * The genericity knobs, deliberately:
 *
 * - charactersPerSide 1. `Side.characters` is still 1..N rather than a single
 *   string, because a tournament SET whose loser counter-picked legitimately
 *   lists every character used. Measured 2026-09-07: 134 YouTube titles (0.69%)
 *   and 75 of Replay Theater's 21,944 rows name two or more on one side. Zero
 *   is the only failure and emit hard-fails on it.
 *
 * - filters.coOccurrence FALSE. There is no same-side duo on a 1v1 game, so the
 *   panel would render an empty pair set. `pairingUsage` is not emitted.
 *
 * - filters.rank FALSE, and this game is the one where that call is HARD rather
 *   than obvious. Strive has a real ladder (Floor 1–10, Celestial) AND abundant
 *   per-character leaderboard positions, in the same corpus, which no sibling
 *   has faced. The ladder appears on exactly one channel — ggstLowLevel, which
 *   is dormant since 2026-07-16 and names no player on 96.5% of its titles. The
 *   leaderboard positions are everywhere and come in at least six spellings
 *   ("#1 Ranked", "TOP Ranked", "Rank 1st", "Rank 7th", "Rank TOP", "HIGH
 *   RANK"). A leaderboard position describes one character's standing that week,
 *   not the player and not the match, so it is STRIPPED and never becomes
 *   Side.rank — the same call SF6 and CotW make. Turning the facet on would
 *   render a filter with a dormant channel behind it.
 *
 * - terms UNSET. Arc System Works' own site files the roster at
 *   guiltygear.com/ggst/en/character/, so "character" IS this game's vocabulary
 *   and characterRouteSegment stays 'characters'. That is a check, not a
 *   default falling through — Tōkon overrides to /fighters/ because its game
 *   says fighters.
 *
 * - sourceGroups SET FROM DAY ONE. With eight intake channels, 1:1 chips would
 *   be an eight-chip filter bar. Note what this costs: the engine renders ONLY
 *   group chips when sourceGroups is set, so per-channel chips leave the filter
 *   bar. They do not leave the data — SourceBadge still names the real channel
 *   on every card, and a group toggle writes its member ids into the same
 *   `?src=` CSV, so every per-channel deep link still resolves.
 *
 * Accents are transcribed from design/handoff/tokens.css (--char-*), the design
 * system's source of truth — scripts/characters.ts reads the same block when
 * building data/characters.json, so config and data cannot drift, and a roster
 * id with no token fails loud rather than shipping an unstyled fighter.
 *
 * THE KEYS HERE ARE FULL-NAME KEBAB; THE HANDOFF'S TOKENS ARE SHORT. That is a
 * deliberate divergence and scripts/characters.ts owns the mapping in one
 * place. 14 of the 34 tokens re-key (sol → sol-badguy, ky → ky-kiske, dizzy →
 * queen-dizzy, …); 20 are identical. The reason is measured: ComboForge keys
 * characters by FULL name, so full-name ids make their deep links derive with
 * 4 overrides instead of 17 — one naming decision, made once, for the design
 * system and the partner link both. CotW recorded the same reasoning; Strive's
 * handoff reversed it without comment, and nothing but this file would catch
 * that.
 */
export default defineAppConfig({
  game: {
    id: 'ggst',
    slug: 'ggst',
    name: 'GUILTY GEAR -STRIVE-',
    // "STRIVE/REPLAY" in the header wordmark — the community's own short form,
    // the vendor's own subtitle, and what every contributing channel writes.
    // The series name would make it "GUILTY GEAR/REPLAY", half again the width
    // of any sibling's. Pure ASCII, so no latin-ext dependency in the display
    // face.
    shortName: 'STRIVE',
    rightsHolder: 'ARC SYSTEM WORKS',
    // THE LICENCE NOTICE, and the reason engine v0.12.1 exists. Every portrait
    // and splash here is cropped from Arc System Works' own Fan Kit, whose
    // terms (guiltygear.com/ggst/en/fankit/, Article 3.1, read firsthand
    // 2026-09-07) require "© ARC SYSTEM WORKS" in an easily visible location
    // on any page that shows the art — "(C)" permitted where © garbles. The
    // engine renders this string in the footer at every width, verbatim; it
    // is also baked into public/og-default.png, which travels standalone.
    // Lucy is the one fighter this does NOT cover: Article 5 carves her out of
    // the kit entirely, so her tile is generated, carries no ASW asset, and
    // owes no credit — scripts/art.ts and data/art-provenance.json say so.
    artCredit: 'Character art © ARC SYSTEM WORKS',
    baseURL: '/ggst', // behind the shell at replaydatabase.com/ggst
    siteUrl: 'https://replaydatabase.com',
    // Web Analytics beacons go to THIS project instead of pooling into the
    // shell. Paired 1:1 with the shell vercel.json rewrite
    //   /ggst-insights/:path* → https://ggst-replay-database.vercel.app/_vercel/insights/:path*
    // — the two ship together or every beacon 404s, silently. Same-origin on
    // purpose: the child's endpoints send no CORS headers, so an absolute URL
    // here would die at preflight.
    observability: { insights: '/ggst-insights' },
    charactersPerSide: 1,
    filters: {
      coOccurrence: false,
      rank: false,
    },
    // No GameStatsPanels override ships, so the stats page's `beside-timeline`
    // anchor is empty — give the meta-over-time chart the whole row. Top 8 of a
    // 34-fighter roster, the largest on the platform.
    stats: {
      metaTimelineTopN: 8,
      metaTimelineFullWidth: true,
    },
    // INHERITED FROM CotW AND NOT YET RE-DERIVED — see scripts/art.ts.
    // CotW measured '100% 50%' against splashes its own art.ts composes at the
    // hero's 4.2353:1 ratio; that arithmetic only holds once the same
    // composition exists here. Strive's art pipeline is NOT CotW's: the
    // "top of the figure is the head" heuristic holds for 6 of 34 fighters
    // (6 more warn, 22 need a hand-read), and the source aspect ratio spans
    // 0.90 to 2.07, so the crop table is the thing that decides this value.
    // Re-measure when art.ts lands; do not treat this as verified.
    heroFocus: '100% 50%',
    accents: {
      // Base roster (launch 2021-06-11)
      'sol-badguy': '#FF8C1A',
      'ky-kiske': '#5C9DFF',
      may: '#FFC27A',
      'axl-low': '#FFD23B',
      'chipp-zanuff': '#9BF0C8',
      potemkin: '#C78356',
      faust: '#D9A5FF',
      'millia-rage': '#FFF0C2',
      'zato-1': '#A36FC9',
      'ramlethal-valentine': '#B9F27A',
      'leo-whitefang': '#F3D98C',
      nagoriyuki: '#C05AA0',
      giovanna: '#3FCB6E',
      'anji-mito': '#3A8FD9',
      'i-no': '#FF6E7B',

      // Season 1 (2021-07-27 → 2022-03-28)
      'goldlewis-dickinson': '#A9AE4E',
      'jack-o': '#FFC4A8',
      'happy-chaos': '#EEF1F5',
      baiken: '#F062B4',
      testament: '#A7A2D9',

      // Season 2 (2022-08-08 → 2023-05-25)
      bridget: '#7CC4FF',
      'sin-kiske': '#A3BCFF',
      bedman: '#FF8FB8',
      'asuka-r': '#B3ECFF',

      // Season 3 (2023-08-24 → 2024-05-30)
      johnny: '#7C86E0',
      'elphelt-valentine': '#FFCCE0',
      aba: '#E5414A',
      slayer: '#D45078',

      // Season 4 (2024-10-31 → 2025-08-21)
      'queen-dizzy': '#5FE0BE',
      venom: '#8870F5',
      unika: '#4FDCF7',
      lucy: '#D6CCFF',

      // Season 5 (2026-04-09 → 2026-07-02); slots 3–4 are unnamed '???'
      'jam-kuradoberi': '#FF7F6E',
      'robo-ky': '#9FB4C4',
    },
    // The badge/filter tokens. 1:1 with scripts/channels.ts ChannelKey today —
    // array order there is also the dedupe precedence, argued in its header.
    // APPEND only: inserting would recolour shipped badges.
    //
    // THE `name` VALUES MUST MATCH scripts/channels.ts, and NOTHING IN THE
    // PIPELINE CAN CHECK THAT. The data scripts are a separate TypeScript track
    // that cannot resolve the Nuxt `@engine`/app-config graph, so this pair is
    // two hand-kept lists. They drifted once already during the build (this
    // file said "Yumegiwa Online Tournament", channels.ts said "Yumegiwa
    // Tournament Replays"), which is exactly how a badge ends up naming a
    // channel the report does not. scripts/e2e.ts asserts the pair against the
    // BUILT app, which is the only place both are visible at once.
    sourceChannels: [
      { id: 'ggHighLevel', name: 'GGST: High Level Gameplay' },
      { id: 'guiltyGearReplays', name: 'Guilty Gear Replays' },
      { id: 'ggstBattleCollection', name: 'GGST Battle Collection' },
      { id: 'ggstHq', name: 'Guilty Gear Strive HQ' },
      { id: 'ggstHighRank', name: 'GGST High Rank Replays' },
      { id: 'yumegiwa', name: 'Yumegiwa Tournament Replays' },
      { id: 'guiltyGearVods', name: 'Guilty Gear VODs' },
      { id: 'ggstLowLevel', name: 'GGST Low Level Gameplay' },
      // Named for what the footage IS, not for the catalogue that indexed it.
      { id: 'replayTheater', name: 'Replay Theater' },
    ],
    // Filter chips consolidate to two groups (engine v0.5.5). Group ids appear
    // NOWHERE else — not in Replay.source, not in a URL: toggling a group
    // writes its member ids to the same `?src=` CSV the per-channel links
    // already used.
    //
    // replayTheater sits in TOURNAMENT, and here that is a much easier call
    // than it was on CotW. CotW had to argue it: 96% of its catalogue was
    // online play and only 127 entries were tournament segments. Strive's split
    // is 32.74% tagged across 509 events — the highest tagged share on the
    // platform by 1.3× and 9× CotW's — and 7,183 of those 7,184 tagged rows are
    // UNIQUE to the catalogue, while 11,604 of its untagged rows duplicate
    // channels already in the Online group and are dropped by the
    // known-anywhere ignore. So the tournament arm is not merely its most
    // distinctive contribution, it is the majority of its unique contribution.
    //
    // yumegiwa is Tournament for the plainer reason: it runs numbered online
    // tournaments with published brackets, not ranked ladder play.
    sourceGroups: [
      {
        id: 'online',
        name: 'Online',
        sources: [
          'ggHighLevel',
          'guiltyGearReplays',
          'ggstBattleCollection',
          'ggstHq',
          'ggstHighRank',
          'guiltyGearVods',
          'ggstLowLevel',
        ],
      },
      {
        id: 'tournament',
        name: 'Tournament',
        sources: ['yumegiwa', 'replayTheater'],
      },
    ],
    // Era → patch hierarchy. PIPELINE-EMITTED (scripts/emit.ts →
    // data/patchGroups.json) from the same boundary authority that derives every
    // replay's patch token, so the UI hierarchy and the data cannot drift.
    // Vercel never runs the pipeline, so that artifact has to be committed.
    patchGroups,
    fonts: {
      display: 'Black Ops One',
      ui: 'Figtree',
      mono: 'JetBrains Mono',
    },
    manifest: {
      themeColor: '#D9A53A',
      backgroundColor: '#0B0D11',
    },
    ogImage: '/og-default.png',
    // ComboForge cross-link on character pages (engine v0.11.0). Their game id
    // for this one IS ours — 'ggst' — checked live 2026-09-07 rather than
    // assumed, because it is not the norm (Tōkon's is 'marveltokon').
    //
    // 29 of our 34 derive cleanly because the roster ids are full-name kebab,
    // which is the shape ComboForge uses. Five need an entry, and four of those
    // are PUNCTUATION rather than name length — Strive is the first game on the
    // platform whose partner ids are not `[a-z0-9-]`: they keep the dots, the
    // sharp, the question mark and the apostrophe verbatim. encodeURIComponent
    // handles all four; the map just has to state them.
    //
    // The fifth, jam-kuradoberi → jam, is the one that is NOT punctuation and
    // the one a full-name convention cannot derive: ArcSys's own detail page
    // says JAM KURADOBERI and ComboForge carries her as bare "Jam". It is the
    // mirror of CotW's lone 'ken' → 'ken-masters', where the vendor was short
    // and the partner was long.
    //
    // Verified against their live roster 2026-09-07, not assumed. Note it holds
    // 35 entries to our 34: they list both 'dizzy' and 'queen-dizzy' for the
    // same fighter. We key the one whose name matches ArcSys's detail page, and
    // their duplicate is simply an orphan on their side.
    //
    // Built and gated with the engine's `npm run verify:comboforge`. Do not
    // paste `--suggest` output raw for this game — it emits syntactically
    // invalid JavaScript here, unescaping Jack-O's apostrophe inside a
    // single-quoted string and leaving every hyphenated key unquoted.
    comboforge: {
      gameId: 'ggst',
      characters: {
        aba: 'a.b.a',
        'asuka-r': 'asuka-r#',
        bedman: 'bedman?',
        'jack-o': "jack-o'-valentine",
        'jam-kuradoberi': 'jam',
      },
    },
  } satisfies GameConfig,
});
