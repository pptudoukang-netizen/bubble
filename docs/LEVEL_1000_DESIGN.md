# 1000 Level Campaign Design

## Goal

The 1000-level campaign extends the current 40-level bubble shooter progression into a long-form staged campaign. The design keeps the existing fail-fast configuration model: every level must be explicit, valid, and loadable without runtime defaults.

## Progression Structure

Levels 1-40 remain the existing shipped chapter. Levels 41-1000 are generated from deterministic templates and mirror the same JSON schema used by the current levels. Levels 1-100 are bundled locally; levels 101-1000 are grouped into remote 100-level packs for WeChat cloud storage.

The new campaign uses these chapters:

- Levels 41-60: molotov intro and two-molotov chain basics.
- Levels 61-80: splitter intro with single-color split reinforcement.
- Levels 81-100: locked ball and key intro.
- Levels 101-140: molotov and splitter combo routes.
- Levels 141-180: splitter and locked ball combo routes.
- Levels 181-200: first full reactive mechanics exam.
- Levels 201-1000: four 100-level cycle themes: blast chain routes, growth and keys, symbolic patterns, full system mastery.

Every chapter keeps `clear_all` as the primary win condition and alternates between `collect_any` and `collect_color` as the secondary goal.

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
- Collected keys unlock all locked balls with the same group.
- Key collection is resolved before support/floating calculation.

## Board Pattern Strategy

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
