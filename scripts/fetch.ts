// Stage 1: fetch every upload from the tracked Strive channels via the YouTube
// Data API v3, dump raw metadata to raw/<channel>.json, and print a
// reconnaissance report. The API key is LOCAL/CI-ONLY (never on Vercel — the
// site builds from committed JSON).
//
// UPLOADS-PLAYLIST PATH ONLY, NEVER search.list. playlistItems.list costs 1
// quota unit per 50 ids and videos.list 1 per 50 hydrations, so the whole
// 21,791-upload backfill is 828 units — 8.3% of one day's allowance
// (recon/channels-live.md §8, measured 2026-09-07). search.list costs 100 units
// per 50 results and would put the same backfill at 43,582 units, 4.4 days.
// The steady-state cron is ~9–20 units: eight first pages plus one hydration.
//
// NO GAME GATE HERE. raw/ holds everything the channels publish — including
// yumegiwa's 960 GBVSR and 328 Xrd Rev2 uploads — and parse.ts does the
// filtering. That has one consequence worth restating from CotW: THE COLLAPSE
// GUARD MUST COMPARE PARSED-VS-COMMITTED, never raw-vs-committed, or on the
// multi-game channel it measures the marker gate instead of the channel's
// health.
//
// Run: npm run data:fetch   (tsx --env-file-if-exists=.env scripts/fetch.ts)
//
// Flags:
//   --only=<ChannelKey>   fetch one channel.
//   --include-frozen      ALSO fetch frozen channels. The one legitimate use is
//                         seeding a freeze pin — see FROZEN below. Never on the
//                         cron.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIVE_CHANNELS, CHANNELS, hasStriveMarker } from './channels';
import { buildAliasMatcher, loadCharacters } from './roster';
import { apiGet, parseDuration, requireApiKey } from './youtube';
import type { AliasMatcher } from './roster';
import type { ChannelConfig, RawVideoRecord } from '../types/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_DIR = join(ROOT, 'raw');
requireApiKey('data:fetch');

interface PlaylistItemsResponse {
  items: { contentDetails: { videoId: string } }[];
  nextPageToken?: string;
}
interface VideosResponse {
  items: {
    id: string;
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      liveBroadcastContent: string;
      tags?: string[];
    };
    contentDetails: { duration?: string };
    statistics?: { viewCount?: string };
  }[];
}

