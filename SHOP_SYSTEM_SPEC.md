# 商城系统详细设计文档（V1）

更新时间：2026-04-24  
项目路径：`E:/cocos_project/bubble`

## 1. 文档目标

本文档定义当前项目的商城系统（Shop）设计与实现边界，目标是：

- 提供稳定、可扩展的金币消费入口
- 服务当前 4 种救场道具的获取
- 与现有金币系统、背包系统、签到系统无缝衔接

本文档可直接用于：

- 客户端程序开发
- 配置表制作
- UI 交互设计
- 测试用例设计

## 2. 首版范围（V1）

V1 只做以下能力：

- 货币：仅支持 `coin`
- 商品：仅售卖 4 种道具
- 购买：单次购买、可重复购买（受限购约束）
- 限购：按天限购（每日重置）
- 刷新：每日自动刷新限购状态，不做手动刷新

V1 不做：

- 付费货币（钻石、现金支付）
- 广告换购
- 动态折扣活动
- 多页签复杂商店（皮肤、礼包商城等）
- 服务端订单系统

## 3. 商品范围与命名

当前接入商品（与现有系统保持一致）：

- `swap_ball`：换球
- `rainbow_ball`：彩虹道具球
- `blast_ball`：炸裂道具球
- `barrier_hammer`：破障锤

说明：

- 不包含缸体吸附增强
- 不包含技能槽道具
- 不包含一键清屏类道具

## 4. 商城核心规则

## 4.1 货币与价格

- 货币类型固定：`coin`
- 价格由配置驱动，客户端不写死

## 4.2 购买与发放

- 购买成功后立即扣除金币
- 道具直接发放到背包
- 扣币与发放必须同事务完成

## 4.3 限购规则

- 每个商品可配置 `dailyLimit`
- 到达限制后按钮置灰并显示 `今日售罄`
- 每日按自然日 `00:00` 重置限购

## 4.4 重复购买

- 同一商品可重复购买，直到达到当日限购
- 达到当日限购前，按钮始终可点击

## 5. 数据结构设计

## 5.1 商品配置（`shop_goods_config.json`）

```json
{
  "version": 1,
  "goods": [
    {
      "skuId": "sku_swap_ball_01",
      "itemId": "swap_ball",
      "itemCount": 1,
      "price": {
        "currency": "coin",
        "amount": 100
      },
      "dailyLimit": 5,
      "enabled": true,
      "sortOrder": 10,
      "tags": ["recommended"]
    },
    {
      "skuId": "sku_rainbow_ball_01",
      "itemId": "rainbow_ball",
      "itemCount": 1,
      "price": {
        "currency": "coin",
        "amount": 200
      },
      "dailyLimit": 3,
      "enabled": true,
      "sortOrder": 20,
      "tags": []
    },
    {
      "skuId": "sku_blast_ball_01",
      "itemId": "blast_ball",
      "itemCount": 1,
      "price": {
        "currency": "coin",
        "amount": 300
      },
      "dailyLimit": 2,
      "enabled": true,
      "sortOrder": 30,
      "tags": ["hot"]
    },
    {
      "skuId": "sku_barrier_hammer_01",
      "itemId": "barrier_hammer",
      "itemCount": 1,
      "price": {
        "currency": "coin",
        "amount": 300
      },
      "dailyLimit": 2,
      "enabled": true,
      "sortOrder": 40,
      "tags": []
    }
  ]
}
```

## 5.2 商店运行配置（`shop_rules_config.json`）

```json
{
  "shopRules": {
    "resetTime": "00:00",
    "resetTimezone": "Asia/Shanghai",
    "showSoldOutItems": true,
    "defaultSort": "sortOrder_asc"
  }
}
```

## 5.3 玩家状态存档

```json
{
  "shopState": {
    "dailyPurchases": {
      "date": "2026-04-24",
      "skuCounts": {
        "sku_swap_ball_01": 1,
        "sku_rainbow_ball_01": 0,
        "sku_blast_ball_01": 0,
        "sku_barrier_hammer_01": 0
      }
    },
    "purchaseLogs": [
      {
        "orderId": "local_1713926400000_0001",
        "skuId": "sku_swap_ball_01",
        "itemId": "swap_ball",
        "itemCount": 1,
        "currency": "coin",
        "cost": 100,
        "timestamp": 1713926400000
      }
    ]
  }
}
```

## 6. 模块设计

## 6.1 ShopConfigService

职责：

- 加载 `shop_goods_config.json`
- 校验配置合法性
- 提供可售商品列表

核心接口：

- `loadShopGoods()`
- `getGoodsBySkuId(skuId)`
- `getSortedGoodsList()`

