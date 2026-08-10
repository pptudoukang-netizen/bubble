# 1000 Level Campaign Design

## Goal

The 1000-level campaign extends the current 40-level bubble shooter progression into a long-form staged campaign. The design keeps the existing fail-fast configuration model: every level must be explicit, valid, and loadable without runtime defaults.

## Progression Structure

Levels 1-300 use `E:\kxppm\decrypted_config\all_levels.json` only as an occupancy-silhouette reference. The source has normal campaign levels 1-200: levels 1-200 project the same-numbered source mask, while levels 201-300 project mirrored variants of source levels 101-200. The source 11/10-column `bubbles` geometry is converted into the current 11/10-column board while current project row counts and occupied-ball budgets are preserved. Every gameplay field remains project-authored: colors, collection objectives, special entities, shots, opening sequences, star thresholds, rewards and play mode are not imported from KXPPM. Levels 1-100 and 101-300 use separate project-owned per-level shot calibration tables measured with the current runtime logic. Levels 301-1000 continue to use the symbolic relaxed-campaign silhouettes. Levels 1-10 are bundled locally and levels 11-1000 remain grouped into remote 100-level packs for WeChat cloud storage.

The new campaign uses these chapters:

- Levels 1-100: current project progression and mechanics, with KXPPM occupancy silhouettes projected to the current 11/10-column board.
- Levels 101-140: molotov and splitter combo routes.
- Levels 141-180: splitter and locked ball combo routes.
- Levels 181-200: first full reactive mechanics exam.
- Levels 201-300: blast-chain gameplay on mirrored KXPPM 101-200 occupancy references.
- Levels 301-1000: four 100-level cycle themes: growth and keys, symbolic patterns, full system mastery, blast chain routes.

Levels 1-100 keep the current `collect_color` primary objective and add the current `collect_ice_snowball` secondary objective when required by configured ice count. Every 10th level is a project-authored 90-second `timed_infinite_shots` special-island level; the other levels remain `shot_limited`. They use current special-entity progression, reward rules, legal opening-shot policy, and explicit star thresholds. KXPPM shot counts, timed modes, colors, special codes, precedence balls, scores and rewards are deliberately ignored.

The new reactive entities use a staged deterministic cadence across the full campaign. Swirls first appear at level 21, vine spirits at level 31, and wormholes at level 53. From level 81 onward, each ten-level cycle contains single-mechanic practice, two-mechanic combinations, full swirl/vine/wormhole coexistence, and a phase-ten exam. Phase-nine and phase-ten levels scale from one of each mechanic to a maximum of 3 swirls, 3 vine spirits, and 3 wormhole pairs. The generated campaign contains 484 swirl levels (928 swirls), 483 vine-spirit levels (887 spirits), 460 wormhole levels (760 pairs), and 180 levels containing all three mechanics.

The generator reserves every swirl's complete six-cell normal-ball track and each wormhole pair's complete endpoint-to-endpoint segment before assigning ice or other special entities. Swirl tracks cannot overlap. Every wormhole pair owns a different row, and each wormhole row contains exactly two endpoints with one shared deterministic move direction. Missing valid geometry fails generation instead of reducing the configured mechanic count.

`tools/campaign-level-generation-config.js` is the single campaign-generation policy for timed levels, swirls, vine spirits, wormholes, ice ratios, score targets, star thresholds, board occlusion, trapped-sprite rescue, and normal-ball occupancy targets. Each 100-level chapter assigns rescue to offsets `25, 42, 63, 86, 99`, producing exactly 50 rescue levels. The five chapter beats progress from rescue-only geometry through swirl, vine-spirit, combined, and scaled exam layouts. Rescue levels are always `shot_limited`; they may contain rainbow, blast, stone, ice, swirl, and vine-spirit entities, while timed mode, wormholes, and board occlusion remain forbidden. Rescue identity cycles strictly through `milu`, `lumi`, `noya`, `flora`, `loco`, `kelu`, and `yumi`; the same `spiritId` drives the floating-map landmark and in-board trapped art. Shot limits are recalculated from actual board and compatible-special counts. A schedule collision or incompatible combination fails generation immediately.

## New Entity Rules

### Swirl Bubble

Config:

```json
{
    "id": "swirl_001",
    "entityCategory": "reactive_ball",
    "entityType": "swirl",
    "row": 4,
    "col": 4
}
```

