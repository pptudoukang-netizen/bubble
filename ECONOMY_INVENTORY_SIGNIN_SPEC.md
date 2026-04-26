# 签到、金币与背包系统开发文档

## 1. 文档目标

本文档用于定义当前项目的三套基础运营系统：

- `7 天签到系统`
- `金币系统`
- `背包系统`

三者关系：

- 签到系统负责周期性发放奖励
- 金币系统负责基础货币流通
- 背包系统负责保存和消耗道具

本文档可作为程序开发、配置表设计、UI 制作和测试验收依据。

## 2. 当前道具范围

当前系统只接入 4 种救场道具：

- `swap_ball`：换球
- `rainbow_ball`：彩虹道具球
- `blast_ball`：炸裂道具球
- `barrier_hammer`：破障锤

说明：

- 不包含缸体吸附增强
- 不包含独立技能槽
- 不包含一键清屏类道具

道具详细规则见：

- [POWERUP_ITEMS_SPEC.md](E:\cocos_project\bubble\POWERUP_ITEMS_SPEC.md)

## 3. 7 天签到系统

## 3.1 设计目标

签到系统用于：

- 提升前期留存
- 稳定发放金币
- 引导玩家逐步认识道具
- 给高难关提供温和补给

## 3.2 基础规则

- 签到周期：`7` 天
- 每天可领取 `1` 次奖励
- 第 `7` 天领取后，下一次可领取时进入新一轮第 `1` 天
- 漏签不重置进度
- 未领取当天奖励时，主界面签到入口显示红点

推荐策略：

- `missedDayPolicy = keep_progress`
- `resetMode = loop_after_day_7`

## 3.3 领取时机

玩家进入主界面时：

1. 读取本地日期
2. 判断今天是否已经领取
3. 若未领取，显示签到入口红点
4. 可选择自动弹出签到面板

首版建议：

- 每天首次进入主界面自动弹一次
- 玩家关闭后仍保留红点

## 3.4 7 天奖励配置

推荐配置：

```json
{
  "dailySignIn": {
    "cycleLength": 7,
    "resetMode": "loop_after_day_7",
    "missedDayPolicy": "keep_progress",
    "autoPopupOnFirstLogin": true,
    "rewards": [
      {
        "day": 1,
        "items": [
          { "id": "coin", "count": 100 }
        ]
      },
      {
        "day": 2,
        "items": [
          { "id": "swap_ball", "count": 1 }
        ]
      },
      {
        "day": 3,
        "items": [
          { "id": "coin", "count": 150 },
          { "id": "rainbow_ball", "count": 1 }
        ]
      },
      {
        "day": 4,
        "items": [
          { "id": "barrier_hammer", "count": 1 }
        ]
      },
      {
        "day": 5,
        "items": [
          { "id": "coin", "count": 200 },
          { "id": "blast_ball", "count": 1 }
        ]
      },
      {
        "day": 6,
        "items": [
          { "id": "swap_ball", "count": 1 },
          { "id": "rainbow_ball", "count": 1 }
        ]
      },
      {
        "day": 7,
        "items": [
          { "id": "coin", "count": 500 },
          { "id": "blast_ball", "count": 1 },
          { "id": "barrier_hammer", "count": 1 }
        ]
      }
    ]
  }
}
```

## 3.5 签到状态存档

推荐玩家数据：

```json
{
  "signInState": {
    "cycleIndex": 1,
    "currentCycleDay": 1,
    "lastClaimDate": "",
    "claimedDaysInCycle": []
  }
}
```

字段说明：

- `cycleIndex`
  - 当前第几轮 7 日签到

- `currentCycleDay`
  - 当前可领取第几天奖励
  - 范围：`1~7`

- `lastClaimDate`
  - 上次领取日期
  - 推荐格式：`YYYY-MM-DD`

- `claimedDaysInCycle`
  - 当前周期已领取的天数数组

## 3.6 时间判定

首版建议：

- 使用本地自然日
- 日期格式：`YYYY-MM-DD`
- 每天 `00:00` 后可领取新一天

后续接服务器后：

- 改用服务器时间
- 避免玩家通过修改本地时间重复领取

## 3.7 领取流程

领取流程：

1. 点击“领取今日奖励”
2. 校验今天是否已领取
3. 读取当前 `currentCycleDay`
4. 发放奖励到金币或背包
5. 写入存档
6. 播放奖励动画
7. 更新红点

重要规则：

- 必须先写存档，再播放动画
- 防止崩溃或退出造成重复领取

## 3.8 周期推进规则

领取后：

- 如果当前天数 `< 7`
  - `currentCycleDay += 1`
- 如果当前天数 `= 7`
  - `cycleIndex += 1`
  - `currentCycleDay = 1`
  - 清空 `claimedDaysInCycle`

## 3.9 UI 要求

签到面板建议展示：

- 7 个奖励格
- 今日可领取高亮
- 已领取显示勾
- 第 7 天奖励放大或加光效
- 领取按钮

状态：

- `claimed`
- `claimable`
- `locked`

