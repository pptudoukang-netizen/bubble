# 微信小游戏广告与失败处理开发任务计划（严格模式版）

更新时间：2026-05-08
项目路径：`E:/coco_project/bubble`

## 0. 严格模式约束
本任务必须遵守项目 `AGENTS.md` 的 Fail-Fast 严格模式。

优先级：
1. 业务正确性
2. 可维护性
3. 可测试性
4. 可运行性

执行原则：
- 发现非法状态、缺失配置、接口结构不符合预期时，直接抛错。
- 广告失败、未完成观看、无填充等情况必须进入明确的业务失败分支，不允许通过默认奖励、默认配置或空数据继续伪装成功。
- 不写 fallback、默认值兜底、静默失败、吞异常、mock 数据兜底或兼容旧逻辑的临时分支。
- 奖励发放必须有明确来源、明确类型、明确 `attempt_id`，缺任一字段即报错。
- 文档中的“失败处理”指业务状态分流，不代表技术兜底。

用户明确要求的业务例外：
- 当 `GameBootstrap.rewardedVideoAdUnitId` 为空时，视为“缺少广告配置”。
- 缺少广告配置时，仅失败页 `LoseView` 的 `btn_ad` 入口跳过广告展示逻辑，直接登记下局奖励并进入下一局。
- 缺少广告配置时，必须隐藏 `LoseView` 预制体中 `btn_ad` 节点下的 `vido_icon` 广告图标。
- 该行为是用户明确要求的业务规则，不是技术兜底；仍必须保留奖励类型、失败原因、次数上限与发奖幂等校验。

## 1. 目标
- 在不破坏当前主玩法节奏的前提下，落地“失败原因分流 + 激励广告补救 + 埋点闭环”。
- 将输关处理从单一重开，升级为按失败原因展示不同的明确业务选择。
- 建立最小可用的数据漏斗，支撑后续调参与 A/B。
- 所有异常路径必须可观测、可复现、可测试，不允许被隐藏。

## 2. 关键决策（已确认）
- `lost_objective`（清屏但目标未达成）激励广告奖励为：`限时 5 秒入缸收集分数翻倍`。
- 本期不开发 `jar_magnet_boost`（缸体吸附增强）功能。
- 连败补偿池中移除 `jar_magnet_boost`。
- 第 5 次连败补偿必须配置为已实现道具；若配置缺失或指向未实现道具，启动或读取配置时直接报错，不允许自动改用默认道具。

## 3. 范围

### 3.1 本期纳入
- 失败状态分流：`out_of_shots` / `lost_danger` / `lost_objective`。
- 激励广告基础能力：加载、展示、关闭、发奖、失败结果回传。
- `GameBootstrap` 属性面板广告配置：`rewardedVideoAdUnitId`。
- 失败页、体力不足、道具库存不足三类广告入口。
- 入缸分数翻倍（5 秒）增益能力。
- 埋点事件与漏斗看板字段。
- 配置校验与关键接口返回结构校验。

### 3.2 本期不纳入
- `jar_magnet_boost` 相关逻辑、配置、表现。
- 付费/IAP 与商城链路。
- 多奖励并发叠加系统（本期仅支持单一短时分数增益）。
- 广告失败后的免费奖励、默认奖励或 mock 奖励。

## 4. 失败处理策略（产品口径）

### 4.1 输关失败
- `out_of_shots`：优先提供“补步数或补修正型道具”的激励入口。
- `lost_danger`：优先提供“破障类补救”的激励入口。
- `lost_objective`：提供“5 秒入缸收集分数翻倍”激励入口。
- 未识别的失败原因必须报错，不允许展示默认失败页广告入口。
- 若 `GameBootstrap.rewardedVideoAdUnitId` 为空，失败页 `btn_ad` 仍展示奖励入口，但隐藏 `vido_icon`；点击后不请求广告，直接登记对应失败类型的下局奖励并重开。

### 4.2 道具使用失败（局内按钮）
- `inventory_empty`：可触发“看广告补 1 个对应道具”。
- `busy` / `targeting_active` / `target_invalid`：仅提示，不弹广告。
- `no_obstacle`：仅提示，不弹广告。
- 未识别的道具失败原因必须报错，不允许静默 return。

### 4.3 体力不足
- 进关体力不足时，提供激励广告补体力入口。
- 每日上限、奖励数量、广告位 ID 必须来自显式配置。
- 缺少任一配置时直接报错，不允许使用默认上限或默认奖励。

## 5. 技术方案与任务拆分

## Phase A：基础能力层（广告 + 埋点）
- 新增广告服务封装（建议：`AdService`）：
  - 统一 `load/show/close/reward/error` 回调。
  - 统一广告结果类型：`completed`、`closed_early`、`no_fill`、`load_failed`、`show_failed`。
  - 广告 SDK 返回结构不符合预期时直接抛错。
  - 广告失败必须作为显式结果返回给调用方，不允许伪造成功、不允许发奖。
  - 奖励发放幂等：同一 `attempt_id + reward_type` 仅生效一次；重复发奖请求必须报错或拒绝并上报明确事件。