Rule:

- After every fired bubble finishes attaching, each live swirl rotates its six neighboring hex slots clockwise by exactly 60 degrees.
- Every occupied bubble moves along one straight edge of the six-cell hexagonal track. Empty slots rotate with the ring, so the operation preserves the exact bubble count and color multiset.
- The swirl center stays in place and does not participate in normal color matching.
- A swirl requires all six neighboring coordinates to exist. Its track cannot contain another special entity, and tracks from different swirls cannot overlap.
- Input remains locked during the 0.4-second rotation. When it ends, support is recalculated immediately; every bubble no longer connected to the top enters the normal falling-marble pipeline.
- Runtime and level validation fail immediately if an occupied swirl-track cell is not a normal colored bubble or if the six-cell geometry is invalid.

### Wormhole Bubble

Config:

```json
[
  {
    "id": "wormhole_left",
    "entityCategory": "reactive_ball",
    "entityType": "wormhole",
    "moveDirection": "right",
    "row": 5,
    "col": 0
  },
  {
    "id": "wormhole_right",
    "entityCategory": "reactive_ball",
    "entityType": "wormhole",
    "moveDirection": "right",
    "row": 5,
    "col": 8
  }
]
```

Rule:

- A level can contain multiple wormhole pairs. Pairing is deterministic by row: every wormhole row must contain exactly two endpoints, use one shared `moveDirection` (`left` or `right`), and contain at least one interior slot. Different pairs must occupy different rows.
- After each fired bubble finishes its normal shot resolution, every pair shifts simultaneously. Every interior slot between that pair's fixed endpoints moves exactly one slot in `moveDirection`, wrapping at the opposite end. Normal balls, special balls, vine ownership state and empty slots all move together.
- Wormholes never move with their own cycle, never participate in color matching, cannot be eliminated or dropped, and act as permanent support anchors.
- The wormhole node and outer ring stay fixed. `effects/WormholeFlow` rotates only the inner UV field with stronger distortion toward the center, adds a fast blue-purple highlight sweeping around a circular band, softly breathes the star and rim brightness, and pulses the dark center. The shader remains active during the interior-slot shift animation; the complete texture never rotates mechanically.
- The 0.35-second shift locks input. Support is recalculated when the animation finishes, and every newly unsupported non-wormhole cell immediately enters the normal falling-marble pipeline.
- The shift never invokes color matching. Even if the new arrangement forms a valid same-color group, it remains until a later player shot resolves that match.
- A board containing only permanent wormhole endpoints counts as cleared. The top-anchor collapse rule remains active on wormhole levels: once the top-row empty-slot threshold is reached, every non-wormhole cell drops while all fixed endpoints remain on the board. The top mainland and gradient alignment ignore wormhole endpoints, so they stay at the board boundary instead of pressing down to the surviving wormhole rows.
- Rendering and introduction UI use `image/ball/wormhole`; board rendering applies `effects/WormholeFlow`, and the texture is excluded from dynamic-atlas packing so its distortion UV domain remains stable. Remote compact packs encode wormholes with type code `h` plus the explicit move direction.

### Vine Spirit

Config:

```json
{
    "id": "vine_spirit_001",
    "entityCategory": "reactive_ball",
    "entityType": "vine_spirit",
    "row": 4,
    "col": 8
}
```

Rule:

- A vine spirit occupies one board cell and always starts with exactly 3 health.
- A direct projectile collision, or a completed elimination in any adjacent hex cell, deals exactly 1 damage. One shot resolution cannot damage the same spirit more than once.
- A blast or molotov explosion that directly covers a vine spirit deals 1 damage. Covering an entangled ball does not release its vine by itself; the vine is released only when another ball in one of its six neighboring hex cells is actually eliminated during the resolution. The same resolution still cannot damage one spirit more than once.
- Every third fired bubble, each surviving spirit selects the nearest unentangled normal colored bubble. Ties are resolved by row, column and cell id so the result is deterministic.
- The selected target first shows the semi-transparent `image/ball/vines` warning for 0.65 seconds. Input and other post-shot special phases remain locked until the warning completes, then the vine becomes active.
- An entangled ball cannot participate in color matching, but it follows the normal support graph. If it becomes unsupported, its vine is removed before the underlying colored ball enters the normal floating-drop pipeline.
- Only an actual elimination in one of the six adjacent hex cells removes the vine without removing the underlying colored ball. A direct projectile collision that produces no elimination leaves the vine active.
- A vine spirit also follows the normal support graph and falls when unsupported. When it reaches 0 health or leaves the board through an unsupported drop, every active or preview vine owned by that spirit withers immediately.
- Runtime state stores the owning spirit id on each entangled cell. Missing owners, invalid health, mismatched preview ownership and unsupported render resources fail immediately.
- The spirit uses `image/ball/vine_spirit`; active and preview vines use `image/ball/vines`.

