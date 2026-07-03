"use strict";

var SUPPORTED_REWARD_IDS = ["coin", "stamina", "precise_aim", "swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer", "snow_removal"];
var SUPPORTED_METRIC_TYPES = ["join_time", "today_like_post_count", "today_publish_post_count"];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function stringifyForError(data) {
  var text = JSON.stringify(data);
  if (text.length > 600) {
    return text.slice(0, 600);
  }
  return text;
}

function requirePositiveInteger(value, fieldName) {
  var parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed !== Number(value)) {
    throw new Error("Game circle welfare `" + fieldName + "` must be a positive integer.");
  }
  return parsed;
}

function requireNonNegativeInteger(value, fieldName) {
  var parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed !== Number(value)) {
    throw new Error("Game circle welfare `" + fieldName + "` must be a non-negative integer.");
  }
  return parsed;
}

function validateRewardItems(items, taskId) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Game circle welfare task `" + taskId + "` requires non-empty rewardItems.");
  }
  return items.map(function (item, index) {
    if (!item || typeof item !== "object") {
      throw new Error("Invalid reward item at " + taskId + "[" + index + "].");
    }
    if (SUPPORTED_REWARD_IDS.indexOf(item.id) < 0) {
      throw new Error("Unsupported reward id `" + item.id + "` in game circle welfare task `" + taskId + "`.");
    }
    return {
      id: item.id,
      count: requirePositiveInteger(item.count, taskId + ".rewardItems[" + index + "].count")
    };
  });
}

function normalizeTask(rawTask, index) {
  if (!rawTask || typeof rawTask !== "object") {
    throw new Error("Game circle welfare task at index " + index + " must be an object.");
  }
  if (typeof rawTask.taskId !== "string" || !rawTask.taskId) {
    throw new Error("Game circle welfare task at index " + index + " requires taskId.");
  }
  if (typeof rawTask.title !== "string" || !rawTask.title) {
    throw new Error("Game circle welfare task `" + rawTask.taskId + "` requires title.");
  }
  if (typeof rawTask.description !== "string" || !rawTask.description) {
    throw new Error("Game circle welfare task `" + rawTask.taskId + "` requires description.");
  }
  if (SUPPORTED_METRIC_TYPES.indexOf(rawTask.metricType) < 0) {
    throw new Error("Unsupported game circle welfare metricType: " + rawTask.metricType);
  }
  if (rawTask.resetMode !== "once" && rawTask.resetMode !== "daily") {
    throw new Error("Unsupported game circle welfare resetMode: " + rawTask.resetMode);
  }
  return {
    taskId: rawTask.taskId,
    title: rawTask.title,
    description: rawTask.description,
    metricType: rawTask.metricType,
    target: requirePositiveInteger(rawTask.target, rawTask.taskId + ".target"),
    resetMode: rawTask.resetMode,
    sortOrder: requireNonNegativeInteger(rawTask.sortOrder, rawTask.taskId + ".sortOrder"),
    rewardItems: validateRewardItems(rawTask.rewardItems, rawTask.taskId)
  };
}

function normalizeConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Game circle welfare config is required.");
  }
  if (config.enabled !== true) {
    throw new Error("Game circle welfare config must be explicitly enabled.");
  }
  if (typeof config.activityId !== "string" || !config.activityId) {
    throw new Error("Game circle welfare activityId is required.");
  }
  if (!config.dataTypes || typeof config.dataTypes !== "object") {
    throw new Error("Game circle welfare dataTypes config is required.");
  }
  var dataTypes = {
    joinTime: requirePositiveInteger(config.dataTypes.joinTime, "dataTypes.joinTime"),
    todayLikePostCount: requirePositiveInteger(config.dataTypes.todayLikePostCount, "dataTypes.todayLikePostCount"),
    todayPublishPostCount: requirePositiveInteger(config.dataTypes.todayPublishPostCount, "dataTypes.todayPublishPostCount")
  };
  if (!config.entry || typeof config.entry !== "object" || Array.isArray(config.entry)) {
    throw new Error("Game circle welfare entry config is required.");
  }
  if (!Array.isArray(config.tasks) || config.tasks.length !== 3) {
    throw new Error("Game circle welfare config must contain exactly 3 tasks.");
  }
  var taskIds = {};
  var tasks = config.tasks.map(normalizeTask).sort(function (a, b) {
    return a.sortOrder - b.sortOrder;
  });
  tasks.forEach(function (task) {
    if (taskIds[task.taskId]) {
      throw new Error("Duplicate game circle welfare taskId: " + task.taskId);
    }
    taskIds[task.taskId] = true;
  });
  return {
    enabled: true,
    activityId: config.activityId,
    entry: clone(config.entry),
    dataTypes: dataTypes,
    tasks: tasks
  };
}

