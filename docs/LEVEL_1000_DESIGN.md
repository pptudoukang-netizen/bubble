# 1000 Level Campaign Design

## Goal

The 1000-level campaign extends the current 40-level bubble shooter progression into a long-form staged campaign. The design keeps the existing fail-fast configuration model: every level must be explicit, valid, and loadable without runtime defaults.

## Progression Structure

Levels 1-100 use the deterministic first-100 design rules in `tools/first-100-level-design.js`. Levels 101-1000 use the relaxed campaign rebuild rules in `tools/rebuild-relaxed-campaign-level-configs.js`. Levels 1-10 are bundled locally, levels 11-100 use the first remote pack, and levels 101-1000 remain grouped into remote 100-level packs for WeChat cloud storage.

The new campaign uses these chapters:

- Levels 1-9: compact color clusters, support reading, and silhouette fundamentals.
- Levels 10-15: stone, rainbow, and blast introductions.
- Levels 16-40: ice-route training with bounded legacy-skill combinations.
- Levels 41-60: molotov intro and two-molotov chain basics.
- Levels 61-80: splitter intro with single-color split reinforcement.
- Levels 81-100: locked ball and key intro.
- Levels 101-140: molotov and splitter combo routes.
- Levels 141-180: splitter and locked ball combo routes.
- Levels 181-200: first full reactive mechanics exam.
- Levels 201-1000: four 100-level cycle themes: blast chain routes, growth and keys, symbolic patterns, full system mastery.

Levels 1-100 use one explicit `collect_color` primary target. Levels containing at least three ice balls add an exact `collect_ice_snowball` secondary target whose value equals the configured ice count. Their visual design is silhouette-first: the theme and outer contour are fixed before normal colors and special entities are placed.

## New Entity Rules

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

Levels 1-100 switch silhouette themes every 15-20 levels so the campaign keeps a coherent visual language without repeating one outline for the entire mechanic chapter:

- Levels 1-15: `flower`, using bud, bloom, lotus, bell, and twin-flower variants.
- Levels 16-30: `crystal`, using spire, cluster, diamond, pendant, and twin-crystal variants.
- Levels 31-45: `snowflake`, using core, branch, crown, hourglass, and wing variants.
- Levels 46-60: `star`, using core, burst, crown, gate, and twin-star variants.
- Levels 61-80: `wing`, using butterfly, feather, bridge, crown, and heart variants.
- Levels 81-100: `crown`, using arch, gem, tower, keyhole, and exam variants.

The silhouette is generated before special placement and color assignment. Exact mirroring is not required, but every board must keep a stable visual center, a left-right occupied-cell difference of at most 10%, no more than one row of left-right bottom-height difference, one declared visual focus, and naturally changing edges. The forced full top row is treated as the ceiling anchor and is excluded from contour-step scoring. Below it, adjacent contour widths must not jump by more than four cells, normalized edge movement must remain within `0.56`, and rigid rectangular edge runs may not exceed three rows.

The first-100 quality gates also require every level to use its exact deterministic themed silhouette, keep special density at or below 30%, use at most four special entity types, keep the focal special near the declared focus, and pass the clustered color checks. Difficulty still follows a ten-level wave independently of the visual-theme boundaries: the opening levels teach or reinforce, levels 8-9 raise pressure, and level 10 is the chapter exam before the next wave resets.

Generated levels use symbolic board silhouettes to increase variety:

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

For the relaxed campaign, board height and fill are explicit constraints. Level 1 uses 8 rows and must exceed 60% fill. Levels 2-19 use 10 rows and must be at least 60% filled. Levels 20-1000 use 15 rows and must be at least 60% filled. The generated campaign keeps controlled blocker density while using the larger board to create more clearing volume.

Special entities are placed on explicit `.` slots in `layout`; the layout remains authoritative for normal colored balls. Generated campaign specials use deterministic upper/middle-board slot variation before clustered color assignment, so repeated neighboring levels do not share the same special-position signature.

## Generation Rules

The base generator is `tools/generate-1000-level-configs.js`.

For the relaxed 1000-level campaign rebuild, run `npm run redesign:relaxed-campaign`. This command rewrites `LEVEL_CONFIG_TABLE_1_1000.csv`, regenerates local levels 1-10, regenerates every remote compact pack from 11-1000, updates `remote-level-packs/level_manifest.json`, updates `assets/resources/config/level_manifest.json`, and syncs the root `levels/` mirror.

For the staged first-100 rebuild, run `npm run generate:levels-first100`. This command rewrites only the first 100 CSV rows, local levels 1-10, `levels_pack_011_100.json`, and that pack's manifest hash/size entry. It intentionally leaves levels 101-1000 and their remote packs unchanged.

Local outputs:

- `assets/resources/config/levels/level_001.json` through `level_010.json`
- `levels/level_001.json` through `level_010.json`
- `assets/resources/config/level_manifest.json`

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

- Levels 1-8 stay at 2-3 colors for onboarding; levels 9-160 mostly use 4 colors; levels 161-1000 use 5 colors.
- Shot limits target a relaxed clear rhythm: level 1 starts at 24 shots, levels 2-19 scale against the 10-row board, and levels 20-1000 cap at 40 shots for the 15-row board.
- Target score is generated from total normal balls, primary collection value, snow/ice target value, non-ice special count, and row count. The score model is intentionally higher than the old target-only formula so 1-star clears are not automatic when players barely finish.
- Current relaxed rebuild statistics: row histogram is 1 level at 8 rows, 18 levels at 10 rows, and 981 levels at 15 rows. Minimum fill is 60.00% on levels 2-19; level 1 is 60.53%; level 20 is 60.14%; level 448 is 15 rows, 97 occupied cells, and 40 shots.
- Drop interval tightens gradually but does not go below 3.
- Coin rewards scale from 80 to 300.
- Stamina rewards appear every 10 levels.
- The generator is deterministic; changing the strategy and rerunning will produce stable output.
