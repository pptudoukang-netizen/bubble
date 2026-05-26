# 自研好友体力赠送接入

## 云数据库

创建集合：

```text
friend_stamina_gifts
```

## 云函数

部署以下云函数，并选择“云端安装依赖”：

```text
createSelfManagedFriendStaminaGift
claimFriendStaminaGift
```

`createSelfManagedFriendStaminaGift` 创建待领取体力礼物记录。

`claimFriendStaminaGift` 根据分享参数中的 `friendGiftId` 领取体力，领取成功后返回体力数量。

## 客户端流程

赠送方：

1. 每日任务点击“赠送好友体力”。
2. 本地扣除 1 点体力。
3. 调用 `createSelfManagedFriendStaminaGift` 创建礼物记录。
4. 普通分享携带：

```text
friendGiftType=stamina&friendGiftId=<giftRecordId>
```

5. 分享返回成功后推进每日任务进度。
6. 云函数或分享失败时回滚本次扣除的 1 点体力。

领取方：

1. 从分享卡片进入游戏。
2. 启动或回到前台时读取进入参数。
3. 调用 `claimFriendStaminaGift`。
4. 领取成功后本地体力 +1。

## 规则

- 发送者不能领取自己创建的礼物。
- 同一份礼物只能被领取一次。
- 重复进入已领取链接不会重复增加体力。
- 该方案不依赖微信后台礼包能力，也不需要官方 `giftId`。
