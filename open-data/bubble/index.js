"use strict";

var MAX_PASS_LEVEL_KEY = "max_pass_level";
var TOTAL_SCORE_KEY = "total_score";
var CANVAS_WIDTH = 720;
var CANVAS_HEIGHT = 1280;
var RANK_MESSAGE_SOURCE = "bubble_friend_rank";
var ROW_HEIGHT = 126;
var ROW_GAP = 12;
var ROW_LEFT = 76;
var ROW_WIDTH = 568;
var ROW_TOP = 382;
var MAX_VISIBLE_ROWS = 6;
var ROW_STRIDE = ROW_HEIGHT + ROW_GAP;

if (typeof wx === "undefined" || !wx) {
  throw new Error("Open data rank renderer requires wx.");
}

var sharedCanvas = wx.getSharedCanvas();
if (!sharedCanvas) {
  throw new Error("Open data rank renderer requires sharedCanvas.");
}
sharedCanvas.width = CANVAS_WIDTH;
sharedCanvas.height = CANVAS_HEIGHT;

var context = sharedCanvas.getContext("2d");
if (!context) {
  throw new Error("Open data rank renderer requires 2d context.");
}

var currentRankType = "progress";
var currentEntries = [];
var currentScrollOffset = 0;

function drawRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius, color) {
  drawRoundRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, width, height, radius, color, lineWidth) {
  drawRoundRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function clearCanvas() {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawShell(activeType) {
  clearCanvas();

  fillRoundRect(context, 44, 148, 632, 962, 34, "#6b42c9");
  strokeRoundRect(context, 44, 148, 632, 962, 34, "#ffe187", 6);
  fillRoundRect(context, 68, 178, 584, 898, 26, "#8f62e5");
  fillRoundRect(context, 104, 212, 512, 76, 38, "#fff1a8");
  context.fillStyle = "#7a3fd4";
  context.font = "bold 38px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("好友排行榜", 360, 250);

  context.fillStyle = "#fff1a8";
  context.beginPath();
  context.arc(638, 206, 31, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#7a3fd4";
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(626, 194);
  context.lineTo(650, 218);
  context.moveTo(650, 194);
  context.lineTo(626, 218);
  context.stroke();

  drawTab(170, 310, 210, 68, "关卡排行", activeType === "progress");
  drawTab(400, 310, 210, 68, "总分排行", activeType === "total");
}

function drawTab(x, y, width, height, text, active) {
  fillRoundRect(context, x, y, width, height, 28, active ? "#ffdf5c" : "#7048c4");
  strokeRoundRect(context, x, y, width, height, 28, active ? "#fff5bb" : "#a989ef", 4);
  context.fillStyle = active ? "#7c3f2f" : "#eadfff";
  context.font = "bold 28px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x + width / 2, y + height / 2 + 1);
}

function drawLoading(activeType) {
  drawShell(activeType);
  context.fillStyle = "#fff7d6";
  context.font = "30px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("好友数据读取中...", 360, 648);
}

function drawEmpty(activeType, text) {
  drawShell(activeType);
  context.fillStyle = "#fff7d6";
  context.font = "30px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 360, 648);
}

function findKeyValue(kvDataList, key) {
  if (!Array.isArray(kvDataList)) {
    throw new Error("Friend rank KVDataList must be an array.");
  }
  for (var index = 0; index < kvDataList.length; index += 1) {
    var item = kvDataList[index];
    if (item && item.key === key) {
      return item.value;
    }
  }
  return null;
}

function parseRankValue(value, key) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !value) {
    throw new Error("Friend rank value is invalid for key: " + key + ".");
  }
  var parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Friend rank JSON is invalid for key: " + key + ".");
  }
  return parsed;
}

function toRequiredInteger(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error("Friend rank field must be numeric: " + fieldName + ".");
  }
  var integerValue = Math.floor(numberValue);
  if (integerValue < 0) {
    throw new Error("Friend rank field must be non-negative: " + fieldName + ".");
  }
  return integerValue;
}