### Molotov

Config:

```json
{
    "entityCategory": "reactive_ball",
    "entityType": "molotov",
    "blastRadius": 2
}
```

Rule:

- A molotov triggers when an adjacent ball is removed.
- Molotovs support chain reactions.
- Each molotov can trigger at most once per resolution.
- The explosion removes cells within two hex rings.
- Locked balls are not removed while still locked.

### Splitter

Config:

```json
{
    "entityCategory": "reactive_ball",
    "entityType": "splitter",
    "splitColor": "B"
}
```

Rule:

- A splitter does not participate in matching.
- A splitter triggers when an adjacent ball is removed.
- It spawns one normal ball of `splitColor`.
- Spawn priority is adjacent empty slot, then nearest upward empty slot; if neither exists, no ball is spawned.
- Spawned balls play an upward parabolic fly-in from the splitter position to the target slot.
- Each splitter can trigger at most once per resolution.
- A splitter must not be placed in the top board row (`row: 0`).

### Locked Ball

Config:

```json
{
    "entityCategory": "locked_ball",
    "entityType": "locked",
    "lockedColor": "R",
    "lockGroup": "g1"
}
```

Rule:

- A locked ball does not participate in matching while locked.
- A locked ball is a support anchor while locked.
- Locked balls are not removed by molotov explosions while locked.
- Once unlocked, the entity becomes a normal ball of `lockedColor`.
- Unlocked balls immediately participate in the next support calculation.

### Key

Config:

```json
{
    "entityCategory": "key_ball",
    "entityType": "key",
    "unlockGroup": "g1"
}
```

Rule:

- A key is collected when an adjacent ball is removed or when the key itself is removed by a blast chain.
- A collected key unlocks exactly one locked ball with the same group.
- The number of keys in a group must equal the number of locked balls in that group.
- Key collection is resolved before support/floating calculation.

## Board Pattern Strategy

Levels 1-300 do not use the former symbolic shape functions to select occupied cells. Each KXPPM source mask becomes a normalized occupied/empty distance field; the generator selects the closest connected cells while preserving the current project row count and normal-ball occupancy target. Normal levels use a full top row and remain connected to the ceiling. The ten rescue levels in 101-300 replace their reference projection with a center-supported rescue layout and an empty top row. Row widths are fixed at 11/10. Levels 101-300 therefore contain 190 reference projections plus 10 rescue layouts; absolute horizontal centroid offset and left/right occupancy delta remain at or below 0.20, with current maxima of 0.074 and 0.111.

For the reference mask, `x` means empty and every validated non-`x` source code means occupied. The code itself is not converted into a current color or special entity. Current `R/G/B/Y/P` counts, stones, ice, skill balls, reactive balls, keys and locks are generated afterward from `LEVEL_CONFIG_TABLE_1_1000.csv` and the current project rules.

Generated levels 301-1000 use symbolic board silhouettes to increase variety:

- `arrow`: directional route reading.
- `heart`: soft collection clusters.
- `diamond`: centered collapse puzzles.
- `spiral`: edge-first routing.
- `gate`: locked/key readability.
- `flame`: molotov-themed boards.
- `flower`: splitter spread boards.
- `keyhole`: key and lock chapters.
- `crown`: milestone and exam levels.
- `wave`: alternating path pressure.

For levels 1-100, board height remains project-authored at 8-15 rows. Levels 101-300 retain the current relaxed-campaign 15-row height. In both ranges only the normalized silhouette comes from the source; scheduled rescue levels instead use the central-anchor rescue geometry. Levels 301-1000 retain the symbolic relaxed-campaign shape and height rules. Normal-ball occupancy targets rise from 70% in levels 1-300 to 72% in 301-500, 74% in 501-700, and 76% in 701-1000.