## 4. 金币系统

## 4.1 设计目标

金币是当前项目的基础通用货币，用于：

- 承接签到奖励
- 承接关卡奖励
- 购买救场道具

首版不建议让金币承担过多功能，避免经济系统过早复杂化。

## 4.2 金币来源

首版来源：

- 签到奖励
- 关卡通关奖励
- 首次通关奖励
- 星级或附加目标奖励

后续可扩展：

- 活动奖励
- 每日任务
- 成就奖励

## 4.3 金币消耗

首版用途：

- 购买 `swap_ball`
- 购买 `rainbow_ball`
- 购买 `blast_ball`
- 购买 `barrier_hammer`

## 4.4 金币存档字段

```json
{
  "currency": {
    "coin": 1200
  }
}
```

## 4.5 金币变更接口语义

建议封装统一接口：

- `addCoin(amount, reason)`
- `spendCoin(amount, reason)`
- `canAffordCoin(amount)`

## 4.6 金币变更日志

建议记录最近若干条变动：

```json
{
  "currencyLogs": [
    {
      "type": "coin",
      "change": -200,
      "reason": "buy_powerup",
      "itemId": "rainbow_ball",
      "timestamp": 1713859200000
    }
  ]
}
```

用途：

- 调试
- 排查重复发放
- 后续接入埋点

## 4.7 道具价格建议

首版价格：

```json
{
  "shopItems": [
    {
      "itemId": "swap_ball",
      "price": 100,
      "currency": "coin",
      "limitPerDay": 5
    },
    {
      "itemId": "rainbow_ball",
      "price": 200,
      "currency": "coin",
      "limitPerDay": 3
    },
    {
      "itemId": "blast_ball",
      "price": 300,
      "currency": "coin",
      "limitPerDay": 2
    },
    {
      "itemId": "barrier_hammer",
      "price": 300,
      "currency": "coin",
      "limitPerDay": 2
    }
  ]
}
```

## 4.8 关卡金币奖励建议

推荐基础规则：

- 普通通关：`50~100`
- 高难通关：`100~180`
- 首通额外：`+50`
- 附加目标额外：`+30~100`

推荐结算结构：

```json
{
  "levelReward": {
    "baseCoin": 80,
    "firstClearBonus": 50,
    "bonusObjectiveCoin": 60,
    "totalCoin": 190
  }
}
```

## 5. 背包系统

## 5.1 设计目标

背包系统用于保存玩家拥有的可消耗道具。

首版背包只管理数量，不做：

- 装备
- 材料合成
- 碎片
- 限时过期道具

## 5.2 背包内容

当前可存储：

- `swap_ball`
- `rainbow_ball`
- `blast_ball`
- `barrier_hammer`

## 5.3 背包存档字段

首版推荐 key-value：

```json
{
  "inventory": {
    "items": {
      "swap_ball": 3,
      "rainbow_ball": 2,
      "blast_ball": 1,
      "barrier_hammer": 1
    }
  }
}
```

## 5.4 背包接口语义

建议封装：

- `addItem(itemId, count, reason)`
- `removeItem(itemId, count, reason)`
- `getItemCount(itemId)`
- `hasItem(itemId, count)`

## 5.5 背包变更规则

- 签到奖励：增加道具数量
- 商店购买：增加道具数量
- 局内使用：扣除道具数量
- 失败补偿：可增加临时或永久道具

首版建议：

- 所有发放都进入永久背包
- 失败补偿也直接加到背包

## 5.6 局前携带规则

进入关卡前，玩家可以选择携带道具。

推荐规则：
- 道具真正使用时才从背包扣除
- 未使用则不扣除

局前选择示例：

```json
{
  "selectedPowerups": [
    "swap_ball",
    "rainbow_ball"
  ]
}
```

## 5.7 局内使用规则

使用道具时：

1. 检查是否已携带该道具
2. 检查本局是否已经使用过
3. 检查背包数量是否足够
4. 扣除背包数量
5. 应用道具效果
6. 记录本局已使用

推荐局内状态：

```json
{
  "runPowerupState": {
    "selectedPowerups": [
      "swap_ball",
      "rainbow_ball"
    ],
    "usedPowerups": []
  }
}
```

## 6. 商店系统

商店系统的详细实现说明、事务流程、错误码与测试清单见：

- [SHOP_SYSTEM_SPEC.md](E:\cocos_project\bubble\SHOP_SYSTEM_SPEC.md)

## 6.1 设计目标

商店用于让玩家用金币购买救场道具。

首版商店只提供 4 个道具：

- `swap_ball`
- `rainbow_ball`
- `blast_ball`
- `barrier_hammer`

## 6.2 购买流程

1. 玩家点击购买
2. 检查商品是否存在
3. 检查金币是否足够
4. 检查是否超过每日限购
5. 扣除金币
6. 增加背包数量
7. 写入购买记录
8. 播放获得动画

## 6.3 每日限购状态