function resolveType(dataType) {
  if (typeof dataType === "number") {
    return dataType;
  }
  if (dataType && typeof dataType === "object") {
    return requirePositiveInteger(dataType.type, "dataList.dataType.type");
  }
  throw new Error("Game circle dataList item has invalid dataType.");
}

function parseGameClubDataListText(text) {
  if (typeof text !== "string" || !text) {
    throw new Error("Game circle dataList text must be a non-empty string.");
  }
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Game circle dataList text JSON parse failed: " + (error && error.message ? error.message : String(error)));
  }
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.dataList)) {
    return parsed.dataList;
  }
  throw new Error("Game circle dataList text does not contain dataList array.");
}

function resolveDataPayload(response) {
  if (response && typeof response === "object" && response.data && typeof response.data === "object") {
    return response.data;
  }
  return response;
}

function resolveDataList(response) {
  if (!response || typeof response !== "object") {
    throw new Error("Game circle platform response must be an object.");
  }
  if (Array.isArray(response.dataList)) {
    return response.dataList;
  }
  var payload = resolveDataPayload(response);
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.dataList)) {
      return payload.dataList;
    }
    if (typeof payload.dataList === "string") {
      return parseGameClubDataListText(payload.dataList);
    }
    if (payload.encryptedData || payload.cloudID) {
      throw new Error("GAME_CIRCLE_ENCRYPTED_DATA_REQUIRES_DECRYPTION");
    }
  }
  if (Array.isArray(response)) {
    return response;
  }
  throw new Error("Game circle platform response missing dataList.");
}

function GameCircleWelfareService(options) {
  options = options || {};
  this.config = normalizeConfig(options.config);
  this.store = options.store || null;
  this.rewardService = options.rewardService || null;
  this.platformClient = options.platformClient || null;
  this.telemetry = options.telemetry || null;
  if (!this.store) {
    throw new Error("GameCircleWelfareService requires store.");
  }
  if (!this.rewardService || typeof this.rewardService.grantRewardItems !== "function") {
    throw new Error("GameCircleWelfareService requires rewardService.");
  }
  if (!this.platformClient || typeof this.platformClient.getGameClubData !== "function") {
    throw new Error("GameCircleWelfareService requires platformClient.");
  }
}

GameCircleWelfareService.prototype._track = function (eventName, payload) {
  if (this.telemetry && typeof this.telemetry.track === "function") {
    this.telemetry.track(eventName, payload);
  }
};

GameCircleWelfareService.prototype.getDataTypeList = function () {
  return [
    { type: this.config.dataTypes.joinTime },
    { type: this.config.dataTypes.todayLikePostCount },
    { type: this.config.dataTypes.todayPublishPostCount }
  ];
};

GameCircleWelfareService.prototype.parsePlatformMetrics = function (response) {
  var dataList;
  try {
    dataList = resolveDataList(response);
  } catch (error) {
    throw new Error((error && error.message ? error.message : String(error)) + "; response=" + stringifyForError(response));
  }
  var valuesByType = {};
  try {
    dataList.forEach(function (item, index) {
      if (!item || typeof item !== "object") {
        throw new Error("Game circle dataList item at index " + index + " must be an object.");
      }
      var type = resolveType(item.dataType);
      valuesByType[type] = requireNonNegativeInteger(item.value, "dataList[" + index + "].value");
    });
  } catch (error) {
    throw new Error((error && error.message ? error.message : String(error)) + "; dataList=" + stringifyForError(dataList));
  }

  var joinType = this.config.dataTypes.joinTime;
  var likeType = this.config.dataTypes.todayLikePostCount;
  var publishType = this.config.dataTypes.todayPublishPostCount;
  if (!Object.prototype.hasOwnProperty.call(valuesByType, joinType)) {
    throw new Error("Game circle data missing join time metric; dataList=" + stringifyForError(dataList));
  }
  if (!Object.prototype.hasOwnProperty.call(valuesByType, likeType)) {
    throw new Error("Game circle data missing like count metric; dataList=" + stringifyForError(dataList));
  }
  if (!Object.prototype.hasOwnProperty.call(valuesByType, publishType)) {
    throw new Error("Game circle data missing publish count metric; dataList=" + stringifyForError(dataList));
  }

  return {
    joinTime: valuesByType[joinType],
    todayLikePostCount: valuesByType[likeType],
    todayPublishPostCount: valuesByType[publishType]
  };
};