Ice is part of the full campaign difficulty curve instead of being sporadic chapter decoration. It starts at level 16 and uses board-capacity ratios of 5% (16-30), 7% (31-60), 9% (61-100), 10% (101-300), 12% (301-500), 14% (501-700), 16% (701-850), and 18% (851-1000). Rescue levels participate in the same ice curve because ice is a supported rescue obstacle. This produces ice objectives on all 985 post-introduction levels while avoiding the previous late-game 20-24% spike.

First-100 shot limits are explicitly calibrated per level against the projected layouts and current gameplay runtime. The calibration reduces excessive surplus shots on high-cascade layouts, preserves the established limits on observed pressure levels, and keeps a dedicated safety allowance for level 96's key/lock route. The table must contain exactly 100 positive integers; missing or invalid entries fail generation immediately. The independent two-attempt simulation seed `20260729` clears 100/100 levels with an average of 7.43 remaining shots and a median of 7.

Levels 101-300 use a separate 200-entry calibrated shot table. The final independent two-attempt simulation seed `20260729` clears 200/200 levels with an average of 8.79 remaining shots and a median of 8; the 25th/75th percentiles are 5/12. Pressure levels retain explicit safety limits instead of receiving a blanket reduction. Missing, extra or non-positive table entries fail generation immediately.

Current special entities are placed inside the projected occupied silhouette before clustered project colors are assigned. Their types and counts come only from current project progression. Levels 101-300 preserve the deterministic current-project middle-board placement order while restricting positions to the projected reference silhouette. Levels 301-1000 retain the symbolic relaxed-campaign placement rules.

## Generation Rules

The base generator is `tools/generate-1000-level-configs.js`.

Every formally generated level must satisfy both shared board rules:

1. The top row may not contain more than three horizontally consecutive normal balls of the same color. Empty cells and special-entity cells break the run; rescue levels use an empty top row.
2. `normalBallCount / (boardCapacity - specialEntitySlots - trappedSpriteAnchorSlots)` must be at least 70%. Ordinary silhouette holes remain in `boardCapacity`; only gameplay-reserved special slots are excluded. The configured progression targets are 70% / 72% / 74% / 76% for levels 1-300 / 301-500 / 501-700 / 701-1000.

The generator asserts these rules before writing output. `LevelConfigLoader` enforces them again for formal `level_###` configurations, and `validate-level-content` checks all local and compact remote outputs. Invalid layouts throw an error; neither rule has a runtime fallback.

For the relaxed 1000-level campaign rebuild, run `npm run redesign:relaxed-campaign`. This command rewrites `LEVEL_CONFIG_TABLE_1_1000.csv`, regenerates local levels 1-10, regenerates every remote compact pack from 11-1000, updates `remote-level-packs/level_manifest.json`, updates `assets/map/config/level_manifest.json`, and syncs the root `levels/` mirror.

For the staged first-100 rebuild, first ensure `E:\kxppm\decrypted_config\all_levels.json` exists, then run `npm run generate:levels-first100`. This command rewrites only the first 100 CSV rows, local levels 1-10, `levels_pack_011_100.json`, and that pack's manifest hash/size entry. It verifies source row widths/codes, current gameplay fields, 11/10 target widths, ceiling support, exact current color/special counts and 100 unique occupancy silhouettes. It intentionally leaves levels 101-1000 and their remote packs unchanged. There is deliberately no fallback when the reference file is missing or invalid.

For levels 101-300, run `npm run generate:levels101-300`. This command rewrites only their CSV shot-limit cells, `levels_pack_101_200.json`, `levels_pack_201_300.json`, and the corresponding remote-manifest entries. It validates source codes and row widths, 190 reference projections plus ten scheduled rescue layouts, current gameplay fields, 11/10 target widths, required support model, and exact color/special counts. It intentionally leaves levels 1-100 and 301-1000 unchanged; there is no source-layout or shot-limit fallback.

Local outputs:

- `assets/map/config/levels/level_001.json` through `level_010.json`
- `levels/level_001.json` through `level_010.json`
- `assets/map/config/level_manifest.json`

Remote outputs:

