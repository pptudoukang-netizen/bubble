"use strict";

var MAX_PASS_LEVEL_KEY = "max_pass_level";
var TOTAL_SCORE_KEY = "total_score";
var CANVAS_WIDTH = 720;
var CANVAS_HEIGHT = 1280;
var RANK_MESSAGE_SOURCE = "bubble_friend_rank";

var PANEL_X = 37.5;
var PANEL_Y = 150;
var PANEL_WIDTH = 645;
var PANEL_HEIGHT = 1008;
var TITLE_BG_X = 183.86;
var TITLE_BG_Y = 97.093;
var TITLE_BG_WIDTH = 355;
var TITLE_BG_HEIGHT = 136;
var TITLE_X = 368.757;
var TITLE_Y = 158.41;
var CLOSE_X = 581.215;
var CLOSE_Y = 141.72;
var CLOSE_WIDTH = 102;
var CLOSE_HEIGHT = 101;
var LIST_X = 68.962;
var LIST_Y = 246.604;
var LIST_WIDTH = 590;
var LIST_HEIGHT = 826;
var ROW_WIDTH = 590;
var ROW_HEIGHT = 143;
var ROW_GAP = 8;
var ROW_STRIDE = ROW_HEIGHT + ROW_GAP;
var ROW_POOL_BUFFER = 2;
var DECOR_BUBBLES = [
  { x: 176.201, y: 1033.396, size: 86 },
  { x: 253.3, y: 1081.371, size: 59 },
  { x: 379.117, y: 1089.301, size: 86 },
  { x: 435.51, y: 1037.889, size: 59 }
];

var ROW_CENTER_X = LIST_X + (ROW_WIDTH * 0.5);
var RANK_BADGE_X = ROW_CENTER_X - 229.138;
var RANK_BADGE_Y = 5.864;
var RANK_NUM_X = ROW_CENTER_X - 227.064;
var RANK_NUM_Y = 20.369;
var AVATAR_X = ROW_CENTER_X - 144.262;
var NAME_X = ROW_CENTER_X - 87.519;
var SCORE_X = ROW_CENTER_X + 194.669;
var LEVEL_X = ROW_CENTER_X + 280.898;

var IMAGE_PATHS = {
  panelBg: "bubble/image/ranking/bg.png",
  titleBg: "bubble/image/ranking/title_bg.png",
  closeButton: "bubble/image/ranking/btn_close.png",
  decorBubble: "bubble/image/ranking/paopao.png",
  rank1Badge: "bubble/image/ranking/1.png",
  rank2Badge: "bubble/image/ranking/2.png",
  rank3Badge: "bubble/image/ranking/3.png",
  avatar: "bubble/image/ranking/avatar.png",
  avatarFrame: "bubble/image/ranking/avatar_frame.png",
  itemBg1: "bubble/image/ranking/item_bg_1.png",
  itemBg2: "bubble/image/ranking/item_bg_2.png"
};

var IMAGE_SLICES = {
  panelBg: {
    width: 659,
    height: 607,
    top: 153,
    bottom: 262,
    left: 0,
    right: 0
  },
  itemBg1: {
    width: 178,
    height: 141,
    top: 36,
    bottom: 43,
    left: 64,
    right: 69
  },
  itemBg2: {
    width: 149,
    height: 141,
    top: 41,
    bottom: 50,
    left: 46,
    right: 58
  }
};