function buildProgressEntry(user, rankValue) {
  return {
    nickname: String(user.nickname),
    avatarUrl: String(user.avatarUrl),
    primary: toRequiredInteger(rankValue.maxPassedLevel, "maxPassedLevel"),
    secondary: toRequiredInteger(rankValue.totalScoreSnapshot, "totalScoreSnapshot"),
    updatedAt: toRequiredInteger(rankValue.updatedAt, "updatedAt")
  };
}

function buildTotalEntry(user, rankValue) {
  return {
    nickname: String(user.nickname),
    avatarUrl: String(user.avatarUrl),
    primary: toRequiredInteger(rankValue.score, "score"),
    secondary: toRequiredInteger(rankValue.passedLevel, "passedLevel"),
    updatedAt: toRequiredInteger(rankValue.updatedAt, "updatedAt")
  };
}

function buildEntries(friendData, rankType) {
  if (!Array.isArray(friendData)) {
    throw new Error("Friend rank data must be an array.");
  }
  var key = rankType === "total" ? TOTAL_SCORE_KEY : MAX_PASS_LEVEL_KEY;
  var entries = [];
  for (var index = 0; index < friendData.length; index += 1) {
    var user = friendData[index];
    if (!user || typeof user !== "object") {
      throw new Error("Friend rank user item is invalid.");
    }
    if (typeof user.nickname !== "string") {
      throw new Error("Friend rank user nickname is required.");
    }
    if (typeof user.avatarUrl !== "string") {
      throw new Error("Friend rank user avatarUrl is required.");
    }
    var rankValue = parseRankValue(findKeyValue(user.KVDataList, key), key);
    if (rankValue !== null) {
      entries.push(rankType === "total" ? buildTotalEntry(user, rankValue) : buildProgressEntry(user, rankValue));
    }
  }
  entries.sort(function (left, right) {
    if (right.primary !== left.primary) {
      return right.primary - left.primary;
    }
    if (right.secondary !== left.secondary) {
      return right.secondary - left.secondary;
    }
    return left.updatedAt - right.updatedAt;
  });
  for (var rankIndex = 0; rankIndex < entries.length; rankIndex += 1) {
    entries[rankIndex].rank = rankIndex + 1;
  }
  return entries;
}

