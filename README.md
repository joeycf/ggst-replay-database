# GUILTY GEAR -STRIVE- — Replay Database

The Strive app for the [Replay Database](https://replaydatabase.com) platform: a
thin consumer of the shared `replay-engine` layer plus the bespoke Strive data
pipeline. Lives behind the umbrella shell at **replaydatabase.com/ggst**.

Game #6, and the **third consumer of the engine's
[NEW-GAME-CHECKLIST](../replay-engine/NEW-GAME-CHECKLIST.md)**. Step −1 of this
build was writing the checklist's missing amendments: Fatal Fury reported eleven
gaps on 2026-09-03 and none had been written down, so this game would have been
built against a checklist that predated the platform's Replay Theater work.
Those eleven, plus six this build found, are now in the file.

Where this repo diverges from a sibling, the divergence is argued in the file
that makes it. Those arguments are the useful part of this README's job, so it
links to them rather than restating them.

## What is in the archive

**24,706 records · 6,540 players · 34 fighters · 49,589 side appearances**,
running 2020-04-18 to today. Every one of the 48 patches has replays under it.

| where it comes from                | records |
| ---------------------------------- | ------: |
| Replay Theater (the catalogue)     |   8,245 |
| GGST: High Level Gameplay          |   5,767 |
| Guilty Gear Replays                |   3,175 |
| Guilty Gear Strive HQ              |   2,669 |
| GGST Battle Collection             |   2,253 |
| GGST High Rank Replays             |   1,469 |
| Yumegiwa Tournament Replays        |     970 |
| Guilty Gear VODs                   |     139 |
| GGST Low Level Gameplay _(frozen)_ |      19 |

7,966 of those are **segments** — a moment inside a longer stream, opening at
their own timestamp. The rest are whole videos.

## Sets, not matches — and the difference is in the record

The YouTube channels publish **sets**; Replay Theater's tagged arm publishes
**matches**. This is measured, not assumed (`ggst-notes` hydration pass,
2026-09-08, over all 18,509 marked uploads): a Strive game runs about three
minutes — the catalogue's own same-pair gap median is 196s — and every set
channel's 10th-percentile duration is at least 3m35 with medians of 5m21 to
10m30. The one per-game channel is `ggstLowLevel`, which is frozen.

So the archive does not say "N matches" the way CotW's does. A record carrying
`startSeconds` is a match; a whole-video record is a set. The record already
carries which, and nothing had to change in the schema to say so.

## The stat unit — side appearances

Strive is 1v1, so a side fields one character and a **mirror adds two** to that
character's total. There are **817 mirrors** here (3.3%), which is why the
alternative unit — a per-record deduped union — is wrong for this game: it would
silently under-count every one of them. One denominator drives `characterUsage`,
`byPatchUsage` and `playerCharacters`; `scripts/emit.ts` asserts the totals.

No `pairingUsage`. There is no same-side duo on a 1v1 game, and emitting C(n,2)
over a counter-pick side would fabricate pairs nobody played.

## Eight intakes, four title orientations, one parser

This is the game's defining problem. Two channels of comparable size run
**mirror-image grammars**:

```
ggHighLevel    GGST ▰ Jack (#1 Ranked Robo-Ky) vs Phaxy (#1 Ranked Testament)
ggstHighRank   GGST 🔥 #1 VENOM (Papaya) vs #2 I-NO (Daru_I-No)
```

A single rule of the form "the character is inside the parentheses" scores 98.2%
on the first and **0.0%** on the second — and the failure is invisible, because
every one of those 1,486 records renders normally with the player and the
fighter swapped. Two more shapes defeat the question outright: `ggstHq` has
brackets on 129 of 2,994 titles, and `ggstBattleCollection` puts the handle in
square brackets that can themselves contain round ones (`[ (ノ-_-)ノ ]`).

`parseSide` therefore resolves by **roster membership**, never by slot position,
and only records which slot held the fighter. When both spans resolve, the
channel's declared `slotOrder` breaks the tie and the side is marked
`tieBroken`. When nothing can decide, the record goes to the review queue with
both readings attached. Result on the full corpus: **2 slot-ambiguous records in
24,706**, and every channel's resolved majority matches its declared order.
`data/report.md` prints the mix per channel, both sides — a channel whose
tie-broken rate climbs is drifting, and that is visible before it is wrong.

## The registry invariant — no player is a fighter

Every handle is resolved through the roster matcher **at parse time**, not in a
test after the site is generated. A handle that resolves to a fighter and is not
on `CONFIRMED_FIGHTER_NAMED_PLAYERS` is a hard stop naming the video.

It fired on **69 handles and found zero defects**. Every one was a real person:
`Leo.` plays Faust, `Dizzy` plays Millia, `pot` plays Chipp, and the catalogue
itself carries a player called `Millia Rage`. All 85 rows carry a video id;
none is a guess. Expect it to keep firing — a 34-fighter roster and a five-year
corpus means new fighter-named players arrive continuously, and each one stops
the pipeline until a human looks. That is the cost of the guard, not a flaw in
it: the alternative is what put 26 fighter-named player pages on another game.

## Replay Theater is SF6's fetcher, not CotW's

CotW's is a rewrite at 40% the size, missing the cursor-gated dump, the hard
refusal on a cursor ahead of the catalogue, `crosscheck.ts`, the record floor and
partial resume. At **442 pages** those are not optional. Under CotW's
warn-and-sweep recovery a poisoned cursor can never heal — the fallback observes
a lower id than the poisoned value and the forward-only write refuses to move it
down — so the archive would sweep the whole catalogue every morning, forever,
behind a `continue-on-error` step.

The catalogue **moves**: 21,944 → 22,089 over three days, a baseline of about
10–12 rows a day with one bulk-submission day of +120. Nothing pins the count.

Liveness is **11.4% of videos dead** and it is _not_ age-graded the way CotW's
is. 2025 reads 0.23% and 2026 0.47%, but 2023 reads 34.6% — a channel that
submitted its back catalogue and later deleted it. Do not carry CotW's
"the decay is age-graded" sentence over; re-measure at ingest.

Trust, measured on the full sweep over 4,280 matchup-naming chapters: offsets
agree with the uploader's own chapter marks **93.9% within 30s, 86.8% exact**;
handles agree **81.5% raw and 81.6% sponsor-stripped**. That last pair retires a
hypothesis — the recon argued the raw figure understated agreement because
sponsor prefixes inflate the residue. Stripping them recovers four chapters.

## Patches: ArcSys's feed, and the Battle Version is the era authority

44 versions, `X.YY`, from ArcSys's own WordPress feed — **not** Steam's, which
carries about 24 of them in five title spellings and posted the Ver 1.18 season
opener with no version in the title at all.

**The game major is not the season.** Seasons 2, 3 and 4 all open inside the
`1.x` line (Ver 1.18, 1.29, 1.40); only Season 5 coincides with a major bump.
ArcSys publishes a _second_, independent Battle Version whose major increments
on all four season boundaries with zero exceptions, and `scripts/seasons.ts`
validates exactly that. Two mid-season patches are decoys a "big balance update
= new season" rule would misfile by 70 and 101 days.

Twelve version numbers were never published. They are not in the table.
`npm run data:patch-check` is what fills the rest in: it reads every patch body
and prints each vendor-stated Battle Version the table is missing. It caught a
real defect on its first run — a row carrying the _from_ half of "from 4.01 to
4.02" — which the table's own validator structurally could not see.

## The roster is 34, and the UNRELEASED gate ships empty

Enumerated from the vendor's own character pages with per-character provenance.
Season 5's two remaining slots are literally `???` on ArcSys's store page
(Winter 2026, Spring 2027) — no name, no portrait, no page, no sitemap entry, no
Fan Kit asset. There is nothing to gate on, and the site slugs are opaque
three-letter codes (`cos` = Happy Chaos, `rbk` = Robo-Ky), so a guess could not
be checked against anything. `npm run data:roster --scrape --names` and the
parse residue gate are the two detectors for a name appearing.

Ids are **full-name kebab** (`sol-badguy`, `queen-dizzy`, `jam-kuradoberi`),
which is CotW's convention and _not_ what the design handoff used. The reason is
measured: ComboForge keys characters by full name, so full-name ids derive 29 of
34 deep links against 17 overrides for short ones. `scripts/characters.ts` owns
the 14 re-keys in one place.

**Asuka ships as `Asuka R#` with an ASCII hash, not the vendor's `ASUKA R♯`.**
Parsing Black Ops One's real cmap found 693 codepoints and no U+266F, so the
official spelling would fall back to a system font for one glyph mid-name on the
character page and the OG card. ArcSys itself writes the ASCII form on its store
page. The U+266F spelling is kept in `extra.vendorName`, the vendor scrape
compares against _that_, and the matcher's positive control asserts it still
resolves.

## The art is the Fan Kit, and Lucy is carved out of it

33 of 34 fighters are cropped from ArcSys's own Fan Kit — enumerated from the
page, never constructed, because the kit's filename codes agree with neither
site slug and are not even stable within the kit.

**Lucy is generated.** Fan Kit **Article 5** withholds the _redistribution_
grant for her materials — CD PROJEKT RED's guideline governs her character, but
the artwork is ArcSys's rendering and publishing a crop is redistribution they
have not permitted. Her file is never fetched. The exclusion is one named
constant checked against the **live** Article 5 text on every run, so deleting
it fails the build before any network call rather than quietly opening a licence
hole. Her provenance row carries `credit: null` and the reason.

Article 3.1 requires `© ARC SYSTEM WORKS` on any page showing the art. Engine
**v0.12.1** exists for that: `GameConfig.artCredit` renders in the footer at
every width, and `scripts/og.ts` bakes it into the card, which travels
standalone where no footer follows.

"The top of the figure is the head" holds for **3 of 34** on these cutouts, so
30 carry a hand-read crop row. Four of those rows shipped pointing at _empty
background_ — the biggest shape near the top is often a gauntlet, a weapon or a
floating prop — so the crop now probes the alpha density around each crosshair
and refuses below 35%. The separation is unambiguous: off-figure reads 0–21%,
on-figure 51–85%.

## Scripts

| command                | what it does                                                           |
| ---------------------- | ---------------------------------------------------------------------- |
| `data:fetch`           | uploads-playlist walk, 8 channels. Never `search.list` (1 unit vs 100) |
| `data:theater`         | the catalogue. `--full`, `--fresh`, `--limit=N`, `--allow-shrink`      |
| `data:parse`           | title parse + the index merge, every guard, `data/report.md`           |
| `data:emit`            | the public contract, with every assertion a throw                      |
| `data:catchup`         | fetch → theater → parse → emit, in that order, as one command          |
| `data:characters`      | roster + all its validators                                            |
| `data:seasons`         | the patch table; `--check` runs inside `npm run typecheck`             |
| `data:patch-check`     | ArcSys's feed vs the table. Manual — a vendor outage is not ours       |
| `data:art` / `data:og` | the kit crops and the card. Manual; the kit changes on DLC days        |
| `verify:gates`         | the positive-control suite                                             |
| `verify:deployed`      | content-digest smoke check against production                          |
| `test:e2e`             | assertions against the built output                                    |

`npm run typecheck` — **never raw `tsc`**. The repo is two disjoint TypeScript
tracks and the root config delegates to Nuxt's, so `npx tsc --noEmit -p .`
reports clean while a pipeline script references deleted functions.

## Things worth knowing

**The collapse guard is awake on day one.** Four intakes commit over 1,400
records each, so a 10% loss is 148–585 and clears both thresholds comfortably.
Tōkon had to record that this guard _sleeps_ under ~200 records per channel;
here only `guiltyGearVods` (139) is genuinely below it.

**`ggstLowLevel` ships frozen**, and the freeze mechanism has a live consumer on
day one rather than waiting years to be needed. It stopped publishing
2026-07-16, and 606 of its 717 titles name no player at all — the parens hold a
Floor tier, not a handle. Its pin is 19. Editing that number is the deliberate
prune; a mismatch nobody edited means the archive moved on its own.

**`ggstHq` keeps its Shorts.** 434 of its uploads run under two minutes and are
fully titled matchups — YouTube Shorts, median exactly 60s — and **242 are the
only footage of that matchup on the channel**. The platform floor of 120s would
have dropped 14.5% of it silently, so that channel declares
`minDurationSec: 30`. The card shows the duration, so nothing pretends a Short
is a set.

**The version tokens in titles are counted, never minted as patches.** `ggstHq`
opens 644 of its uploads with a bare version and `ggstBattleCollection` glues one
to the marker (`GGST2.0➤`). The channel writes _both_ of ArcSys's version
spaces — 248 tokens match a Battle Version, 288 a game version, 0 both — and a
token appearing in no patch note may not become one.

**The marker is `STRIVE`, never `GUILTY GEAR`.** The series is 27 years old and
its back catalogue is live on these channels; matching the series name reads 576
Xrd and Rev2 uploads. And it must be `GGST(?![A-Za-z])`, never `\bGGST\b` —
`GGST2.0` is the dominant spelling on one channel and word-boundary loses 150 of
this repo's videos with no symptom (1,003 over the recon's wider sweep).

