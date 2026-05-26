"use strict";

var ERROR_NOT_FOUND = "DAILY_TASK_NOT_FOUND";
var ERROR_DISABLED = "DAILY_TASK_DISABLED";
var ERROR_NOT_COMPLETED = "DAILY_TASK_NOT_COMPLETED";
var ERROR_ALREADY_CLAIMED = "DAILY_TASK_ALREADY_CLAIMED";

var TASK_REASONS = {
  clear_level_5: "daily_task_clear_level",
  spend_stamina_20: "daily_task_spend_stamina",
  use_rainbow_ball_2: "daily_task_use_rainbow_ball",
  use_barrier_hammer_1: "daily_task_use_barrier_hammer",
  gift_friend_stamina_3: "daily_task_gift_friend_stamina"
};

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(fieldName + " must be a non-empty string.");
  }
  return value;
}

function normalizeRewardItems(task) {
  if (!Array.isArray(task.rewardItems) || task.rewardItems.length === 0) {
    throw new Error("Daily task rewardItems are required: " + task.taskId);
  }
  return task.rewardItems.map(function (item, index) {
    assertObject(item, "Daily task reward item must be an object: " + task.taskId + ", " + index);
    return {
      id: requireString(item.id, "Daily task reward item id"),
      count: requirePositiveInteger(item.count, "Daily task reward item count")
    };
  });
}

function normalizeTaskConfig(task) {
  assertObject(task, "Daily task config entry must be an object.");
  var taskId = requireString(task.taskId, "Daily task taskId");
  var type = requireString(task.type, "Daily task type");
  var normalized = {
    taskId: taskId,
    title: requireString(task.title, "Daily task title"),
    description: requireString(task.description, "Daily task description"),
    type: type,
    target: requirePositiveInteger(task.target, "Daily task target"),
    sortOrder: requireNonNegativeInteger(task.sortOrder, "Daily task sortOrder"),
    enabled: task.enabled === true,
    iconPath: requireString(task.iconPath, "Daily task iconPath"),
    rewardItems: normalizeRewardItems(task)
  };
  if (type === "use_powerup") {
    normalized.requiredItemId = requireString(task.requiredItemId, "Daily task requiredItemId");
  }
  if (!TASK_REASONS[taskId]) {
    throw new Error("Daily task reason missing for taskId: " + taskId);
  }
  return normalized;
}

function normalizeConfig(config) {
  assertObject(config, "DailyTaskService config is required.");
  if (config.resetTime !== "00:00") {
    throw new Error("Daily task resetTime must be 00:00.");
  }
  if (config.resetTimezone !== "Asia/Shanghai") {
    throw new Error("Daily task resetTimezone must be Asia/Shanghai.");
  }
  if (!Array.isArray(config.tasks) || config.tasks.length === 0) {
    throw new Error("Daily task config tasks must be a non-empty array.");
  }
  assertObject(config.progressRules, "Daily task progressRules are required.");
  requirePositiveInteger(config.progressRules.maxProgressPerTaskPerEvent, "Daily task maxProgressPerTaskPerEvent");
  if (config.progressRules.clampProgressToTarget !== true) {
    throw new Error("Daily task clampProgressToTarget must be true.");
  }

  var seen = {};
  var tasks = config.tasks.map(normalizeTaskConfig).sort(function (left, right) {
    return left.sortOrder - right.sortOrder;
  });
  tasks.forEach(function (task) {
    if (seen[task.taskId]) {
      throw new Error("Duplicated daily taskId: " + task.taskId);
    }
    seen[task.taskId] = true;
  });

  return {
    resetTime: config.resetTime,
    resetTimezone: config.resetTimezone,
    tasks: tasks,
    progressRules: {
      maxProgressPerTaskPerEvent: config.progressRules.maxProgressPerTaskPerEvent,
      clampProgressToTarget: true
    }
  };
}

function createEmptyTaskState() {
  return {
    progress: 0,
    claimed: false,
    completedAt: 0,
    claimedAt: 0
  };
}

function normalizeNow(now) {
  var value = now === undefined ? new Date() : now;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Daily task operation date must be valid.");
  }
  return value;
}

function findTask(tasks, taskId) {
  for (var i = 0; i < tasks.length; i += 1) {
    if (tasks[i].taskId === taskId) {
      return tasks[i];
    }
  }
  return null;
}

function buildPayloadForTelemetry(task, taskState, dayKey) {
  return {
    task_id: task.taskId,
    task_type: task.type,
    progress: taskState.progress,
    target: task.target,
    reward_items: task.rewardItems,
    reason: TASK_REASONS[task.taskId],
    day_key: dayKey
  };
}

function DailyTaskService(options) {
  assertObject(options, "DailyTaskService options are required.");
  if (!options.store || typeof options.store.load !== "function" || typeof options.store.save !== "function") {
    throw new Error("DailyTaskService requires DailyTaskStore.");
  }
  if (!options.rewardService || typeof options.rewardService.grantRewardItems !== "function") {
    throw new Error("DailyTaskService requires DailyTaskRewardService.");
  }
  this.config = normalizeConfig(options.config);
  this.store = options.store;
  this.rewardService = options.rewardService;
  if (!options.telemetry || typeof options.telemetry.track !== "function") {
    throw new Error("DailyTaskService requires telemetry.track.");
  }
  this.telemetry = options.telemetry;
}

DailyTaskService.prototype._track = function (eventName, payload) {
  this.telemetry.track(eventName, payload);
};

DailyTaskService.prototype._loadState = function (now) {
  var state = this.store.load(normalizeNow(now));
  var changed = false;
  this.config.tasks.forEach(function (task) {
    if (task.enabled !== true) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(state.tasks, task.taskId)) {
      state.tasks[task.taskId] = createEmptyTaskState();
      changed = true;
    }
  });
  if (changed) {
    this.store.save(state);
  }
  return state;
};