async function fetchChannel(ch: ChannelConfig): Promise<RawVideoRecord[]> {
  // An index source has no channel and no playlist; it is pulled by
  // `npm run data:theater` and skipped by the caller. Asserted rather than
  // assumed, because reaching here with one would otherwise page YouTube for
  // `playlistId=undefined` and return an empty dump that looks like a dead
  // channel — which is precisely the shape the collapse guard exists to refuse,
  // arriving from our own bug rather than the channel's.
  if (!ch.uploadsPlaylist) {
    throw new Error(
      `${ch.id} has no uploadsPlaylist — an index source must be skipped before fetchChannel.`,
    );
  }

  // 1) every videoId from the uploads playlist (50/page, 1 quota unit each)
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page: PlaylistItemsResponse = await apiGet('playlistItems', {
      part: 'contentDetails',
      playlistId: ch.uploadsPlaylist,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of page.items) ids.push(it.contentDetails.videoId);
    pageToken = page.nextPageToken;
  } while (pageToken);

  // 2) hydrate 50 at a time. This is the ONLY place duration and
  //    liveBroadcastContent are read for the whole pipeline. The 2026-09-07
  //    recon never called videos.list; the 2026-09-08 hydration pass over all
  //    18,509 marked uploads (ggst-notes/hydration.md) did, and it is what
  //    measured MIN_MATCH_SEC and ggstHq's per-channel floor (parse.ts,
  //    types/index.ts minDurationSec), found `live` to be 1 upload in 18,509,
  //    and found `gone` to be 0 — which is structural, not luck: an
  //    uploads-playlist walk lists only videos that exist, so a deleted upload
  //    simply stops being listed and the only trace it leaves is a smaller
  //    dump. That is why the collapse guard reads counts and no miss class is
  //    named `gone`.
  const out: RawVideoRecord[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res: VideosResponse = await apiGet('videos', {
      part: 'snippet,contentDetails,statistics',
      id: ids.slice(i, i + 50).join(','),
      maxResults: '50',
    });
    for (const v of res.items) {
      out.push({
        id: v.id,
        channel: ch.id,
        title: v.snippet.title,
        description: v.snippet.description,
        publishedAt: v.snippet.publishedAt,
        durationSec: parseDuration(v.contentDetails.duration),
        ...(v.statistics?.viewCount ? { viewCount: Number(v.statistics.viewCount) } : {}),
        liveBroadcastContent: v.snippet.liveBroadcastContent,
        ...(v.snippet.tags ? { tags: v.snippet.tags } : {}),
      });
    }
  }

  // A playlist that listed ids but hydrated to nothing is a bug, not a quiet
  // day. Reported here rather than left for the collapse guard, because the
  // guard runs on PARSED counts and this failure happens two stages earlier.
  if (ids.length > 0 && out.length === 0) {
    throw new Error(`${ch.id}: playlist listed ${ids.length} ids but videos.list returned none`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE REJECT PRINTER (checklist 5e) — console only, and deliberately NOT a gate.
//
// Ported from Tōkon (tokon/scripts/fetch.ts:100-139) and 2XKO, not from CotW,
// which has none: CotW's only reject surfaces are the corpus-wide miss and
// residue tables, so a single channel silently flipping its orientation is
// invisible there. Its job is to make a grammar drift visible the DAY it lands
// rather than the week someone notices the counts sagging.
//
// It must never gate parsing. An approximate regex that rejects a real title is
// a silent data loss; the same regex printing a line a human reads is free.
// The precise version — misses that name a roster character, per channel,
// straight from the real parser — is in data/report.md (parse-finish.ts).
//
// THE EXPECTED SHAPE IS PER SLOT ORDER, NOT PER GAME. Four grammars run on this
// intake (types/index.ts SlotOrder), so one regex would flag one of them
// wholesale: a "paren on each side of vs" shape scores 0 of 2,994 on ggstHq,
// which has no brackets at all (recon/channels-live.md §2, channel 4).
//   · handle-outside / chars-outside: a bracket group on each side of `vs`.
//     Bracket groups are matched BY TYPE — round with one level of nesting for
//     ggstHighRank's "(Tsuku (PS5))", fullwidth for yumegiwa, square for
//     ggstBattleCollection — because that channel's handles put ROUND parens
//     inside the SQUARE ones ("[ (ノ-_-)ノ ]", 3 of 50 sampled) and a generic
//     "any bracket" class reads the inner paren as the slot and flags every
//     one of those titles as off-shape.
//   · handle-first-bare / chars-only: no brackets, so the shape is "a `vs` with
//     a roster span on each side", read through the alias matcher.
// ─────────────────────────────────────────────────────────────────────────────
const ROUND = String.raw`\((?:[^()]|\([^()]*\))*\)`;
const FULLWIDTH = String.raw`（[^（）]*）`;
const SQUARE = String.raw`\[[^\[\]]*\]`;
const GROUP = `(?:${ROUND}|${FULLWIDTH}|${SQUARE})`;
const VS = String.raw`(?:vs\.?|versus|×)(?![\p{L}\p{N}])`;
const BRACKETED_SHAPE = new RegExp(`${GROUP}\\s*${VS}[\\s\\S]*?${GROUP}`, 'iu');
const VS_SPLIT = /(?<![\p{L}\p{N}])(?:vs\.?|versus|×)(?![\p{L}\p{N}])/iu;

function matchesShape(ch: ChannelConfig, title: string, matcher: AliasMatcher): boolean {
  const t = title.normalize('NFC');
  if (ch.slotOrder === 'handle-outside' || ch.slotOrder === 'chars-outside') {
    return BRACKETED_SHAPE.test(t);
  }
  const halves = t.split(VS_SPLIT);
  return halves.length === 2 && halves.every((h) => matcher.ids(h).length > 0);
}

function recon(ch: ChannelConfig, records: RawVideoRecord[], matcher: AliasMatcher): void {
  const marked = records.filter((r) => hasStriveMarker(r.title));
  const shaped = marked.filter((r) => matchesShape(ch, r.title, matcher));
  // A title that names a fighter but does NOT match the shape is the signal
  // that matters: it is match-shaped content the parser may drop, or — worse —
  // read with the slots swapped.
  const suspicious = marked.filter(
    (r) => !matchesShape(ch, r.title, matcher) && matcher.ids(r.title).length > 0,
  );
  console.log(
    `    recon: ${shaped.length}/${marked.length} marked titles match the ${ch.slotOrder} shape`,
  );
  if (suspicious.length) {
    console.log(`           ⚠ ${suspicious.length} title(s) name a fighter but miss the shape:`);
    for (const r of suspicious.slice(0, 8))
      console.log(`             · [${r.id}] ${r.title.slice(0, 96)}`);
    if (suspicious.length > 8) console.log(`             … and ${suspicious.length - 8} more`);
  }
}

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const includeFrozen = process.argv.includes('--include-frozen');

  // FROZEN CHANNELS ARE SKIPPED — their committed records are carried forward
  // byte-stable by parse against a pinned count (types/index.ts `frozen`), so
  // fetching them would spend quota to produce a dump nothing reads.
  //
  // `--include-frozen` is the ONE exception and it exists for ONE job: seeding
  // the pin. ggstLowLevel ships with `frozen.records: -1`, a sentinel no carry
  // can ever equal, so parse throws on the first run until a human has
  // measured the real count. The ritual, in order:
  //   1. npm run data:fetch -- --only=ggstLowLevel --include-frozen
  //   2. npm run data:parse -- --seed-freeze-pins      (prints the count, writes nothing)
  //   3. set frozen.records in scripts/channels.ts to that count
  //   4. npm run data:parse                            (asserts the parse against the
  //                                                     pin and writes the records)
  // Every later run carries the committed records and re-asserts the pin.
  // There is no other legitimate use of this flag, and it must never appear in
  // the cron.
  const pool = includeFrozen ? CHANNELS.filter((c) => !c.index) : ACTIVE_CHANNELS;
  const targets = only ? pool.filter((c) => c.id === only) : pool;
  if (only && targets.length === 0) {
    console.error(
      `✖ --only=${only} matches no ${includeFrozen ? 'YouTube' : 'active'} channel` +
        (CHANNELS.some((c) => c.id === only && c.frozen)
          ? ` — ${only} is frozen; add --include-frozen if you are seeding its pin`
          : ''),
    );
    process.exit(1);
  }

  // The alias matcher is only used by the reject printer above. It reads
  // data/characters.json — a local file, no quota.
  const matcher = buildAliasMatcher(await loadCharacters());

  console.log(
    `▶ Fetching ${targets.length} channel(s)` +
      (includeFrozen ? ' (--include-frozen: seeding a freeze pin)' : '') +
      '…\n',
  );
  const rows: { ch: string; total: number; marked: number; newest: string }[] = [];
  for (const ch of targets) {
    const vids = await fetchChannel(ch);
    await writeFile(join(RAW_DIR, `${ch.id}.json`), JSON.stringify(vids));
    // The marker count is RECON ONLY — it gates nothing here. It is printed so
    // a channel that quietly rebrands to another game is visible at fetch time
    // rather than three stages later as a collapse. EXPECT IT TO READ BELOW THE
    // RECON'S per-channel figures: the sweep counted a hashtag-run "#ggst" as a
    // marker and hasStriveMarker does not (channels.ts).
    //
    // Title only, on every channel: no intake channel needs a description read
    // (types/index.ts striveSignal), so `striveSignal` is not consulted here.
    const marked = vids.filter((v) => hasStriveMarker(v.title)).length;
    const newest = vids.reduce((a, v) => (v.publishedAt > a ? v.publishedAt : a), '');
    rows.push({ ch: ch.id, total: vids.length, marked, newest: newest.slice(0, 10) });
    console.log(
      `  ${ch.id.padEnd(21)} ${String(vids.length).padStart(6)} uploads  ` +
        `${String(marked).padStart(5)} Strive-marked (${((marked / Math.max(1, vids.length)) * 100).toFixed(1)}%)  ` +
        `newest ${newest.slice(0, 10)}` +
        (ch.frozen ? '  [FROZEN — seeding]' : ''),
    );
    recon(ch, vids, matcher);
  }

  const frozen = CHANNELS.filter((c) => c.frozen && !targets.includes(c));
  const index = CHANNELS.filter((c) => c.index);
  console.log(
    `\n✓ raw/ written — ${rows.reduce((n, r) => n + r.total, 0)} uploads, ` +
      `${rows.reduce((n, r) => n + r.marked, 0)} Strive-marked across ${rows.length} channel(s)` +
      `${frozen.length ? `; ${frozen.length} frozen channel(s) skipped` : ''}` +
      `${index.length ? `; ${index.length} index source(s) pulled by \`npm run data:theater\`` : ''}`,
  );
}

main();
