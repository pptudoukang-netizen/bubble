"use strict";

module.exports = {
  enabled: true,
  activityId: "game_circle_welfare_v1",
  resetTime: "00:00",
  resetTimezone: "Asia/Shanghai",
  entry: {
    openlink: "",
    showRedDotWhenRewardClaimable: true
  },
  dataTypes: {
    joinTime: 1,
    todayLikePostCount: 4,
    todayPublishPostCount: 6
  },
  tasks: [
    {
      taskId: "join_game_circle",
      title: "加入游戏圈",
      description: "加入泡泡社区",
      metricType: "join_time",
      target: 1,
      resetMode: "once",
      sortOrder: 10,
      rewardItems: [
        { id: "coin", count: 120 }
      ]
    },
    {
      taskId: "like_posts_3_daily",
      title: "每日点赞3个帖子",
      description: "为喜欢的内容点赞",
      metricType: "today_like_post_count",
      target: 3,
      resetMode: "daily",
      sortOrder: 20,
      rewardItems: [
        { id: "coin", count: 100 }
      ]
    },
    {
      taskId: "publish_post_1_daily",
      title: "每日发表1个帖子",
      description: "分享你的游戏心得",
      metricType: "today_publish_post_count",
      target: 1,
      resetMode: "daily",
      sortOrder: 30,
      rewardItems: [
        { id: "swap_ball", count: 1 }
      ]
    }
  ]
};