DailyTaskService.prototype._getEnabledTask = function (taskId) {
  var task = findTask(this.config.tasks, taskId);
  if (!task) {
    throw new Error(ERROR_NOT_FOUND);
  }
  if (task.enabled !== true) {
    throw new Error(ERROR_DISABLED);
  }
  return task;
};

DailyTaskService.prototype.getTaskList = function (now) {
  var state = this._loadState(now);
  return this.config.tasks.filter(function (task) {
    return task.enabled === true;
  }).map(function (task) {
    var taskState = state.tasks[task.taskId];
    if (!taskState) {
      throw new Error("Daily task state missing after initialization: " + task.taskId);
    }
    return {
      taskId: task.taskId,
      title: task.title,
      description: task.description,
      type: task.type,
      target: task.target,
      progress: taskState.progress,
      claimed: taskState.claimed,
      completedAt: taskState.completedAt,
      claimedAt: taskState.claimedAt,
      claimable: taskState.progress >= task.target && taskState.claimed === false,
      iconPath: task.iconPath,
      rewardItems: clone(task.rewardItems)
    };
  });
};

DailyTaskService.prototype.hasClaimableTask = function (now) {
  return this.getTaskList(now).some(function (task) {
    return task.claimable === true;
  });
};

DailyTaskService.prototype.canClaim = function (taskId, now) {
  this._getEnabledTask(taskId);
  var taskList = this.getTaskList(now);
  var task = findTask(taskList, taskId);
  if (!task) {
    throw new Error(ERROR_NOT_FOUND);
  }
  return task.claimable === true;
};

DailyTaskService.prototype._resolveEventAmount = function (task, eventType, payload) {
  if (task.type !== eventType) {
    return 0;
  }
  assertObject(payload, "Daily task event payload is required.");
  if (eventType === "clear_level") {
    requirePositiveInteger(payload.levelId, "Daily task levelId");
    return 1;
  }
  if (eventType === "spend_stamina") {
    return requirePositiveInteger(payload.amount, "Daily task stamina amount");
  }
  if (eventType === "use_powerup") {
    var itemId = requireString(payload.itemId, "Daily task powerup itemId");
    return itemId === task.requiredItemId ? 1 : 0;
  }
  if (eventType === "gift_friend_stamina") {
    requireString(payload.friendId, "Daily task friendId");
    requirePositiveInteger(payload.amount, "Daily task friend stamina amount");
    return 1;
  }
  throw new Error("Unsupported daily task event type: " + eventType);
};

DailyTaskService.prototype.recordEvent = function (eventType, payload, now) {
  requireString(eventType, "Daily task eventType");
  var safeNow = normalizeNow(now);
  var state = this._loadState(safeNow);
  var changed = false;
  var changedTasks = [];

  this.config.tasks.forEach(function (task) {
    if (task.enabled !== true) {
      return;
    }
    var amount = this._resolveEventAmount(task, eventType, payload);
    if (amount <= 0) {
      return;
    }
    var maxPerEvent = this.config.progressRules.maxProgressPerTaskPerEvent;
    if (amount > maxPerEvent) {
      throw new Error("Daily task event amount exceeds maxProgressPerTaskPerEvent: " + task.taskId);
    }
    var taskState = state.tasks[task.taskId];
    if (!taskState) {
      throw new Error("Daily task state missing before event: " + task.taskId);
    }
    if (taskState.claimed === true || taskState.progress >= task.target) {
      return;
    }
    var nextProgress = taskState.progress + amount;
    if (nextProgress > task.target) {
      nextProgress = task.target;
    }
    if (nextProgress === taskState.progress) {
      return;
    }
    taskState.progress = nextProgress;
    if (taskState.progress >= task.target && taskState.completedAt === 0) {
      taskState.completedAt = safeNow.getTime();
      this._track("daily_task_complete", buildPayloadForTelemetry(task, taskState, state.dayKey));
    }
    changed = true;
    changedTasks.push(task.taskId);
    var telemetryPayload = buildPayloadForTelemetry(task, taskState, state.dayKey);
    telemetryPayload.event_amount = amount;
    if (typeof payload.itemId === "string") {
      telemetryPayload.item_id = payload.itemId;
    }
    this._track("daily_task_progress", telemetryPayload);
  }, this);

  if (changed) {
    this.store.save(state);
  }

  return {
    accepted: changed,
    taskIds: changedTasks,
    state: clone(state)
  };
};

DailyTaskService.prototype.claimReward = function (taskId, now) {
  var safeNow = normalizeNow(now);
  var task = this._getEnabledTask(taskId);
  var state = this._loadState(safeNow);
  var taskState = state.tasks[taskId];
  if (!taskState) {
    throw new Error(ERROR_NOT_FOUND);
  }
  if (taskState.progress < task.target) {
    throw new Error(ERROR_NOT_COMPLETED);
  }
  if (taskState.claimed === true) {
    throw new Error(ERROR_ALREADY_CLAIMED);
  }

  var grantResult = this.rewardService.grantRewardItems(task.rewardItems, TASK_REASONS[task.taskId]);
  taskState.claimed = true;
  taskState.claimedAt = safeNow.getTime();
  state.claimLogs.push({
    taskId: taskId,
    claimedAt: taskState.claimedAt
  });
  this.store.save(state);
  this._track("daily_task_claim_success", buildPayloadForTelemetry(task, taskState, state.dayKey));

  return {
    accepted: true,
    taskId: taskId,
    rewardItems: clone(task.rewardItems),
    grantResult: grantResult,
    state: clone(state)
  };
};

module.exports = DailyTaskService;
