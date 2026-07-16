# 1000 Level Campaign Design

## Goal

The 1000-level campaign extends the current 40-level bubble shooter progression into a long-form staged campaign. The design keeps the existing fail-fast configuration model: every level must be explicit, valid, and loadable without runtime defaults.

## Progression Structure

Levels 1-300 use `E:\kxppm\decrypted_config\all_levels.json` only as an occupancy-silhouette reference. The source has normal campaign levels 1-200: levels 1-200 project the same-numbered source mask, while levels 201-300 project mirrored variants of source levels 101-200. The source 11/10-column `bubbles` geometry is converted into the current 10/9-column board while current project row counts and occupied-ball budgets are preserved. Every gameplay field remains project-authored: colors, collection objectives, special entities, shots, opening sequences, star thresholds, rewards and play mode are not imported from KXPPM. Levels 1-100 and 101-300 use separate project-owned per-level shot calibration tables measured with the current runtime logic. Levels 301-1000 continue to use the symbolic relaxed-campaign silhouettes. Levels 1-10 are bundled locally and levels 11-1000 remain grouped into remote 100-level packs for WeChat cloud storage.

The new campaign uses these chapters:

- Levels 1-100: current project progression and mechanics, with KXPPM occupancy silhouettes projected to the current 10/9-column board.
- Levels 101-140: molotov and splitter combo routes.
- Levels 141-180: splitter and locked ball combo routes.
- Levels 181-200: first full reactive mechanics exam.
- Levels 201-300: blast-chain gameplay on mirrored KXPPM 101-200 occupancy references.
- Levels 301-1000: four 100-level cycle themes: growth and keys, symbolic patterns, full system mastery, blast chain routes.

Levels 1-100 keep the current `collect_color` primary objective and add the current `collect_ice_snowball` secondary objective when required by configured ice count. They remain normal `shot_limited` levels, use current special-entity progression, current reward rules, current 3-6 ball `openingShotBalls`, and project-authored explicit star thresholds. KXPPM shot counts, timed modes, colors, special codes, precedence balls, scores and rewards are deliberately ignored.

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

- A level either contains no wormhole or exactly two wormholes. The pair must stay on the same row, use the same `moveDirection` (`left` or `right`), and contain at least one interior slot.
- After each fired bubble finishes its normal shot resolution, every interior slot between the two fixed endpoints moves exactly one slot in `moveDirection`, wrapping at the opposite end. Normal balls, special balls, vine ownership state and empty slots all move together.
- Wormholes never move with their own cycle, never participate in color matching, cannot be eliminated or dropped, and act as permanent support anchors.
- The wormhole node and outer ring stay fixed. `effects/WormholeFlow` rotates only the inner UV field with stronger distortion toward the center, adds a fast blue-purple highlight sweeping around a circular band, softly breathes the star and rim brightness, and pulses the dark center. The shader remains active during the interior-slot shift animation; the complete texture never rotates mechanically.
- The 0.35-second shift locks input. Support is recalculated when the animation finishes, and every newly unsupported non-wormhole cell immediately enters the normal falling-marble pipeline.
- The shift never invokes color matching. Even if the new arrangement forms a valid same-color group, it remains until a later player shot resolves that match.
- A board containing only the two permanent wormholes counts as cleared. The top-anchor collapse rule does not override wormhole support.
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
- Every third fired bubble, each surviving spirit selects the nearest unentangled normal colored bubble. Ties are resolved by row, column and cell id so the result is deterministic.
- The selected target first shows the semi-transparent `image/ball/vines` warning for 0.65 seconds. Input and other post-shot special phases remain locked until the warning completes, then the vine becomes active.
- An entangled ball cannot participate in color matching and is treated as a support anchor, so it does not enter the normal floating-drop pipeline.
- A direct projectile collision or an elimination in an adjacent hex cell removes the vine without removing the underlying colored ball.
- When a vine spirit reaches 0 health, its board cell is removed and every active or preview vine owned by that spirit withers immediately.
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

Levels 1-300 do not use the former symbolic shape functions to select occupied cells. Each KXPPM source mask becomes a normalized occupied/empty distance field; the generator selects the closest connected cells while preserving the current project row count and occupied-ball budget. The target top row is always full, every target row remains connected to the ceiling, row widths are fixed at 10/9, and the generated ranges contain 100 unique first-range signatures plus 200 distinct signatures across levels 101-300. For levels 101-300, absolute horizontal centroid offset and left/right occupancy delta must both remain at or below 0.20; the current maxima are 0.134 and 0.170.

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

For levels 1-100, board height and occupied-ball count remain project-authored at 8-15 rows. Levels 101-300 retain the current relaxed-campaign 15-row height and fill budget. In both ranges only the normalized silhouette comes from the source. Levels 301-1000 retain the symbolic relaxed-campaign shape, height and fill rules.