```json
{
  "shopState": {
    "dailyPurchases": {
      "date": "2026-04-23",
      "items": {
        "swap_ball": 1,
        "rainbow_ball": 0,
        "blast_ball": 0,
        "barrier_hammer": 0
      }
    }
  }
}
```

规则：

- 日期变化后重置 `dailyPurchases`
- 限购只限制金币购买，不限制签到奖励

## 7. 玩家总存档结构

推荐完整结构：

```json
{
  "playerData": {
    "currency": {
      "coin": 1200
    },
    "inventory": {
      "items": {
        "swap_ball": 3,
        "rainbow_ball": 2,
        "blast_ball": 1,
        "barrier_hammer": 1
      }
    },
    "signInState": {
      "cycleIndex": 1,
      "currentCycleDay": 1,
      "lastClaimDate": "",
      "claimedDaysInCycle": []
    },
    "shopState": {
      "dailyPurchases": {
        "date": "",
        "items": {
          "swap_ball": 0,
          "rainbow_ball": 0,
          "blast_ball": 0,
          "barrier_hammer": 0
        }
      }
    }
  }
}
```

## 8. 新玩家初始资源

建议初始赠送：

```json
{
  "initialPlayerResources": {
    "coin": 300,
    "items": {
      "swap_ball": 1,
      "rainbow_ball": 1,
      "blast_ball": 0,
      "barrier_hammer": 0
    }
  }
}
```

设计目的：

- 给玩家体验换球和彩虹道具球
- 不一开始就赠送强破坏型道具

## 9. 配置文件建议

建议后续拆成这些配置文件：

- `daily_signin_config.json`
- `shop_config.json`
- `initial_player_resources.json`

如果首版想减少文件数量，也可以合并为：

- `economy_config.json`

## 10. 推荐模块拆分

### 10.1 SignInManager

职责：

- 判断今日是否可领取
- 领取签到奖励
- 推进签到周期
- 管理签到红点

### 10.2 CurrencyManager

职责：

- 查询金币
- 增加金币
- 扣除金币
- 记录金币变动

### 10.3 InventoryManager

职责：

- 查询道具数量
- 增加道具
- 消耗道具
- 管理局前携带状态

### 10.4 ShopManager

职责：

- 读取商品配置
- 检查金币
- 检查每日限购
- 执行购买

### 10.5 RewardService

职责：

- 统一发放奖励
- 分发到金币系统或背包系统
- 避免签到、关卡、商店各自写一套发奖逻辑

## 11. RewardService 奖励分发规则

推荐统一奖励结构：

```json
{
  "items": [
    { "id": "coin", "count": 100 },
    { "id": "swap_ball", "count": 1 }
  ]
}
```

分发规则：

- `id = coin`
  - 进入 `CurrencyManager`
- 其他 `id`
  - 进入 `InventoryManager`

## 12. 关键边界规则

### 12.1 签到重复领取

- 同一天不能重复领取
- 必须以 `lastClaimDate` 判断

### 12.2 金币不足

- 购买时若金币不足，不扣除任何资源
- UI 提示金币不足

### 12.3 背包数量不足

- 使用道具前必须检查数量
- 数量不足时不能进入使用状态

### 12.4 购买限购

- 每日购买次数达到上限后不能继续购买
- 日期变化后重置

### 12.5 局前携带但未使用

- 不扣除背包数量
- 只有真正使用时扣除

## 13. UI 设计建议

### 13.1 签到 UI

需要展示：

- 7 天奖励
- 今日可领
- 已领状态
- 领取按钮
- 第 7 天大奖强调

### 13.2 金币 UI

建议展示在：

- 主界面顶部
- 商店界面顶部
- 结算界面奖励区域

### 13.3 背包 UI

首版可不做完整背包页，只在这些地方显示：

- 局前道具选择
- 商店道具数量
- 签到奖励领取结果

### 13.4 商店 UI

每个商品显示：

- 图标
- 名称
- 当前持有数量
- 价格
- 今日剩余购买次数

## 14. 测试验收清单

### 14.1 签到

- 第一天可正常领取
- 同一天不能重复领取
- 跨天后可领取下一天
- 第七天领取后进入下一轮
- 漏签不重置进度

### 14.2 金币

- 增加金币正确
- 扣除金币正确
- 金币不足时购买失败
- 金币变动日志正确

### 14.3 背包

- 发放道具后数量增加
- 使用道具后数量减少
- 未携带道具不能使用
- 携带但未使用不扣除

### 14.4 商店

- 购买成功后金币减少、背包增加
- 每日限购生效
- 跨天后限购重置

## 15. 推荐实现顺序

建议实现顺序：

1. `InventoryManager`
2. `CurrencyManager`
3. `RewardService`
4. `SignInManager`
5. `ShopManager`
6. 局前道具携带

原因：

- 背包和金币是基础能力
- RewardService 可复用到签到和关卡结算
- 签到和商店都依赖前两者

## 16. 一句话结论

当前版本最稳的资源体系是：

- 签到负责周期奖励
- 金币负责购买能力
- 背包负责持有和消耗 4 种救场道具

这样可以自然承接高难关卡、连败保护和后续活动系统。