- `remote-level-packs/level_manifest.json`
- `remote-level-packs/levels_pack_011_100.json`
- `remote-level-packs/levels_pack_101_200.json`
- `remote-level-packs/levels_pack_201_300.json`
- `remote-level-packs/levels_pack_301_400.json`
- `remote-level-packs/levels_pack_401_500.json`
- `remote-level-packs/levels_pack_501_600.json`
- `remote-level-packs/levels_pack_601_700.json`
- `remote-level-packs/levels_pack_701_800.json`
- `remote-level-packs/levels_pack_801_900.json`
- `remote-level-packs/levels_pack_901_1000.json`

Upload each remote pack to WeChat cloud storage under `level-packs/` with the same file name. The generated manifest uses fileIDs such as:

```text
cloud://cloud1-d7gqettx3e9249ca1.636c-cloud1-d7gqettx3e9249ca1-1428064608/level-packs/levels_pack_101_200.json
```

If the cloud environment or storage path changes, update the generator constants and rerun it so the manifest, hashes, and bytes stay aligned.

Runtime loading resolves each fileID with `wx.cloud.getTempFileURL`, then downloads the returned URL with `wx.downloadFile`. The opening level dialog also preloads the next remote pack on pack boundaries: level 100 preloads 101-200, level 200 preloads 201-300, and so on. The CloudBase download domain must be allowed in the WeChat project network settings for release builds.

The `level-packs/` storage path must allow client read access. If `wx.cloud.getTempFileURL` returns `STORAGE_EXCEED_AUTHORITY`, the files are uploaded correctly but the storage permission or security rule is blocking reads.

Run:

```bash
npm run redesign:relaxed-campaign
npm run generate:floating-map
npm run validate:levels
npm run validate:level-sync
npm run validate:aim
```

## Tuning Notes

- Levels 1-8 stay at 2-3 colors for onboarding; levels 9-74 use 4 colors; levels 75-100 use 5 colors. The later relaxed campaign keeps its existing palette progression.
- Every 10th level in 1-100 is a current-project 90-second `timed_infinite_shots` level; all other levels remain `shot_limited`. Shot limits are derived from the current ball budget, current special complexity, design beat and key-route allowance; no KXPPM shot or timed-mode value is imported.
- First-100 authored opening sequences span 3-6 balls and currently produce 48 distinct sequences. Runtime consumes the sequence in order before weighted random generation; revive queue replacement clears the remaining authored sequence.
- First-100 row distribution is 1x8, 5x9, 9x10, 12x11, 16x12, 20x13, 22x14, and 15x15. Current generated output has 100 unique occupancy silhouettes.
- Score design follows the same broad principle as Happy Match-style level scoring: ordinary elimination establishes the baseline, difficult objectives and reactive mechanics increase the opportunity budget, and efficient clears with more remaining shots provide the margin for higher stars. Project score units remain unchanged; external numeric values are not copied.
- Reference basis: the [Happy Match official TapTap announcement](https://www.taptap.cn/moment/15206728828193602) describes a large end-of-level score contribution from remaining moves, while the [Xiaomi Game Center strategy article](https://game.xiaomi.com/viewpoint/1359077112_1634868830858_9) highlights special combinations, large eliminations, objective collection, and fewer consumed moves as the main high-score sources. The campaign converts those principles into this project's own score scale and mechanics.
- Every formal level now stores explicit `targetScore` and `starThresholds`. Target score is the rounded sum of normal-ball opportunities, ice, other special entities, primary/secondary objectives, swirls, vine spirits, wormhole pairs, action budget, and an efficiency reserve. Star ratios tighten by design beat from `48%/68%/86%` for introduction to `56%/76%/94%` for exams; rescue uses `50%/70%/88%`.
- The current generated `targetScore` range is 6,300-21,000 with a median of 17,500.
- The generated campaign currently contains 100 timed levels, 484 swirl levels (928 swirls), 483 vine-spirit levels (887 spirits), 460 wormhole levels (760 pairs), 180 three-mechanic coexistence levels, 985 ice levels, 50 trapped-sprite rescue levels, and board occlusion on 921 compatible levels.
- Drop interval tightens gradually but does not go below 3.
- Coin rewards scale from 80 to 300.
- Stamina rewards appear every 10 levels.
- The generator is deterministic; changing the strategy and rerunning will produce stable output.