if (typeof wx === "undefined" || !wx) {
  throw new Error("Open data rank renderer requires wx.");
}
if (typeof wx.createImage !== "function") {
  throw new Error("Open data rank renderer requires wx.createImage.");
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

var currentRankType = "total";
var currentEntries = [];
var currentScrollOffset = 0;
var currentEmptyText = "点击排行榜查看好友数据";
var currentViewMode = "empty";
var currentRequestRankType = "";
var rankImages = {};

function clearCanvas() {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function requestRepaint() {
  if (currentViewMode === "entries") {
    drawEntries(currentEntries, currentRankType);
    return;
  }
  if (currentViewMode === "loading") {
    drawLoading(currentRankType);
    return;
  }
  drawEmpty(currentRankType, currentEmptyText);
}

function loadRankImage(key, path) {
  var image = wx.createImage();
  var asset = {
    image: image,
    loaded: false,
    path: path
  };
  image.onload = function () {
    asset.loaded = true;
    requestRepaint();
  };
  image.onerror = function (error) {
    throw new Error("Load open data rank image failed: " + path + ", " + JSON.stringify(error));
  };
  image.src = path;
  rankImages[key] = asset;
}

function loadRankImages() {
  Object.keys(IMAGE_PATHS).forEach(function (key) {
    loadRankImage(key, IMAGE_PATHS[key]);
  });
}

function drawImageAsset(key, x, y, width, height) {
  var asset = rankImages[key];
  if (!asset || asset.loaded !== true) {
    return false;
  }
  context.drawImage(asset.image, x, y, width, height);
  return true;
}

function drawImageSlice(asset, sx, sy, sw, sh, dx, dy, dw, dh) {
  if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
    context.drawImage(asset.image, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}

function drawSlicedImageAsset(key, x, y, width, height) {
  var asset = rankImages[key];
  if (!asset || asset.loaded !== true) {
    return false;
  }
  var slice = IMAGE_SLICES[key];
  if (!slice) {
    throw new Error("Open data rank image slice is missing: " + key + ".");
  }
  var sourceCenterWidth = slice.width - slice.left - slice.right;
  var sourceCenterHeight = slice.height - slice.top - slice.bottom;
  var targetCenterWidth = width - slice.left - slice.right;
  var targetCenterHeight = height - slice.top - slice.bottom;
  if (sourceCenterWidth < 0 || sourceCenterHeight < 0 || targetCenterWidth < 0 || targetCenterHeight < 0) {
    throw new Error("Open data rank image slice is invalid: " + key + ".");
  }

  var sx = [0, slice.left, slice.width - slice.right];
  var sy = [0, slice.top, slice.height - slice.bottom];
  var sw = [slice.left, sourceCenterWidth, slice.right];
  var sh = [slice.top, sourceCenterHeight, slice.bottom];
  var dx = [x, x + slice.left, x + width - slice.right];
  var dy = [y, y + slice.top, y + height - slice.bottom];
  var dw = [slice.left, targetCenterWidth, slice.right];
  var dh = [slice.top, targetCenterHeight, slice.bottom];

  for (var row = 0; row < 3; row += 1) {
    for (var col = 0; col < 3; col += 1) {
      drawImageSlice(asset, sx[col], sy[row], sw[col], sh[row], dx[col], dy[row], dw[col], dh[row]);
    }
  }
  return true;
}

function drawRankingShell() {
  clearCanvas();
  drawSlicedImageAsset("panelBg", PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT);
  drawImageAsset("titleBg", TITLE_BG_X, TITLE_BG_Y, TITLE_BG_WIDTH, TITLE_BG_HEIGHT);
  context.save();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#773bfa";
  context.lineWidth = 1;
  context.font = "bold 46px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.strokeText("好友排行榜", TITLE_X, TITLE_Y);
  context.fillText("好友排行榜", TITLE_X, TITLE_Y);
  context.restore();
  drawImageAsset("closeButton", CLOSE_X, CLOSE_Y, CLOSE_WIDTH, CLOSE_HEIGHT);
}

function drawCenteredStatus(text) {
  context.save();
  context.fillStyle = "#291266";
  context.font = "bold 32px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, CANVAS_WIDTH * 0.5, LIST_Y + (LIST_HEIGHT * 0.5));
  context.restore();
}

function drawRankingDecorations() {
  for (var index = 0; index < DECOR_BUBBLES.length; index += 1) {
    var bubble = DECOR_BUBBLES[index];
    drawImageAsset("decorBubble", bubble.x, bubble.y, bubble.size, bubble.size);
  }
}

function drawLoading(activeType) {
  currentViewMode = "loading";
  currentRankType = activeType;
  drawRankingShell();
  drawCenteredStatus("好友数据读取中...");
  drawRankingDecorations();
}

function drawEmpty(activeType, text) {
  currentViewMode = "empty";
  currentRankType = activeType;
  currentEmptyText = text;
  drawRankingShell();
  drawCenteredStatus(text);
  drawRankingDecorations();
}

function isPrivacyAgreementScopeError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  if (Number(error.errno) === 112) {
    return true;
  }
  if (typeof error.errMsg !== "string") {
    return false;
  }
  return error.errMsg.indexOf("api scope is not declared in the privacy agreement") !== -1;
}

function drawFriendCloudStorageFail(rankType, error) {
  if (isPrivacyAgreementScopeError(error)) {
    drawEmpty(rankType, "隐私指引未声明微信朋友关系");
    throw new Error("wx.getFriendCloudStorage privacy scope is not declared. Configure WeChat MP privacy agreement for 微信朋友关系: " + JSON.stringify(error));
  }
  drawEmpty(rankType, "网络异常，无法读取好友数据");
  throw new Error("wx.getFriendCloudStorage failed: " + JSON.stringify(error));
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
  if (typeof value !== "string") {
    throw new Error("Friend rank value is invalid for key: " + key + ".");
  }
  var normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new Error("Friend rank value is empty for key: " + key + ".");
  }
  var parsed = null;
  try {
    parsed = JSON.parse(normalizedValue);
  } catch (error) {
    throw new Error("Friend rank JSON parse failed for key: " + key + ", value: " + normalizedValue + ", error: " + error.message);
  }
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
  var completedLevels = toRequiredInteger(rankValue.maxPassedLevel, "maxPassedLevel");
  var score = toRequiredInteger(rankValue.totalScoreSnapshot, "totalScoreSnapshot");
  return {
    nickname: String(user.nickname),
    avatarUrl: String(user.avatarUrl),
    score: score,
    completedLevels: completedLevels,
    primary: completedLevels,
    secondary: score,
    updatedAt: toRequiredInteger(rankValue.updatedAt, "updatedAt")
  };
}

function buildTotalEntry(user, rankValue) {
  var score = toRequiredInteger(rankValue.score, "score");
  var completedLevels = toRequiredInteger(rankValue.passedLevel, "passedLevel");
  return {
    nickname: String(user.nickname),
    avatarUrl: String(user.avatarUrl),
    score: score,
    completedLevels: completedLevels,
    primary: score,
    secondary: completedLevels,
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

function resolveRankBadgeKey(rank) {
  if (rank === 1) {
    return "rank1Badge";
  }
  if (rank === 2) {
    return "rank2Badge";
  }
  if (rank === 3) {
    return "rank3Badge";
  }
  return "";
}

function resolveRowBgKey(rank) {
  if (rank === 1) {
    return "itemBg1";
  }
  return "itemBg2";
}

function fitText(text, maxWidth) {
  var result = text;
  while (result.length > 0 && context.measureText(result).width > maxWidth) {
    result = result.slice(0, result.length - 1);
  }
  if (result.length !== text.length && result.length > 1) {
    result = result.slice(0, result.length - 1) + "...";
  }
  return result;
}

function drawAvatar(x, y) {
  context.save();
  context.beginPath();
  context.arc(x, y, 40, 0, Math.PI * 2);
  context.clip();
  drawImageAsset("avatar", x - 40, y - 40, 80, 80);
  context.restore();
  drawImageAsset("avatarFrame", x - 40, y - 40, 80, 80);
}

function drawRank(entry, rowCenterY) {
  var rank = entry.rank;
  var badgeKey = resolveRankBadgeKey(rank);
  if (badgeKey) {
    drawImageAsset(badgeKey, RANK_BADGE_X - 37.2, rowCenterY - RANK_BADGE_Y - 46.4, 74.4, 92.8);
    return;
  }
  context.save();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#773bfa";
  context.lineWidth = 2;
  context.font = "bold 36px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.strokeText(String(rank), RANK_NUM_X, rowCenterY - RANK_NUM_Y);
  context.fillText(String(rank), RANK_NUM_X, rowCenterY - RANK_NUM_Y);
  context.restore();
}

function drawRow(entry, index) {
  var y = LIST_Y + (index * ROW_STRIDE);
  var rowCenterY = y + (ROW_HEIGHT * 0.5);
  drawSlicedImageAsset(resolveRowBgKey(entry.rank), LIST_X, y, ROW_WIDTH, ROW_HEIGHT);
  drawRank(entry, rowCenterY);
  drawAvatar(AVATAR_X, rowCenterY);

  context.save();
  context.textBaseline = "middle";
  context.fillStyle = "#291266";
  context.font = "36px Arial";
  context.textAlign = "left";
  context.fillText(fitText(entry.nickname, 210), NAME_X, rowCenterY);

  context.textAlign = "right";
  context.fillStyle = "#773bfa";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.font = "bold 36px Arial";
  context.strokeText(String(entry.score), SCORE_X, rowCenterY);
  context.fillText(String(entry.score), SCORE_X, rowCenterY);
  context.fillStyle = "#8174af";
  context.font = "30px Arial";
  context.fillText("(" + entry.completedLevels + "关)", LEVEL_X, rowCenterY);
  context.restore();
}

function drawEntries(entries, rankType) {
  currentViewMode = "entries";
  currentRankType = rankType;
  drawRankingShell();
  if (entries.length === 0) {
    drawEmpty(rankType, "暂无好友排行数据");
    return;
  }
  var maxOffset = Math.max(0, (entries.length * ROW_STRIDE) - LIST_HEIGHT + ROW_GAP);
  if (currentScrollOffset > maxOffset) {
    currentScrollOffset = maxOffset;
  }
  context.save();
  context.beginPath();
  context.rect(LIST_X, LIST_Y, LIST_WIDTH, LIST_HEIGHT);
  context.clip();
  var firstIndex = Math.floor(currentScrollOffset / ROW_STRIDE);
  var offsetInRow = currentScrollOffset - (firstIndex * ROW_STRIDE);
  var drawCount = Math.ceil(LIST_HEIGHT / ROW_STRIDE) + ROW_POOL_BUFFER;
  context.translate(0, -offsetInRow);
  for (var index = 0; index < drawCount; index += 1) {
    var entryIndex = firstIndex + index;
    if (entryIndex < entries.length) {
      drawRow(entries[entryIndex], index);
    }
  }
  context.restore();
  drawRankingDecorations();
}

function requestRank(rankType) {
  if (currentViewMode === "loading" && currentRequestRankType === rankType) {
    return;
  }
  currentRankType = rankType;
  currentRequestRankType = rankType;
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
      currentRequestRankType = "";
      drawEntries(currentEntries, rankType);
    },
    fail: function (error) {
      currentRequestRankType = "";
      drawFriendCloudStorageFail(rankType, error);
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
  var maxOffset = Math.max(0, (currentEntries.length * ROW_STRIDE) - LIST_HEIGHT + ROW_GAP);
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

loadRankImages();
drawEmpty(currentRankType, currentEmptyText);
