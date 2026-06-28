# 1000 Level Campaign Design

## Goal

The 1000-level campaign extends the current 40-level bubble shooter progression into a long-form staged campaign. The design keeps the existing fail-fast configuration model: every level must be explicit, valid, and loadable without runtime defaults.

## Progression Structure

Levels 1-100 use the deterministic first-100 design rules in `tools/first-100-level-design.js`. Levels 1-10 are bundled locally, levels 11-100 use the first remote pack, and levels 101-1000 remain grouped into remote 100-level packs for WeChat cloud storage.

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

Levels 1-100 use one explicit `collect_color` primary target. Levels containing at least three ice balls add an exact `collect_ice_snowball` secondary target whose value equals the configured ice count.

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

Levels 1-100 rotate through ten real occupancy silhouettes: `roof_bands`, `twin_wings`, `hollow_v`, `support_bridge`, `diamond_core`, `side_gate`, `diagonal_wave`, `heart_pocket`, `split_islands`, and `crown_exam`. The silhouette is generated before special placement and color assignment. Every board keeps a connected top anchor, colors are assigned in compact chunks, and special entities occupy cells inside the declared silhouette.

The first-100 quality gates require every level to use the exact deterministic silhouette, keep special density at or below 30%, use at most four special entity types, and pass the clustered color checks. Difficulty follows a ten-level wave: the opening levels teach or reinforce, levels 8-9 raise pressure, and level 10 is the chapter exam before the next wave resets.

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

Special entities are placed on explicit `.` slots in `layout`; the layout remains authoritative for normal colored balls.

## Generation Rules

The generator is `tools/generate-1000-level-configs.js`.

For the staged first-100 rebuild, run `npm run generate:levels-first100`. This command rewrites only the first 100 CSV rows, local levels 1-10, `levels_pack_011_100.json`, and that pack's manifest hash/size entry. It intentionally leaves levels 101-1000 and their remote packs unchanged.

It preserves existing levels 1-40, writes generated levels 41-100 locally, and groups levels 101-1000 into remote packs.

Local outputs:

- `assets/resources/config/levels/level_041.json` through `level_100.json`
- `levels/level_041.json` through `level_100.json`
- Cocos JSON `.meta` files for generated local resource levels

Remote outputs:

- `remote-level-packs/levels_pack_101_200.json`
- `remote-level-packs/levels_pack_201_300.json`
- `remote-level-packs/levels_pack_301_400.json`
- `remote-level-packs/levels_pack_401_500.json`
- `remote-level-packs/levels_pack_501_600.json`
- `remote-level-packs/levels_pack_601_700.json`
- `remote-level-packs/levels_pack_701_800.json`
- `remote-level-packs/levels_pack_801_900.json`
- `remote-level-packs/levels_pack_901_1000.json`
- `assets/resources/config/level_manifest.json`

Upload each remote pack to WeChat cloud storage under `level-packs/` with the same file name. The generated manifest uses fileIDs such as:

```text
cloud://cloud1-d7gqettx3e9249ca1.636c-cloud1-d7gqettx3e9249ca1-1428064608/level-packs/levels_pack_101_200.json
```

If the cloud environment or storage path changes, update the generator constants and rerun it so the manifest, hashes, and bytes stay aligned.

Runtime loading resolves each fileID with `wx.cloud.getTempFileURL`, then downloads the returned URL with `wx.downloadFile`. The opening level dialog also preloads the next remote pack on pack boundaries: level 100 preloads 101-200, level 200 preloads 201-300, and so on. The CloudBase download domain must be allowed in the WeChat project network settings for release builds.

The `level-packs/` storage path must allow client read access. If `wx.cloud.getTempFileURL` returns `STORAGE_EXCEED_AUTHORITY`, the files are uploaded correctly but the storage permission or security rule is blocking reads.

Run:

```bash
npm run generate:levels1000
npm run generate:floating-map
npm run validate:levels
npm run validate:level-sync
npm run validate:aim
```

## Tuning Notes

- Levels 41-74 use 4 colors; levels 75-1000 use 5 colors.
- Shot limits grow gradually with campaign progress and special entity density.
- Drop interval tightens gradually but does not go below 3.
- Coin rewards scale from 80 to 300.
- Stamina rewards appear every 10 levels.
- The generator is deterministic; changing the strategy and rerunning will produce stable output.