function drawAvatar(entry, x, y) {
  context.fillStyle = "#ffeaa8";
  context.beginPath();
  context.arc(x, y, 38, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#7c4acb";
  context.font = "bold 28px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(entry.nickname.charAt(0), x, y + 1);
}

function drawRankBadge(rank, x, y) {
  var colors = ["#ffd85c", "#d8ecff", "#ffc287"];
  var color = rank <= 3 ? colors[rank - 1] : "#efe4ff";
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, 30, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#7440bc";
  context.font = "bold 26px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(rank), x, y + 1);
}

function drawRow(entry, index, rankType) {
  var y = ROW_TOP + index * (ROW_HEIGHT + ROW_GAP);
  var palette = index === 0 ? "#7f56df" : index === 1 ? "#7650d0" : "#6d49c4";
  fillRoundRect(context, ROW_LEFT, y, ROW_WIDTH, ROW_HEIGHT, 22, palette);
  strokeRoundRect(context, ROW_LEFT, y, ROW_WIDTH, ROW_HEIGHT, 22, "rgba(255, 236, 160, 0.46)", 3);
  drawRankBadge(entry.rank, ROW_LEFT + 48, y + ROW_HEIGHT / 2);
  drawAvatar(entry, ROW_LEFT + 114, y + ROW_HEIGHT / 2);

  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.font = "bold 28px sans-serif";
  var nickname = entry.nickname.length > 8 ? entry.nickname.slice(0, 8) : entry.nickname;
  context.fillText(nickname, ROW_LEFT + 168, y + 45);
  context.font = "24px sans-serif";
  context.fillStyle = "#eadfff";
  var subText = rankType === "total" ? "最高 " + entry.secondary + " 关" : "总分 " + entry.secondary;
  context.fillText(subText, ROW_LEFT + 168, y + 84);

  context.textAlign = "right";
  context.fillStyle = "#fff196";
  context.font = "bold 34px sans-serif";
  var primaryText = rankType === "total" ? String(entry.primary) : entry.primary + "关";
  context.fillText(primaryText, ROW_LEFT + ROW_WIDTH - 28, y + ROW_HEIGHT / 2 + 2);
}

function drawEntries(entries, rankType) {
  drawShell(rankType);
  if (entries.length === 0) {
    drawEmpty(rankType, "暂无好友排行数据");
    return;
  }
  var maxOffset = Math.max(0, (entries.length * ROW_STRIDE) - (MAX_VISIBLE_ROWS * ROW_STRIDE));
  if (currentScrollOffset > maxOffset) {
    currentScrollOffset = maxOffset;
  }
  context.save();
  context.beginPath();
  context.rect(ROW_LEFT - 8, ROW_TOP - 8, ROW_WIDTH + 16, (MAX_VISIBLE_ROWS * ROW_STRIDE) + 8);
  context.clip();
  var firstIndex = Math.floor(currentScrollOffset / ROW_STRIDE);
  var offsetInRow = currentScrollOffset - firstIndex * ROW_STRIDE;
  var drawCount = MAX_VISIBLE_ROWS + 1;
  for (var index = 0; index < drawCount; index += 1) {
    var entryIndex = firstIndex + index;
    if (entryIndex < entries.length) {
      context.save();
      context.translate(0, -offsetInRow);
      drawRow(entries[entryIndex], index, rankType);
      context.restore();
    }
  }
  context.restore();
}

function requestRank(rankType) {
  currentRankType = rankType;
  currentScrollOffset = 0;
  drawLoading(rankType);
  var key = rankType === "total" ? TOTAL_SCORE_KEY : MAX_PASS_LEVEL_KEY;
  wx.getFriendCloudStorage({
    keyList: [key],
    success: function (result) {
      if (!result || !Array.isArray(result.data)) {
        throw new Error("wx.getFriendCloudStorage returned invalid data.");
      }
      currentEntries = buildEntries(result.data, rankType);
      drawEntries(currentEntries, rankType);
    },
    fail: function (error) {
      drawEmpty(rankType, "网络异常，无法读取好友数据");
      throw new Error("wx.getFriendCloudStorage failed: " + JSON.stringify(error));
    }
  });
}

function hideRank() {
  clearCanvas();
}

function scrollRank(deltaY) {
  var numberValue = Number(deltaY);
  if (!Number.isFinite(numberValue)) {
    throw new Error("Rank scroll deltaY must be numeric.");
  }
  var maxOffset = Math.max(0, (currentEntries.length * ROW_STRIDE) - (MAX_VISIBLE_ROWS * ROW_STRIDE));
  currentScrollOffset = Math.max(0, Math.min(maxOffset, currentScrollOffset + numberValue));
  drawEntries(currentEntries, currentRankType);
}

function isRankMessageType(type) {
  return (
    type === "show_progress_rank" ||
    type === "show_total_rank" ||
    type === "hide_rank" ||
    type === "scroll_rank"
  );
}

wx.onMessage(function (message) {
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.source !== RANK_MESSAGE_SOURCE && !isRankMessageType(message.type)) {
    return;
  }
  if (typeof message.type !== "string") {
    throw new Error("Open data rank message requires type.");
  }
  if (!isRankMessageType(message.type)) {
    throw new Error("Unsupported open data rank message: " + message.type + ".");
  }
  if (message.type === "show_progress_rank") {
    requestRank("progress");
    return;
  }
  if (message.type === "show_total_rank") {
    requestRank("total");
    return;
  }
  if (message.type === "hide_rank") {
    hideRank();
    return;
  }
  if (message.type === "scroll_rank") {
    scrollRank(message.deltaY);
    return;
  }
});

drawEmpty(currentRankType, "点击排行榜查看好友数据");
