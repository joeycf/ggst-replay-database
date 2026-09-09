# GGST pipeline report

- **24706** published records · **6542** players · **34** fighters
- **817** mirror match(es) (3.3%) — the stat unit is side appearances, so each adds 2 to one character (scripts/stats.ts)
- **230** pending review item(s) — absent from the site, never guessed
- **0** duplicate id(s) resolved by intake precedence
- **85** of 85 confirmed fighter-named players present in the registry; every other handle resolves to no fighter

## Per intake

A whole-video record on the YouTube channels is a SET (ggst-notes/hydration.md: every set
channel's median duration is 5–10 min against a ~3 min game); the catalogue's offset
segments are MATCHES. `too-short` is judged against the floor in brackets — ggstHq keeps
its Shorts (types/index.ts minDurationSec). There is no `gone` column: an uploads-playlist
walk cannot return a deleted video (0 of 18,509 on the hydration pass), so a vanished upload
is only ever visible as a smaller `raw` count — which is what the collapse guard reads.

| intake | source | raw | Strive-marked | parsed | published | too-short (floor) | live | rejects naming a fighter |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ggHighLevel | ggHighLevel | 5914 | 5856 | 5767 | 5767 | 3 (120s) | 0 | 86 |
| guiltyGearReplays | guiltyGearReplays | 3566 | 3397 | 3175 | 3175 | 33 (120s) | 0 | 188 |
| ggstBattleCollection | ggstBattleCollection | 3383 | 2562 | 2253 | 2253 | 119 (120s) | 0 | 73 |
| ggstHq | ggstHq | 3006 | 3000 | 2669 | 2669 | 1 (30s) | 1 | 210 |
| ggstHighRank | ggstHighRank | 1508 | 1504 | 1469 | 1469 | 0 (120s) | 0 | 35 |
| yumegiwa | yumegiwa | 3598 | 1377 | 970 | 970 | 28 (120s) | 0 | 13 |
| guiltyGearVods | guiltyGearVods | 145 | 145 | 139 | 139 | 0 (120s) | 0 | 5 |
| ggstLowLevel _(frozen)_ | ggstLowLevel | 723 | 715 | 19 | 19 | 126 (120s) | 0 | 566 |
| replayTheater _(index, full)_ | replayTheater | — | — | 8245 | 8245 | — | — | — |

### Index intake — Replay Theater

Fetched by the daily cron and ADD-ONLY: a committed record is carried whether or not the
catalogue still lists it, so this count can only rise. The cron does not depend on the
pull succeeding — on any failure there is no dump, the committed records are carried
against the pin, and the run stays green.

Rebuilt from a **full sweep** of 442 page(s): 20311 row(s) dumped, 11636 already known here (57.3%), 8245 built, 0 carried (add-only), **8245** total; pin 8245.

Of the carried, **0** no longer rebuild from the catalogue (the entry vanished,
or its VOD died — 1722 of the sweep's videos did not resolve, 11.4%) and **0** are now known from a tracked channel.
Sweep hygiene: 0 unusable link(s), 2 record-id collision(s), 0 wrong-game row(s).

Rows the build refused, counted never guessed: 430 placeholder handle(s) (`Unknown Player`, `GG Player`, …), 0 before the 2020-04-18 floor, 0 live, 0 whole-video row(s) under 120s, 0 excluded by hand, 0 duplicate record id(s) inside the dump.

## Misses, per intake

Four fifths of the recon miss rate was the gate working (recon/channels-live.md §5): lab
shorts, tournament index pages and character-only clips are correct rejections. The columns
that name a parser problem are `no-char`, `no-handle` and `slot-ambiguous`.

| intake | no-marker | before-floor | live | too-short | no-vs | vs-count | no-char | no-handle | slot-ambiguous | excluded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ggHighLevel | 58 | 0 | 0 | 3 | 3 | 0 | 14 | 69 | 0 | 0 |
| guiltyGearReplays | 169 | 0 | 0 | 33 | 1 | 0 | 58 | 130 | 0 | 0 |
| ggstBattleCollection | 821 | 0 | 0 | 119 | 129 | 0 | 0 | 61 | 0 | 0 |
| ggstHq | 6 | 0 | 1 | 1 | 129 | 0 | 101 | 97 | 2 | 0 |
| ggstHighRank | 4 | 0 | 0 | 0 | 0 | 1 | 0 | 34 | 0 | 0 |
| yumegiwa | 2221 | 0 | 0 | 28 | 339 | 0 | 37 | 3 | 0 | 0 |
| guiltyGearVods | 0 | 0 | 0 | 0 | 2 | 0 | 4 | 0 | 0 | 0 |
| ggstLowLevel | 8 | 0 | 0 | 126 | 4 | 0 | 14 | 552 | 0 | 0 |

## Slot order, per intake — both sides tallied

The parser resolves by roster membership and only RECORDS which slot held the fighter
(types/index.ts SlotOrder). `tie-broken` is the one branch where the declared order decided:
both spans resolved to a fighter. A channel whose resolved majority disagrees with its
declared order, or whose tie-broken rate climbs, is drifting. CotW collected this and never
printed it.

| intake | declared | handle-outside | chars-outside | handle-first-bare | chars-only | tie-broken | sides |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ggHighLevel | handle-outside | 11534 | 0 | 0 | 0 | 89 (0.8%) | 11534 |
| guiltyGearReplays | handle-outside | 6350 | 0 | 0 | 0 | 161 (2.5%) | 6350 |
| ggstBattleCollection | chars-outside | 0 | 4506 | 0 | 0 | 132 (2.9%) | 4506 |
| ggstHq | handle-first-bare | 146 | 5 | 5187 | 0 | 0 (0.0%) | 5338 |
| ggstHighRank | chars-outside | 0 | 2938 | 0 | 0 | 106 (3.6%) | 2938 |
| yumegiwa | handle-outside | 1940 | 0 | 0 | 0 | 25 (1.3%) | 1940 |
| guiltyGearVods | handle-outside | 278 | 0 | 0 | 0 | 7 (2.5%) | 278 |
| ggstLowLevel | chars-only | 24 | 14 | 0 | 0 | 0 (0.0%) | 38 |

_On a `handle-first-bare` channel a `chars-outside` share is the "Zato Brian" shape —_
_side 2 written character-first — and is expected; it is the channel's own inconsistency,_
_read rather than guessed._

## Duration histogram, per intake

The floor (120s default, per-channel where declared) is re-derived from this table, not from
a comment: `match-shaped misses` are too-short uploads whose TITLE parsed as a matchup — the
population a lower floor would admit. Measured 2026-09-08 (ggst-notes/hydration.md): clips
and lab shorts everywhere below 120s except ggstHq, whose Shorts are titled matchups.

| intake · population | 0 (live/unknown) | 1–29s | 30–59s | 60–119s | 120–179s | 180–299s | 300–599s | 600–1799s | 1800s+ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ggHighLevel · records | 0 | 0 | 0 | 0 | 1 | 249 | 3247 | 2268 | 2 |
| ggHighLevel · match-shaped misses | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ggHighLevel · other misses | 0 | 2 | 1 | 0 | 2 | 4 | 48 | 23 | 9 |
| guiltyGearReplays · records | 0 | 0 | 0 | 0 | 0 | 34 | 2633 | 508 | 0 |
| guiltyGearReplays · match-shaped misses | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| guiltyGearReplays · other misses | 0 | 13 | 14 | 6 | 0 | 25 | 148 | 16 | 0 |
| ggstBattleCollection · records | 0 | 0 | 0 | 0 | 0 | 70 | 975 | 1208 | 0 |
| ggstBattleCollection · match-shaped misses | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ggstBattleCollection · other misses | 0 | 99 | 20 | 0 | 2 | 4 | 33 | 37 | 114 |
| ggstHq · records | 0 | 0 | 82 | 258 | 14 | 215 | 1927 | 173 | 0 |
| ggstHq · match-shaped misses | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ggstHq · other misses | 1 | 0 | 9 | 123 | 3 | 9 | 106 | 53 | 26 |
| ggstHighRank · records | 0 | 0 | 0 | 0 | 35 | 590 | 807 | 37 | 0 |
| ggstHighRank · match-shaped misses | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ggstHighRank · other misses | 0 | 0 | 0 | 0 | 1 | 12 | 22 | 0 | 0 |
| yumegiwa · records | 0 | 0 | 0 | 0 | 0 | 24 | 600 | 345 | 1 |
| yumegiwa · match-shaped misses | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| yumegiwa · other misses | 0 | 20 | 8 | 0 | 0 | 0 | 24 | 25 | 330 |
| guiltyGearVods · records | 0 | 0 | 0 | 0 | 0 | 3 | 136 | 0 | 0 |
| guiltyGearVods · match-shaped misses | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| guiltyGearVods · other misses | 0 | 0 | 0 | 0 | 0 | 1 | 5 | 0 | 0 |
| ggstLowLevel · records | 0 | 0 | 0 | 0 | 10 | 5 | 4 | 0 | 0 |
| ggstLowLevel · match-shaped misses | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| ggstLowLevel · other misses | 0 | 45 | 1 | 76 | 357 | 127 | 75 | 10 | 1 |

## Handles

- word count per side: 1 → 30228 · 2 → 2230 · 3 → 397 · 4 → 61 · 5 → 6 — the cap is 5 words (parse.ts MAX_HANDLE_WORDS: measured 2026-09-09, the 4-word band is real and the 5-word band is where decoration leaks show first; CotW measured 4)
- 629 player(s) seen under more than one spelling; the display casing is the majority spelling, tie-broken toward mixed case, and the rest are kept as aliases
- placeholder handles refused: 145 on the channels, 430 in the catalogue

## Version tokens — counted, never a patch

ggstHq opens 2,864 of its 2,994 titles with a bare version ("5.2", "5.1"); ggstBattleCollection
glues one to the marker ("GGST2.0"). They are NOT parsed into Replay.patch: ArcSys publishes two
version spaces (game X.YY, Battle Version), "5.2" exists in neither as a patch-note title, and a
token that appears in no source may not be minted (scripts/seasons.ts). The HYPOTHESIS is that
they are Battle Versions; the columns test it against the date-derived patch, per record.

| intake | tokens | = battle version | = game version | = both | neither | no window |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ggHighLevel | 2.00×181, 2.01×7 | 0 | 178 | 0 | 10 | 0 |
| ggstBattleCollection | 2.0×281 | 0 | 69 | 0 | 205 | 0 |
| ggstHq | 5.2×258, 2.0×250, 2.1×111, 5.1×17, 4.1×4, 4.2×3 | 248 | 288 | 0 | 81 | 0 |

## Registry invariant — no player is a fighter

Every handle in players.json was resolved through the roster matcher at parse time. 85 resolve to a fighter and are on the confirmed list (scripts/roster.ts): `johnny-black`, `daru-i-no`, `sol-mugi`, `dara-i-no`, `lasagna-slayer`, `lasanga-slayer`, `futa-elphelt-67`, `leo`, `dizzy`, `f-elphelt`, `futa-elphelt`, `chris-chaos`, `sorede-i-no-ne-wwwwww`, `pot-noodle`, `zato-van`, `johnny`, `aba-bottom-1`, `jam-s-thighs`, `薄い-紗夢`, `par-daru-ino`, `axl-the-grappler`, `par-daru-i-no`, `sol-hc`, `venom-snake`, `sabamiso-bedman`, `leo-whatsapp`, `ユニカ`, `pot`, `oscar-d-leo`, `jam-session`, `unika-8-deluxe`, `sol-low-tier`, `a-b-a`, `sdytko`, `zato-2`, `pedrito-ky`, `goldlewis`, `lucy`, `bald-pot`, `millia-hater`, `lasangna-slayer`, `may`, `rip-potemkin`, `bbl-dizzy`, `baiken`, `ttv-pedrito-ky`, `baiken-hain`, `slayer`, `usui-slayer`, `asuka`, `光景-ヘットマン`, `shaking-chaos-eighth-region`, `nagoriyuki`, `usui-a-b-a`, `lucy-the-lamia`, `ky`, `the-jack-o-player`, `his-bridget`, `axl-low`, `bridget-hater`, `zato-bro`, `johnny-peperon`, `ibushigin-leo`, `gp-daru-i-no`, `mark-i-no`, `bridget-bussy`, `high-may`, `millia-hopium`, `myterious-i-no`, `i-no-s-tier`, `sandbag-ky`, `giovanna`, `life-jam`, `papa-leo`, `i-no`, `zoner-testament`, `johnny-volcano`, `millia-rage`, `may-gang`, `millia-thighs`, `leo-heart`, `sonic-sol`, `lotus-leo`, `こん-メイ`, `huawen-sol`.

## Rejects — titles that name a fighter but did not parse, per intake

Grammar variants are found by reading REJECTS, not successes (checklist 5e). Ten samples per
intake; the count is the whole population. Tōkon and 2XKO print this at fetch time from an
approximate shape; this is the precise version, straight from the parser.

**ggHighLevel** — 86

- `ksKyxwGT71g` no-handle: GGST ▰ N-O (#3 Ranked A.B.A) vs Kabaling (TOP Ranked Baiken). High Level Gameplay
- `0NXkKawTx-Y` no-handle: GGST ▰ N-O (#2 Ranked A.B.A) vs RNMTQ (TOP Ranked Johnny). High Level Gameplay
- `F-OqrmPSO4Y` no-handle: GGST ▰ Tatuma (#2 Ranked Sol) vs ImoG Player (TOP Ranked Happy Chaos). High Level Gameplay
- `zzFSBZ09Zx8` no-handle: GGST ▰ Zando (Day 3 Dizzy) vs Typhon (TOP Ranked Johnny). Guilty Gear Strive Gameplay
- `ZDNZtU0dkCA` no-handle: GGST ▰ Baaru (Day 3 Dizzy) vs HOS1NO (TOP Ranked Goldlewis). Guilty Gear Strive Gameplay
- `9jOXSB8IV2o` no-handle: GGST ▰ Jevil (Day 3 Dizzy) vs Phaxy (#1 Ranked Testament). Guilty Gear Strive Gameplay
- `iUq4jnBoNSU` no-handle: GGST ▰ Mixyous (Day 2 Dizzy) vs WiFi warrior (#3 Ranked Axl). Guilty Gear Strive Gameplay
- `9GhtaR_HVpA` no-handle: GGST ▰ Goldjin0 (Day 2 Dizzy) vs Chocoservant (TOP Ranked Asuka). Guilty Gear Strive Gameplay
- `xu1liDAfwFo` no-handle: GGST ▰ Papaya (Day 2 Dizzy) vs STEVEN (TOP Ranked Sol). Guilty Gear Strive Gameplay
- `xQtwVZoM7yE` no-handle: GGST ▰ Gobou (Day 2 Dizzy) vs Onet (#5 Ranked Ramlethal). Guilty Gear Strive Gameplay

**guiltyGearReplays** — 188

- `vvBMvIhR_YU` no-handle: GGST | Gobou (Robo Ky) VS GG Player (Bedman) | Guilty Gear Strive High level gameplay
- `WgZmznCs-GI` no-char: GGST | Beshh00 (Beshh00) VS tatuma (Sol Badguy) | Guilty Gear Strive High level gameplay
- `SKhOU4mipog` no-char: GGST | Beshh00 (Beshh00) VS STEVEN (Sol Badguy) | Guilty Gear Strive High level gameplay
- `Vz5yCscmEE0` no-handle: GGST | FAB (Potemkin) VS GG Player (Bedman) | Guilty Gear Strive High level gameplay
- `c0SQlIv5BPs` no-char: GGST | Daru_I-No (I-No) VS Urei (Urei) | Guilty Gear Strive High level gameplay
- `xDw-d9LZiAs` no-handle: GGST | GG Player (Bedman) VS Beshh00 (ABA) | Guilty Gear Strive High level gameplay
- `peVBJ2GKZPo` no-char: GGST | Beshh00 (Beshh00) VS TY (Sol Badguy) | Guilty Gear Strive High level gameplay
- `7XmhhvZlTzQ` no-char: GGST | Beshh00 (Beshh00) VS Daru_I-No (I-No) | Guilty Gear Strive High level gameplay
- `j2684_8WO30` no-char: GGST | Beshh00 (Beshh00) VS FAB (Potemkin) | Guilty Gear Strive High level gameplay
- `2Hyv52Pemt4` no-char: GGST | Beshh00 (Beshh00) VS Jiro (Anji Mito) | Guilty Gear Strive High level gameplay

**ggstBattleCollection** — 73

- `8m4fYBlA91k` no-handle: GGST2.0➤Rank 2nd JOHNNY / ジョニー [ Ore is LegenD. ] vs Rank 2nd BEDMAN? / ベッドマン [ GG player ]
- `KYllY52w-is` no-handle: GGST2.0➤Rank 2nd BEDMAN? / ベッドマン [ GGplayer ] vs Rank 1st LUCY / ルーシー [ SYO------/しょーーーーーーー ]
- `otnj3xX4Jr0` no-handle: GGST2.0➤Rank 2nd Giovanna / ジオヴァーナ [ kouhide ] vs Rank 2nd BEDMAN? / ベッドマン [ GG player ]
- `xr5SwVjc25o` no-handle: GGST2.0➤Rank 3rd FAUST / ファウスト [ ??? ] vs Rank 3rd JAM / 紗夢 [ GoodbyeKoa ] Guilty Gear Strive
- `y8MGOaGwxQU` no-handle: GGST2.0➤Rank 1st Giovanna / ジオヴァーナ [ TY ] vs Rank 1st BEDMAN? / ベッドマン [ GG Player]Guilty Gear Strive
- `M6DyyjItb-M` no-handle: GGST2.0➤Rank 2nd JAM / 紗夢 [ Scripter322 ] vs Rank TOP NAGORIYUKI / 名残雪 [ GG Player ] Guilty Gear
- `FGR8f3V3qk8` no-handle: GGST2.0➤Rank TOP BAIKEN / 梅喧 [ Matip ] vs Rank 4th JAM / 紗夢 [ GG Player ] Guilty Gear
- `NjBm7OaKyMc` no-handle: GGST➤Rank 5th SOL / ソル [ GG Player ] vs Rank 1st SLAYER / スレイヤー [ TY ] Guilty Gear
- `9-b7LM6v9FA` no-vs: GGST➤Rank 2nd TESTAMENT / テスタメント [ iDom ] vsRank 2nd NAGORIYUKI / 名残雪 [ Hotashi ] Guilty Gear Strive
- `lsmzrSHWqQo` no-handle: GGST➤Rank 6th ANJI / 闇慈 [ ▼▲▼▲▼▲▼▲▼▲▼▲▼▲▼ ] vs Rank 1st UNIKA / ユニカ [ Yachiyo ]  Guilty Gear Strive

**ggstHq** — 210

- `v8D1TF19ksg` no-char: GGST 5.1 Kazam Johnny VS Dany El Maza #ggst #ggsthq #guiltygearstrive #guiltygear #ggstjohnny
- `Ct3yWo7unQY` no-char: Guilty Gear Strive 5.2 DMon Pam VS Ain Robo Ky High Level Gameplay
- `pSsyyOKAiyQ` no-handle: GGST 5.2 Gobou Robo Ky VS GGplayer Bedman #ggst #ggsthq #guiltygearstrive #guiltygear #ggstroboky
- `Yf7kN9YVa_Q` no-handle: Guilty Gear Strive High Level Leo Faust VS Noedda Goldlewis (OLD)
- `63PI4tFPpOc` no-vs: GGST 5.2 Gobou Robo Ky ProtoChan Slayer #ggst #ggsthq #guiltygearstrive #guiltygear #ggstroboky
- `PaEFxgfEOiY` no-vs: GGST 5.2 Dogura Robo Ky BlackCoffin Sin #ggst #ggsthq #guiltygearstrive #guiltygear #ggstroboky
- `aDIFX0HVHCw` no-handle: Guilty Gear Strive 5.2 Gobou Robo Ky VS GGplayer Bedman High Level Gameplay
- `Q7eCo80816o` no-vs: Guilty Gear Strive 5.2 Kazunoko Robo Ky Taichi Sin High Level Gameplay
- `m9oKSK3bego` no-vs: GGST 5.2 Dogura Tries Robo Ky #ggst #ggsthq #guiltygearstrive #guiltygear #gaming #games #ggstroboky
- `cl8ko8CBL8g` no-vs: GGST 5.2 Gobou Tries Robo Ky #ggst #ggsthq #guiltygearstrive #guiltygear #gaming #games #ggstroboky

**ggstHighRank** — 35

- `bC7CklZC0u4` no-handle: GGST 🔥 #2 JACK-O (dai dai dai dai taizai nin) vs #5 BEDMAN (jairo.maiku) | High Level Gameplay
- `Zmrg11N7R_Q` no-handle: GGST 🔥 #1 BEDMAN (GG player) vs #2 GIOVANNA (kouhide) | High Level Gameplay
- `yMi0w2wIpPY` no-handle: GGST 🔥 #2 JOHNNY (Learning To Lose) vs #2 NAGORIYUKI (GG Player) | High Level Gameplay
- `hPiAV2aVyns` no-handle: GGST 🔥 #1 I-NO (PAR | Daru_I-No) vs #4 JACK-O (dai dai dai dai taizai nin) | High Level Gameplay
- `cK5A1AUC_aQ` no-handle: GGST 🔥 #3 NAGORIYUKI (GG Player) vs #4 ANJI (Andross) | High Level Gameplay
- `PJAPhs4-NL4` no-handle: GGST 🔥 #3 NAGORIYUKI (GG Player) vs #7 LUCY (PataChu) | High Level Gameplay
- `MwuujOXLhhQ` no-handle: GGST 🔥 #1 CHIPP (SOY EL ESCARFED) vs #2 NAGORIYUKI (GG Player) | High Level Gameplay
- `oWDXjuUFYaE` no-handle: GGST 🔥 #2 NAGORIYUKI (GG Player) vs #4 ANJI (Andross) | High Level Gameplay
- `dD36HkEPxCI` no-handle: GGST High Level Gameplay | #3 RANKED NAGORIYUKI (ERAM) vs #4 RANKED ZATO (( no -_-) no)
- `7T0TFX6Ujio` no-handle: GGST High Level Gameplay | HIGH LEVEL LUCY (PataChu) vs #4 RANKED ZATO (( no -_-) no)

**yumegiwa** — 13

- `nBcyv4eItqY` no-char: 【H2O（ジョニーJohnny）VS 薄いソル（Sol ソル）】#ggst  No.473 日曜から夜更し 🔥Ver2.1🔥Season5🔥
- `rO4gWv7qSns` no-vs: 【愛乃はぁと様（Ramlethal ラムレザル）VSチンパンジーのあーちゃん（Bedman？Elphelt ベッドマン？ エルフェルト）】#GGST No.398日曜から夜更かしLosersFinal
- `P2QYhy4QwR0` no-handle: 【薄ィー（Johnny ジョニー）VS BB Player（A.B.A アバ）】#GGST No.393日曜から夜更かし Losers Pool🔥Season4
- `6ZBQ7svIWWI` no-vs: 【 アトラ（Ino イノ）VSぷろとちゃん（Anji アンジ）】#GGST No.386日曜から夜更かし Winners Top4🔥Season4
- `fohn_xFZohw` no-handle: 【 アトラ（Ino イノ）VS BB Player（A.B.A アバ）】#GGST No.386日曜から夜更かし Winners Top8🔥Season4
- `gZPaxUXezk0` no-vs: #GGST コメコメ（Asuka 飛鳥）Season3 Winning Matches🔥High Level Gameplay
- `cZzEnQrJhEw` no-vs: #GGST PAR｜Daru_I-No（Ino イノ）Season3 Winning Matches🔥High Level Gameplay
- `anS_kxvclOE` no-char: 【ぷろとちゃん@youtube（Anji アンジ）VS GGSTメンヘラじじい】No.341 日曜から夜更かし Losers Pool
- `0UkzEnpspFU` no-char: 【Jonathan（Zatoザトー）VS JIG｜ナゲ（Faust ファウスト）】No.1 GGST Battle Party Winners Top4
- `wmAXyuJ25Pw` no-char: 【侵略イruカ娘（Mayメイ）VS ろず（KY）】No.1 GGST Battle Party Winners Pool

**guiltyGearVods** — 5

- `01YMW3oFMEU` no-char: GGST ✪ DARU_I_NO (#1 Ranked I-NO) VS FAB (#5 Ranked Potemkim) | GGST High Level Match Replay
- `xM4jHRxrQHs` no-char: GGST ✪ SnowFight Bard (#3 Ranked Dizzy) VS FAB (#4 Ranked Potemkim) | GGST High Level Match Replay
- `JDmsHP7Oj8Q` no-char: GGST ✪ LEE JEONG (#3 Ranked Slayer) VS FAB (#4 Ranked Potemkim) | GGST High Level Match Replay
- `8FrJu3LR5LI` no-char: GGST ✪ FUBUKI (#1 Ranked Testament) VS JIKISHIRONE (#5 Ranked Ramlet) | GGST High Level Match Replay
- `VI8BzvUHRtE` no-vs: GGST ✪ TOP 1 ANJI IS UNSTOPPABLE 🔥 | GGST Strive High Level Match Replay

**ggstLowLevel** — 566

- `FEBEbF9dCqU` no-handle: GGST Floor 1 ▶ Ky vs Nago ▶ Guilty Gear STRIVE Low Level Gameplay
- `ZJCJzlA3u9c` no-handle: GGST Iron 1 ▶ Jam Kuradoberi vs Potemkin ▶ Guilty Gear STRIVE Low Level Gameplay
- `eN0M6zYPoQs` no-handle: GGST Floor 2 ▶ Jam Kuradoberi vs Giovanna ▶ Guilty Gear STRIVE Low Level Gameplay
- `1EH4mDVYcRk` no-handle: GGST Floor 2 ▶ Jam Kuradoberi vs Giovanna ▶ Guilty Gear STRIVE Low Level Gameplay
- `r57bvDtBONc` no-handle: GGST Floor 1 ▶ Lucy vs I-No . Guilty Gear STRIVE Low Level Gameplay
- `OU-XSmS-LUY` no-handle: GGST Iron 1 ▶ Lucy vs Lucy . Guilty Gear STRIVE Low Level Gameplay #ggst #guiltygearstrive
- `OhLnjoDhiCw` no-handle: GGST Floor 1 ▶ Lucy vs I-No . Guilty Gear STRIVE Low Level Gameplay
- `gG94i3_Wc3Y` no-handle: GGST Iron 1 ▶ Lucy vs Lucy . Guilty Gear STRIVE Low Level Gameplay
- `g5Vl78g-JdI` no-handle: GGST Floor 1 ▶ Unika vs Giovanna . Guilty Gear STRIVE Low Level Gameplay
- `me_lU1iZ0-o` no-handle: GGST Floor 8 ▶ Venom vs Nagoriyuki . Guilty Gear STRIVE Mid Level Gameplay

## Residue — text no roster span covered

A new nickname, a DLC fighter or an uploader typo surfaces here as a counted
line with its literal text, instead of vanishing into a silently shorter side.

RANK_PREFIX leak (parse.ts): **0** residue line(s) over 0 miss(es) still carry a rank-shaped token ("#1 Ranked", "Rank 1st", "Rank TOP", "HIGH RANK", a bare "#2"). Zero means every measured spelling was stripped on the rows the parser rejected; a non-zero line names the spelling to add.

- 71× `No 日曜から夜更かし`
- 53× `on line 日曜から夜更かし No`
- 48× `バトコレ シンキスクです`
- 44× `日曜から夜更かし No`
- 30× `バトコレ`
- 21× `バトコレの`
- 18× `F F`
- 17× `JPN on line 日曜から夜更かし No`
- 12× `Giovana`
- 10× `JPN on line No 日曜から夜更かし`
- 10× `OnlineTournament No 日曜から夜更かし`
- 7× `Azuka`
- 7× `バトコレ スレイヤーとシンキスクです`
- 6× `on line ON 日曜から夜更かし No Cグループ`
- 6× `on line ON 日曜から夜更かし No Dグループ`
- 5× `Gobou Tries`
- 5× `Season on line 日曜から夜更かし No`
- 5× `テスト`
- 4× `Gobou No`
- 4× `on line ON 日曜から夜更かし No グループ`
- 4× `TOP No 日曜から夜更かし`
- 3× `ALL Taunts Respects in English in Japanese`
- 3× `Arc World Tour Restream LET S WATCH`
- 3× `BB FAB`
- 3× `Character Reveal Trailer`
- 3× `GG FAB`
- 3× `Gobou GG`
- 3× `HappyGRJ`
- 3× `hoochoo mocchi part`
- 3× `Jhonny`
- 3× `Kise`
- 3× `No 日曜から夜更かし Bグループ`
- 3× `No 日曜から夜更かし グループ`
- 3× `Noedda`
- 3× `on line ON 日曜から夜更かし No Bグループ`
- 3× `ROAD TO SUB SUB TO CHANNEL`
- 3× `TY GG`
- 3× `Tyurara Tries`
- 3× `UMISHO GG`
- 2× `Ain GG`
- … 646 more

## Replay Theater cross-check

A second reading of **11467** of our own records, from the catalogue's
UNTAGGED entries — online replays it indexes that we also parse from a tracked
channel. It changes nothing: a disagreement is recorded in
data/theater-disagreements.json with both claims, never written into a record.
The catalogue does not outrank a confident parse and never outranks a human
override.

_On this game the witness is NEAR-DEPENDENT: measured 2026-09-07, the catalogue's_
_upload_date equals the VOD's publish date on 97.27% of overlapping rows, so the_
_submitter most likely read the same title our parser did. Agreement is a_
_consistency check on two readers of one title; disagreement is a title at least_
_one of them misread._

_Measured on the last full sweep, at catalogue entry 495703. 3600 catalogue video(s) are ones_
_we do not hold from a tracked channel; 6 are VODs the catalogue segments, which the intake owns._

| field | population | agree | partial | disagree | cannot witness |
| --- | ---: | ---: | ---: | ---: | ---: |
| players (both handles) | 11466 | 11356 (99.04%) | 107 | 3 | 1 |
| characters (per side) | 22934 | 22909 (99.89%) | 6 | 19 (0.08%) | 0 |

Side order differed on **1** record(s); the comparison realigns on the
handles before reading characters, so a swapped pair is not counted twice as a
character disagreement. Handles are compared sponsor-stripped on both sides.

**1** record(s) carry a placeholder handle on the catalogue's side
(`Unknown Player`, `GG Player`, …) — a witness that declined to name the player, held
out of the players row rather than scored as a miss. Their characters are still compared.

Of the 113 side(s) whose handles did not match, **9** are ours carrying extra text
the catalogue does not, **11** are theirs carrying a team tag THEATER_SPONSOR does not
strip yet, and **93** are genuinely different names — the only bucket worth reading one
row at a time. Reported, never scored: substring matching on handles is the kind of
guessing this module refuses.

**22 disagreement(s)** — both claims, ours first:

- `UzGiYOr8vKk` side 0 characters: **millia-rage** vs catalogue **leo-whitefang** — GGST | Heko-Chan (Millia) VS Leo (Faust) | Guilty Gear Strive High lev
- `NMSksktmplE` players: **御覧, butigire-beyblade** vs catalogue **goran, kal** — 【御覧(Testament テスタメント)VS BUTIGIRE BEYBLADE(Nagoriyuki 名残雪)】#GGST No.376
- `PUzomT08YG8` side 0 characters: **asuka-r** vs catalogue **may** — GGST | Gobou (Asuka) VS Hemhemee (May) | Guilty Gear Strive High level
- `lSyBfeZBbh0` side 0 characters: **johnny** vs catalogue **i-no** — GGST➤ Rank 4th IJOHNNY/ ジョニー [ Dr_Spiderman97 ] vs Rank 2nd BEDMAN? / 
- `lSyBfeZBbh0` side 1 characters: **bedman** vs catalogue **sin-kiske** — GGST➤ Rank 4th IJOHNNY/ ジョニー [ Dr_Spiderman97 ] vs Rank 2nd BEDMAN? / 
- `ZuU0u_JylSc` side 0 characters: **sol-badguy** vs catalogue **ky-kiske** — GGST➤ Rank 1st SOL / ソル [ UMISHO ] vs Rank 7th SLAYER / スレイヤー [ $1.50 
- `ELWpsSY-0nQ` side 0 characters: **happy-chaos** vs catalogue **queen-dizzy** — GGST | Hazen (Happy Chaos) VS KingAfrica4 (Dizzy) | Guilty Gear Strive
- `XKAMEdee2ko` side 1 characters: **ramlethal-valentine** vs catalogue **johnny** — GGST➤Rank TOP JOHNNY / ジョニー [ NBNHMR ] vs Rank 3rd RAMLETHAL / ラムレザル [
- `0mFhJNy1QKk` side 1 characters: **goldlewis-dickinson** vs catalogue **asuka-r** — GGST➤Rank 7th SLAYER / スレイヤー [ Orphen ] vs Rank 1st Goldlewis / ゴールドルイ
- `mZYs2n2Zxts` players: **ナケ, フシン** vs catalogue **nage, bushin** — 【JIG|ナゲ(Faust ファウスト)VS ブシン(Slayer Leo スレイヤー レオ)】#ggst No.442 日曜から夜更し �
- `eMCZp4mVSro` side 0 characters: **nagoriyuki** vs catalogue **goldlewis-dickinson** — GGST | Gobou (Nagoriyuki) VS Garmiria (Millia) | Guilty Gear Strive Hi
- `XT9YPacG0Pw` side 0 characters: **unika** vs catalogue **asuka-r** — GGST➤Rank 7th UNIKA / ユニカ [ Zato-Van ] vs Rank TOP Elphelt / エルフェルト [ 
- `RvaMM_V6Uts` players: **red-ditto, sloth** vs catalogue **redditto, sl0th** — GGST High Level Gameplay | #1 RANKED RAMLETHAL (Red Ditto) vs HIGH RAN
- `BEQ6hvSn42c` side 0 characters: **jam-kuradoberi** vs catalogue **bedman** — GGST2.0➤Rank 2nd JAM / ジャム [ 13 Year Hustle ] vs Rank 1st JAM / 紗夢 [ S
- `hUqQDD0CLqA` side 0 characters: **robo-ky** vs catalogue **ky-kiske** — GGST ▰ Black Cat (Day 1 Robo-Ky) vs Namorisu (Dizzy). High Level Gamep
- `1Ssvp08QHnI` side 0 characters: **robo-ky** vs catalogue **ky-kiske** — GGST ▰ Seisei (Day 1 Robo-Ky) vs Apollo (#5 Ranked Sol). High Level Ga
- `4PNqzwKZt5g` side 0 characters: **robo-ky** vs catalogue **ky-kiske** — GGST ▰ Gobou (Day 1 Robo-Ky) vs Goldjin0 (Day 1 Robo-Ky). High Level G
- `4PNqzwKZt5g` side 1 characters: **robo-ky** vs catalogue **ky-kiske** — GGST ▰ Gobou (Day 1 Robo-Ky) vs Goldjin0 (Day 1 Robo-Ky). High Level G
- `1PsurFV_sME` side 0 characters: **robo-ky** vs catalogue **ky-kiske** — GGST ▰ Tyurara (Day 1 Robo-Ky) vs Seongmin (Day 1 Robo-Ky). High Level
- `1PsurFV_sME` side 1 characters: **robo-ky** vs catalogue **ky-kiske** — GGST ▰ Tyurara (Day 1 Robo-Ky) vs Seongmin (Day 1 Robo-Ky). High Level
- `_QWVcBVzYzw` side 0 characters: **robo-ky** vs catalogue **ky-kiske** — GGST2.0➤DAY 1 Robo-Ky / ロボカイ [ seisei ] vs Rank TOP LEO / レオ [ Jonaru 
- `KVp07tIERwY` side 1 characters: **robo-ky** vs catalogue **ky-kiske** — GGST2.0➤Rank TOP Giovanna / ジオヴァーナ [ Octova ] vs DAY 1 ROBO-KY / ロボカイ 

> ggstLowLevel: frozen since 2026-07-16; 19 record(s) parsed from a frozen dump (the seeding path) and asserted against the pin.

_Generated 2026-09-09T13:18:23.043Z_
