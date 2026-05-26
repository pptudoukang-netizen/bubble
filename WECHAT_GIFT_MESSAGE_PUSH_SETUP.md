# 微信礼包消息推送接入

## 1. 云函数

本项目新增云函数：

```text
cloudfunctions/messagePush
```

用于处理微信小游戏礼包发货推送：

```json
{
  "MsgType": "event",
  "Event": "comm_minigame",
  "MiniGame": {
    "OrderId": "r_123",
    "ToUserOpenid": "to_user_openid",
    "GiftId": "gift_id_xxx",
    "GoodsList": [
      { "Id": "stamina", "Num": 1 }
    ]
  }
}
```

处理成功后会写入云数据库集合：

```text
minigame_gift_deliveries
```

并返回：

```json
{ "ErrCode": 0, "ErrMsg": "Success" }
```

## 2. 微信后台配置

在微信开发者工具中进入：

```text
云开发 -> 设置 -> 其他设置 -> 消息推送
```

选择推送模式为云函数，云函数选择：

```text
messagePush
```

礼包发货事件使用：

```text
消息类型：event
事件类型：comm_minigame
```

## 3. 关键规则

- `OrderId` 用于幂等，同一个订单重复推送只记录一次。
- 只有 `comm_minigame` 或旧版 `minigame_deliver_goods` 携带完整 `MiniGame` 礼包字段时返回礼包发货成功结构。
- 调试事件 `debug_demo` 和文本客服消息返回 `success`。
- 未支持的消息类型会直接报错，避免错误配置被静默吞掉。

## 4. 后续

后台完成“消息推送能力”后，再配置“礼包能力”和体力道具礼包。拿到 `GiftId` 后，填入 `GameBootstrap.friendStaminaGiftId`。