**Invisible Unicode is here, but not the one CotW found.** U+202F does not occur
at all in 56,951 titles. U+3000 does (547 times, hiding the hashtag-run
boundary) and U+00A0 does (4 times, _inside_ the game marker), so every literal
space in the marker is `\s+`. The normalization control asserts **identity**, not
the parse rate — a control that only asks "does it still parse" passes on a
pipeline with no normalization at all, because JS `\s` already covers these.

**Four handles are still decoration**, named with counts in `scripts/parse.ts`
rather than claimed gone. They survive because every word in them is a plausible
handle word somewhere else, and a blanket strip would cost real players.

## Daily data refresh

`.github/workflows/data-refresh.yml`, **08:47 UTC** — the sixth stagger slot,
which CotW's workflow reserved by name for game six. The platform's no-push
window is now 06:00–09:00. Game seven takes 09:17.

fetch → theater (allowed to fail, and last of the fetches) → parse → emit →
commit-if-changed → smoke check → expiries. The index pull is
`continue-on-error` because the cron must never depend on a third party
succeeding: on any failure there is no dump, parse carries the committed records
against the pin, and the run stays green.

Steady state is ~9–20 quota units a day. The one-time backfill was 828 — 8.3% of
the daily allowance — because it walks uploads playlists. The same backfill via
`search.list` would be 43,582 units and four days.

## Vercel

Project `ggst-replay-database`. `NUXT_PUBLIC_SITE_URL` and `NUXT_APP_BASE_URL`
(`/ggst/`) must both be set on **Production and Preview** before the first
build. The engine pin is `v0.12.1` and **that tag must exist on the remote** —
Vercel leaves `ENGINE_PATH` unset and clones the pinned ref.

`observability.insights: '/ggst-insights'` pairs 1:1 with the shell's rewrite.
The two ship together or every analytics beacon 404s, silently.