- `GameBootstrap.rewardedVideoAdUnitId`：
  - 写入 `GameBootstrap` 属性面板。
  - 非空时失败页 `btn_ad` 展示 `vido_icon` 并走激励广告。
  - 为空时失败页 `btn_ad` 隐藏 `vido_icon` 并走用户明确要求的无广告直发下局奖励分支。
  - 为空时不调用 `AdService.showRewarded`，不产生广告请求/展示事件。
- 新增埋点服务封装（建议：`TelemetryService`）：
  - 统一事件入口与公共字段注入：`session_id`、`attempt_id`、`level_id`、`level_code`。
  - 公共字段缺失时直接报错。
  - 事件字段结构不符合事件字典时直接报错。
  - 预留微信平台上报实现；本地日志仅用于开发观测，不作为线上兜底。

交付物：
- 广告服务脚本。
- 埋点服务脚本。
- 广告结果类型与错误码说明。
- 埋点事件字典。

## Phase B：失败分流接入
- 在运行态切换点接入失败原因分流与失败页广告位曝光上报。
- 根据失败类型展示对应激励入口与奖励说明文案。
- 失败原因必须来自真实运行态，不允许在缺失时补默认值。
- 失败原因与广告入口映射必须完整覆盖本期三种失败状态；缺失映射直接报错。
- 失败页 UI 必须根据 `rewardedVideoAdUnitId` 控制 `btn_ad/vido_icon`：
  - 有广告配置：`vido_icon.active = true`。
  - 缺少广告配置：`vido_icon.active = false`，`btn_ad` 保持可点击。

主要接入点（当前代码）：
- `assets/scripts/bootstrap/GameBootstrapUiFlowMethods.js`：`_handleRuntimeStateTransition`
- `assets/scripts/core/GameManagerShotResolutionMethods.js`：`_resolveBoardClearedOutcome`

交付物：
- 失败原因 -> 广告入口映射表。
- 失败页 UI 触发策略。
- 未识别失败原因的报错路径验证。

## Phase C：5 秒入缸分数翻倍增益
- 新增增益状态（建议字段）：
  - `jarScoreBoostActive`
  - `jarScoreBoostMultiplier`（固定 `2`）
  - `jarScoreBoostRemainingMs`（初始 `5000`）
- 在入缸计分函数中应用倍数；仅影响入缸得分，不改变目标计数逻辑。
- 增益规则：
  - 不叠加；重复触发仅刷新剩余时长到 5 秒。
  - 关卡结束、重开、返回选关时清空。
  - 非法倍数、非法剩余时长、非 `lost_objective` 来源的发放请求必须报错。

主要接入点（当前代码）：
- `assets/scripts/core/GameManagerShotResolutionMethods.js`：`_applyJarCollectionScore`
- `assets/scripts/core/GameManager.js`：`update` 循环与关卡重置流程

交付物：
- 可运行的 5 秒 x2 入缸得分能力。
- 增益表现文案与状态提示。
- 增益状态生命周期验证。

## Phase D：体力不足与道具不足广告补救
- 体力不足入口接入激励广告补体力。
- `inventory_empty` 分支接入“补 1 个道具”广告奖励。
- 增加每日上限与频控策略，避免过量发奖。
- 每日上限、频控键、奖励数量、道具类型必须显式配置。
- 库存结构、体力结构、奖励配置不符合预期时直接报错。

主要接入点（当前代码）：
- `assets/scripts/bootstrap/GameBootstrapUiFlowMethods.js`：`_consumeStaminaForLevelEntry`
- `assets/scripts/bootstrap/GameBootstrap.js`：
  - `_onUseSkillBallTap`
  - `_onUseSwapBallTap`
  - `_onUseBarrierHammerTap`

交付物：
- 体力广告补给链路。
- 道具不足广告补给链路。
- 上限与频控配置校验。

## Phase E：文档与配置收口
- 同步更新设计文档，移除 `jar_magnet_boost` 的本期实现项。
- 新增广告与失败处理配置说明：奖励 ID、频控、开关项、广告位 ID。
- 输出运营可读的事件字典与漏斗口径说明。
- 配置示例不得包含默认兜底语义。

交付物：
- 配置说明文档。
- 事件字典。
- 验收报告。

## 6. 埋点事件清单（P0）
- `level_start`
- `level_result`（字段：`result_state`）
- `ad_entry_exposed`
- `ad_request`
- `ad_show`
- `ad_close`（字段：`is_completed`）
- `ad_reward_grant`（字段：`reward_type`、`reward_value`）
- `ad_reward_rejected`（字段：`reward_type`、`reason`）
- `ad_error`（字段：`error_type`、`error_code`、`ad_placement`）
- `powerup_tap`
- `powerup_fail`（字段：`reason`）
- `jar_collect_scored`（字段：`is_score_boosted`、`boost_multiplier`）