GameCircleWelfareService.prototype.refreshMetrics = function (now) {
  var timestamp = now || new Date();
  this._track("game_circle_data_refresh_start", {
    activity_id: this.config.activityId
  });
  return this.platformClient.getGameClubData(this.getDataTypeList()).then(function (response) {
    var metrics = this.parsePlatformMetrics(response);
    var state = this.store.load(timestamp);
    state = this.store.markRefreshed(state, metrics, timestamp);
    this.store.save(state);
    this._track("game_circle_data_refresh_success", {
      activity_id: this.config.activityId,
      join_time: metrics.joinTime,
      today_like_post_count: metrics.todayLikePostCount,
      today_publish_post_count: metrics.todayPublishPostCount
    });
    return this.getSummary(timestamp);
  }.bind(this)).catch(function (error) {
    this._track("game_circle_data_refresh_fail", {
      activity_id: this.config.activityId,
      reason: error && error.message ? error.message : String(error)
    });
    throw error;
  }.bind(this));
};

GameCircleWelfareService.prototype._resolveProgress = function (task, metrics) {
  if (task.metricType === "join_time") {
    return metrics.joinTime > 0 ? 1 : 0;
  }
  if (task.metricType === "today_like_post_count") {
    return metrics.todayLikePostCount;
  }
  if (task.metricType === "today_publish_post_count") {
    return metrics.todayPublishPostCount;
  }
  throw new Error("Unsupported game circle welfare metricType: " + task.metricType);
};

GameCircleWelfareService.prototype.getSummary = function (now) {
  var timestamp = now || new Date();
  var state = this.store.load(timestamp);
  var todayKey = this.store.getTodayKey(timestamp);
  var refreshedToday = state.lastRefreshDate === todayKey && state.lastRefreshAt > 0;
  var tasks = this.config.tasks.map(function (task) {
    var progress = Math.min(task.target, this._resolveProgress(task, state.metrics));
    var claimed = this.store.isTaskClaimed(state, task, timestamp);
    var complete = refreshedToday && progress >= task.target;
    return {
      taskId: task.taskId,
      title: task.title,
      description: task.description,
      metricType: task.metricType,
      target: task.target,
      progress: progress,
      refreshedToday: refreshedToday,
      complete: complete,
      claimed: claimed,
      claimable: complete && !claimed,
      rewardItems: clone(task.rewardItems)
    };
  }, this);

  return {
    activityId: this.config.activityId,
    refreshedToday: refreshedToday,
    lastRefreshAt: state.lastRefreshAt,
    metrics: clone(state.metrics),
    tasks: tasks,
    hasClaimableReward: tasks.some(function (task) {
      return task.claimable;
    })
  };
};

GameCircleWelfareService.prototype._findTask = function (taskId) {
  for (var i = 0; i < this.config.tasks.length; i += 1) {
    if (this.config.tasks[i].taskId === taskId) {
      return this.config.tasks[i];
    }
  }
  throw new Error("Unknown game circle welfare taskId: " + taskId);
};

GameCircleWelfareService.prototype.claimTask = function (taskId, now) {
  var timestamp = now || new Date();
  var task = this._findTask(taskId);
  var summary = this.getSummary(timestamp);
  var taskSummary = null;
  for (var i = 0; i < summary.tasks.length; i += 1) {
    if (summary.tasks[i].taskId === taskId) {
      taskSummary = summary.tasks[i];
      break;
    }
  }
  if (!taskSummary) {
    throw new Error("Game circle welfare summary missing task: " + taskId);
  }
  if (!taskSummary.refreshedToday) {
    throw new Error("GAME_CIRCLE_DATA_NOT_REFRESHED");
  }
  if (taskSummary.claimed) {
    throw new Error("GAME_CIRCLE_TASK_ALREADY_CLAIMED");
  }
  if (!taskSummary.complete) {
    throw new Error("GAME_CIRCLE_TASK_NOT_COMPLETE");
  }

  var grantResult = this.rewardService.grantRewardItems(task.rewardItems);
  if (!grantResult || !grantResult.accepted) {
    throw new Error(grantResult && grantResult.reason ? grantResult.reason : "GAME_CIRCLE_REWARD_GRANT_FAILED");
  }

  var state = this.store.load(timestamp);
  if (this.store.isTaskClaimed(state, task, timestamp)) {
    throw new Error("GAME_CIRCLE_TASK_ALREADY_CLAIMED");
  }
  state = this.store.markTaskClaimed(state, task, timestamp);
  this.store.save(state);
  this._track("game_circle_reward_claim_success", {
    activity_id: this.config.activityId,
    task_id: taskId,
    reward_items: clone(grantResult.rewardItems)
  });
  return {
    accepted: true,
    taskId: taskId,
    rewardItems: clone(grantResult.rewardItems),
    summary: this.getSummary(timestamp)
  };
};

module.exports = GameCircleWelfareService;