First-100 shot limits are explicitly calibrated per level against the projected layouts and current gameplay runtime. The calibration reduces excessive surplus shots on high-cascade layouts, preserves the established limits on observed pressure levels, and keeps a dedicated safety allowance for level 96's key/lock route. The table must contain exactly 100 positive integers; missing or invalid entries fail generation immediately. The independent two-attempt simulation seed `20260729` clears 100/100 levels with an average of 7.43 remaining shots and a median of 7.

Levels 101-300 use a separate 200-entry calibrated shot table. The final independent two-attempt simulation seed `20260729` clears 200/200 levels with an average of 8.79 remaining shots and a median of 8; the 25th/75th percentiles are 5/12. Pressure levels retain explicit safety limits instead of receiving a blanket reduction. Missing, extra or non-positive table entries fail generation immediately.

Current special entities are placed inside the projected occupied silhouette before clustered project colors are assigned. Their types and counts come only from current project progression. Levels 101-300 preserve the deterministic current-project middle-board placement order while restricting positions to the projected reference silhouette. Levels 301-1000 retain the symbolic relaxed-campaign placement rules.

## Generation Rules

The base generator is `tools/generate-1000-level-configs.js`.

For the relaxed 1000-level campaign rebuild, run `npm run redesign:relaxed-campaign`. This command rewrites `LEVEL_CONFIG_TABLE_1_1000.csv`, regenerates local levels 1-10, regenerates every remote compact pack from 11-1000, updates `remote-level-packs/level_manifest.json`, updates `assets/map/config/level_manifest.json`, and syncs the root `levels/` mirror.

For the staged first-100 rebuild, first ensure `E:\kxppm\decrypted_config\all_levels.json` exists, then run `npm run generate:levels-first100`. This command rewrites only the first 100 CSV rows, local levels 1-10, `levels_pack_011_100.json`, and that pack's manifest hash/size entry. It verifies source row widths/codes, current gameplay fields, 10/9 target widths, ceiling support, exact current color/special counts and 100 unique occupancy silhouettes. It intentionally leaves levels 101-1000 and their remote packs unchanged. There is deliberately no fallback when the reference file is missing or invalid.

For levels 101-300, run `npm run generate:levels101-300`. This command rewrites only their CSV shot-limit cells, `levels_pack_101_200.json`, `levels_pack_201_300.json`, and the corresponding remote-manifest entries. It validates source codes and row widths, exact projected occupancy, current gameplay fields, 10/9 target widths, ceiling support, color/special counts, and 200 distinct silhouettes. It intentionally leaves levels 1-100 and 301-1000 unchanged; there is no source-layout or shot-limit fallback.

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

Upload each remote pack to WeChat cloud storage under `level-packs-compact/` with the same file name. The generated manifest uses fileIDs such as:

```text
cloud://cloud1-d7gqettx3e9249ca1.636c-cloud1-d7gqettx3e9249ca1-1428064608/level-packs-compact/levels_pack_101_200.json
```

If the cloud environment or storage path changes, update the generator constants and rerun it so the manifest, hashes, and bytes stay aligned.

Runtime loading resolves each fileID with `wx.cloud.getTempFileURL`, then downloads the returned URL with `wx.downloadFile`. The opening level dialog also preloads the next remote pack on pack boundaries: level 100 preloads 101-200, level 200 preloads 201-300, and so on. The CloudBase download domain must be allowed in the WeChat project network settings for release builds.

The `level-packs-compact/` storage path must allow client read access. If `wx.cloud.getTempFileURL` returns `STORAGE_EXCEED_AUTHORITY`, the files are uploaded correctly but the storage permission or security rule is blocking reads.

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
- All levels 1-100 remain current-project `shot_limited` levels. Shot limits are derived from the current ball budget, current special complexity, design beat and key-route allowance; no KXPPM shot or timed-mode value is imported.
- First-100 authored opening sequences span 3-6 balls and currently produce 48 distinct sequences. Runtime consumes the sequence in order before weighted random generation; revive queue replacement clears the remaining authored sequence.
- First-100 row distribution is 1x8, 5x9, 9x10, 12x11, 16x12, 20x13, 22x14, and 15x15. Current generated output has 100 unique occupancy silhouettes.
- Target score is generated from total normal balls, primary collection value, snow/ice target value, non-ice special count, and row count. The score model is intentionally higher than the old target-only formula so 1-star clears are not automatic when players barely finish.
- The relaxed-campaign statistics for levels 101-1000 remain separate from the staged first-100 statistics above.
- Drop interval tightens gradually but does not go below 3.
- Coin rewards scale from 80 to 300.
- Stamina rewards appear every 10 levels.
- The generator is deterministic; changing the strategy and rerunning will produce stable output.