事件规则：
- 必填字段缺失时直接报错。
- 字段类型不匹配时直接报错。
- 未登记事件不允许上报。

## 7. 里程碑
- M1：广告/埋点基础层可跑通，本地日志可观测，字段校验生效。
- M2：失败页三态分流 + 广告入口可触达，未识别失败原因会报错。
- M3：`lost_objective` 的 5 秒 x2 入缸得分上线。
- M4：体力不足与道具不足广告补救上线。
- M5：文档、事件字典、验收报告齐套。

## 8. 验收标准
- 功能正确：
  - `lost_objective` 看完广告后，5 秒内入缸得分按 2 倍计算。
  - `GameBootstrap.rewardedVideoAdUnitId` 为空时，失败页 `btn_ad/vido_icon` 隐藏广告图标。
  - `GameBootstrap.rewardedVideoAdUnitId` 为空时，点击失败页 `btn_ad` 不请求广告，直接重开并在下局发放对应奖励。
  - 增益到时自动失效，且不影响后续正常计分。
  - `jar_magnet_boost` 不出现在本期功能与配置入口中。
  - 广告提前关闭不发奖。
  - 广告加载/展示失败不发奖，并展示明确业务状态。
- 严格模式：
  - 未识别失败原因直接报错。
  - 缺失广告配置仅在用户明确要求的失败页 `btn_ad` 分支直发下局奖励；其他广告入口仍按配置缺失规则显式失败。
  - 缺失埋点必填字段直接报错。
  - 奖励类型、奖励值、奖励来源不合法时直接报错。
  - 不存在 `|| []`、`|| ''`、`?? defaultValue` 等默认值兜底。
  - 不存在 `catch (e) { return ... }` 或只打印日志后继续执行的吞异常逻辑。
- 数据：
  - 核心事件上报完整率可验证。
  - 能复盘“失败 -> 广告入口曝光 -> 广告请求 -> 广告结果 -> 发奖/拒绝发奖 -> 再尝试 -> 结果”的漏斗。

## 9. 风险与应对
- 风险：广告无填充或展示失败导致用户无法获得广告奖励。
  应对：将本次广告尝试标记为明确失败结果，不发奖，并允许用户按产品规则选择重试广告或普通重开。
- 风险：广告 SDK 回调结构异常。
  应对：直接抛错并记录 `ad_error`，阻止奖励发放。
- 风险：5 秒增益边界不清导致计分争议。
  应对：仅作用于 `_applyJarCollectionScore`，并补充单元/集成验证用例。
- 风险：旧文档仍保留 `jar_magnet_boost` 造成认知冲突。
  应对：本期收口时统一修订设计文档与配置示例。
- 风险：为了“可运行”引入默认奖励或默认配置。
  应对：代码评审与验收清单中显式检查，发现即退回。

## 10. 验证清单（测试执行）
1. 触发 `lost_objective`，完整观看广告，5 秒内连续入缸，确认得分翻倍。
2. 增益剩余时间归零后再入缸，确认恢复原始分值。
3. 广告提前关闭，确认不发奖，并产生明确拒绝发奖事件。
4. 模拟广告 `no_fill` / `load_failed` / `show_failed`，确认不发奖，并展示明确业务状态。
5. 清空 `GameBootstrap.rewardedVideoAdUnitId`，触发失败页，确认 `btn_ad/vido_icon` 隐藏但 `btn_ad` 可点击。
6. 清空 `GameBootstrap.rewardedVideoAdUnitId` 后点击失败页 `btn_ad`，确认不请求广告，直接重开并在下局发放对应奖励。
7. 体力不足广告补体力后，确认可正常进关。
8. 道具 `inventory_empty` 看广告补给后，确认库存 +1 且可立即使用。
9. 缺失奖励配置，确认直接报错。
10. 未识别失败原因，确认直接报错。
11. 检查埋点事件顺序与字段完整性。

## 11. 本次整理说明
- 修改文件：`WECHAT_AD_FAILURE_TASK_PLAN.md`。
- 修改原因：原文中“降级策略”“默认 `barrier_hammer`”“失败降级”“兜底分支”等表述与 `AGENTS.md` 的 Fail-Fast 严格模式冲突；同时补充用户明确要求的“缺少广告配置时失败页跳过广告并发放下局奖励”业务规则。
- 是否存在兜底逻辑：存在一个用户明确要求的业务例外，仅限 `GameBootstrap.rewardedVideoAdUnitId` 为空时的失败页 `btn_ad` 分支。
- 该例外不是静默失败：UI 会隐藏广告图标，点击路径不会请求广告，奖励仍走失败原因映射、次数上限、幂等发放与埋点记录。
