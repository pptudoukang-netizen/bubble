# 微信小游戏广告与失败处理开发任务计划（专项）

更新时间：2026-04-23  
项目路径：`E:/cocos_project/bubble`

## 1. 目标
- 在不破坏当前主玩法节奏的前提下，落地“失败分流处理 + 激励广告补救 + 埋点闭环”。
- 将失败处理从单一重开，升级为“按失败原因差异化补救”。
- 建立最小可用的数据漏斗，支撑后续调参与 A/B。

## 2. 关键决策（已确认）
- `lost_objective`（清屏但目标未达成）激励广告奖励为：`限时 5 秒入缸收集分数翻倍`。
- 本期**不开发**`缸体吸附增强（jar_magnet_boost）`功能。
- 连败补偿池中移除 `jar_magnet_boost`，第 5 次补偿改由其他已实现道具承担（默认 `barrier_hammer`）。

## 3. 范围

### 3.1 本期纳入
- 失败状态分流：`out_of_shots` / `lost_danger` / `lost_objective`。
- 激励广告基础能力：加载、展示、关闭、发奖、失败降级。
- 失败页、体力不足、道具库存不足三类广告入口。
- 入缸分数翻倍（5 秒）增益能力。
- 埋点事件与漏斗看板字段。

### 3.2 本期不纳入
- 缸体吸附增强相关逻辑、配置、表现。
- 付费/IAP 与商城链路。
- 多奖励并发叠加系统（本期仅支持单一短时分数增益）。

## 4. 失败处理策略（产品口径）

### 4.1 输关失败
- `out_of_shots`：优先提供“补步数或补修正型道具”的激励入口。
- `lost_danger`：优先提供“破障类补救”的激励入口。
- `lost_objective`：提供“5 秒入缸收集分数翻倍”激励入口（核心改动）。

### 4.2 道具使用失败（局内按钮）
- `inventory_empty`：可触发“看广告补 1 个对应道具”。
- `busy` / `targeting_active` / `target_invalid`：仅提示，不弹广告。
- `no_obstacle`：仅提示，不弹广告。

### 4.3 体力不足
- 进关体力不足时，提供激励广告补体力入口（含每日上限控制）。

## 5. 技术方案与任务拆分

## Phase A：基础能力层（广告 + 埋点）
- 新增广告服务封装（建议：`AdService`）：
  - 统一 `load/show/close/reward/error` 回调。
  - 统一错误码与降级策略（`no_fill`、`load_fail`、`show_fail`）。
  - 奖励发放幂等（同一 `attempt_id + reward_type` 仅生效一次）。
- 新增埋点服务封装（建议：`TelemetryService`）：
  - 统一事件入口与公共字段注入（`session_id`、`attempt_id`、`level_id`、`level_code`）。
  - 预留微信平台上报实现（本地先日志可观测）。

交付物：
- 广告服务脚本、埋点服务脚本、接入说明文档。

## Phase B：失败分流接入
- 在运行态切换点接入失败原因分流与失败页广告位曝光上报。
- 根据失败类型展示对应激励入口与奖励说明文案。

主要接入点（当前代码）：
- `assets/scripts/bootstrap/GameBootstrapUiFlowMethods.js`：`_handleRuntimeStateTransition`
- `assets/scripts/core/GameManagerShotResolutionMethods.js`：`_resolveBoardClearedOutcome`

交付物：
- 失败原因 -> 广告入口映射表
- 失败页 UI 触发策略

## Phase C：5 秒入缸分数翻倍增益
- 新增增益状态（建议字段）：
  - `jarScoreBoostActive`
  - `jarScoreBoostMultiplier`（固定 `2`）
  - `jarScoreBoostRemainingMs`（初始 `5000`）
- 在入缸计分函数中应用倍数（仅影响入缸得分，不改变目标计数逻辑）。
- 增益规则：
  - 不叠加；重复触发仅刷新剩余时长到 5 秒。
  - 关卡结束/重开/返回选关时清空。

主要接入点（当前代码）：
- `assets/scripts/core/GameManagerShotResolutionMethods.js`：`_applyJarCollectionScore`
- `assets/scripts/core/GameManager.js`：`update` 循环与关卡重置流程

交付物：
- 可运行的 5 秒 x2 入缸得分能力
- 增益表现文案与状态提示

## Phase D：体力不足与道具不足广告补救
- 体力不足入口接入激励广告补体力。
- `inventory_empty` 分支接入“补 1 个道具”广告奖励。
- 增加每日上限与频控策略，避免过量发奖。

主要接入点（当前代码）：
- `assets/scripts/bootstrap/GameBootstrapUiFlowMethods.js`：`_consumeStaminaForLevelEntry`
- `assets/scripts/bootstrap/GameBootstrap.js`：
  - `_onUseSkillBallTap`
  - `_onUseSwapBallTap`
  - `_onUseBarrierHammerTap`

交付物：
- 体力广告补给链路
- 道具不足广告补给链路

## Phase E：文档与配置收口
- 同步更新设计文档，移除 `jar_magnet_boost` 的本期实现项。
- 新增广告与失败处理配置说明（奖励 ID、频控、开关项）。
- 输出运营可读的事件字典与漏斗口径说明。

## 6. 埋点事件清单（P0）
- `level_start`
- `level_result`（字段：`result_state`）
- `ad_entry_exposed`
- `ad_request`
- `ad_show`
- `ad_close`（字段：`is_completed`）
- `ad_reward_grant`（字段：`reward_type`、`reward_value`）
- `powerup_tap`
- `powerup_fail`（字段：`reason`）
- `jar_collect_scored`（字段：`is_score_boosted`、`boost_multiplier`）

## 7. 里程碑
- M1：广告/埋点基础层可跑通（本地日志可观测）。
- M2：失败页三态分流 + 广告入口可触达。
- M3：`lost_objective` 的 5 秒 x2 入缸得分上线。
- M4：体力不足与道具不足广告补救上线。
- M5：文档、事件字典、验收报告齐套。

## 8. 验收标准
- 功能正确：
  - `lost_objective` 看完广告后，5 秒内入缸得分按 2 倍计算。
  - 增益到时自动失效，且不影响后续正常计分。
  - `jar_magnet_boost` 不出现在本期功能与配置入口中。
- 稳定性：
  - 广告加载/展示失败不阻断主流程，可回退到重试或普通重开。
  - 奖励发放无重复、无漏发。
- 数据：
  - 核心事件上报完整率可验证。
  - 能复盘“失败 -> 广告 -> 发奖 -> 再尝试 -> 结果”的漏斗。

## 9. 风险与应对
- 风险：广告无填充或回调异常导致流程中断。  
  应对：全链路降级分支 + 超时保护 + 幂等发奖。
- 风险：5 秒增益边界不清导致计分争议。  
  应对：仅作用于 `_applyJarCollectionScore`，并补充单元/集成验证用例。
- 风险：旧文档仍保留 `jar_magnet_boost` 造成认知冲突。  
  应对：本期收口时统一修订设计文档与配置示例。

## 10. 验证清单（测试执行）
1. 触发 `lost_objective`，完整观看广告，5 秒内连续入缸，确认得分翻倍。  
2. 增益剩余时间归零后再入缸，确认恢复原始分值。  
3. 广告提前关闭，确认不发奖。  
4. 模拟广告失败（load/show），确认流程可继续并有明确提示。  
5. 体力不足广告补体力后，确认可正常进关。  
6. 道具 `inventory_empty` 看广告补给后，确认库存+1且可立即使用。  
7. 检查埋点事件顺序与字段完整性。  