## 6.2 ShopStateService

职责：

- 管理每日购买计数
- 跨天重置
- 记录购买日志

核心接口：

- `ensureDailyReset(currentDate)`
- `getDailyPurchasedCount(skuId)`
- `increaseDailyPurchasedCount(skuId, delta)`
- `appendPurchaseLog(log)`

## 6.3 ShopPurchaseService

职责：

- 执行购买主流程
- 检查金币与限购
- 调用金币与背包服务完成事务

核心接口：

- `canPurchase(skuId)`
- `purchase(skuId)`

## 7. 购买事务流程

## 7.1 流程步骤

1. 接收 `skuId`
2. 校验商品存在且启用
3. 执行跨天重置检查
4. 校验每日限购
5. 校验金币余额
6. 生成本地订单号 `orderId`
7. 扣除金币
8. 发放道具到背包
9. 增加当日购买计数
10. 写购买日志
11. 返回购买成功结果

## 7.2 失败处理规则

- 任一步骤失败，终止流程并返回错误码
- 若扣币成功但发放失败，必须执行补偿回滚（加回金币）
- 严禁出现“扣币成功但未到账且无回滚”的状态

## 7.3 推荐错误码

- `SHOP_GOODS_NOT_FOUND`
- `SHOP_GOODS_DISABLED`
- `SHOP_DAILY_LIMIT_REACHED`
- `SHOP_COIN_NOT_ENOUGH`
- `SHOP_INVENTORY_ADD_FAILED`
- `SHOP_UNKNOWN_ERROR`

## 8. UI/交互设计

## 8.1 商城主界面布局

- 顶部：金币余额 + 返回按钮
- 中部：商品卡片列表（纵向或网格）
- 底部：提示文案（每日重置时间）

## 8.2 商品卡片信息

每张商品卡包含：

- 图标
- 名称
- 单次数量
- 价格（金币）
- 今日剩余次数
- 购买按钮
- 标签（可选：`推荐`、`热门`）

## 8.3 按钮状态

- 可购买：高亮按钮，显示 `购买`
- 金币不足：按钮置灰，显示 `金币不足`
- 达到限购：按钮置灰，显示 `今日售罄`

## 8.4 反馈表现

- 购买成功：弹出“获得道具 +1”、金币变化动画
- 购买失败：弹出明确错误提示

## 9. 与现有系统集成

## 9.1 金币系统集成

- 扣币只通过 `CurrencyManager.spendCoin(amount, reason)`
- `reason` 推荐固定为 `buy_powerup`

## 9.2 背包系统集成

- 发放只通过 `InventoryManager.addItem(itemId, count, reason)`
- `reason` 推荐固定为 `shop_purchase`

## 9.3 奖励分发服务

- 若项目已接入 `RewardService`，可统一走奖励发放
- 若暂未统一，则先直接走 `CurrencyManager + InventoryManager`

## 10. 平衡与数值建议

首版价格与限购建议（与现有文档保持一致）：

- `swap_ball`：100 金币，日限 5
- `rainbow_ball`：200 金币，日限 3
- `blast_ball`：300 金币，日限 2
- `barrier_hammer`：300 金币，日限 2

建议原则：

- 低阶修正道具更便宜、限购更高
- 高阶破局道具更贵、限购更低

## 11. 埋点与日志建议

推荐埋点事件：

- `shop_view_open`
- `shop_item_click`
- `shop_purchase_success`
- `shop_purchase_fail`

购买成功日志最少包含：

- `orderId`
- `skuId`
- `cost`
- `coinBefore`
- `coinAfter`
- `timestamp`

## 12. 测试验收清单

## 12.1 功能正确性

- 商品正常展示，排序正确
- 购买成功后金币正确减少、背包正确增加
- 每日限购生效
- 跨天后限购重置

## 12.2 异常与边界

- 金币不足无法购买
- 商品禁用无法购买
- 商品不存在返回正确错误码
- 扣币后发放失败可回滚

## 12.3 体验一致性

- 购买按钮状态与实际可购状态一致
- 购买成功与失败反馈清晰
- 商城重进后状态不丢失

## 13. 推荐开发顺序

1. 完成商品配置加载（`ShopConfigService`）
2. 完成状态存档与跨天重置（`ShopStateService`）
3. 完成购买流程（`ShopPurchaseService`）
4. 对接 UI 面板
5. 完成埋点与日志
6. 完成回归测试

## 14. 一句话结论

当前版本商城系统应以“金币购买 4 种救场道具 + 每日限购 + 稳定到账”为核心，先保证闭环稳定，再做活动化扩展。

