"use strict";

function resolvePlatform(explicitPlatform) {
  if (explicitPlatform) {
    return explicitPlatform;
  }
  if (typeof wx !== "undefined" && wx) {
    return wx;
  }
  if (typeof window !== "undefined" && window.wx) {
    return window.wx;
  }
  return null;
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

var CREATE_STAMINA_GIFT_FUNCTION_NAME = "createSelfManagedFriendStaminaGift";
var CLIENT_GIFT_RECORD_ID_PATTERN = /^friend_stamina_gift_[a-f0-9]{16,64}$/;

function buildClientGiftRecordId() {
  var timeHex = Date.now().toString(16);
  var randomOne = Math.floor(Math.random() * 0x100000000).toString(16);
  while (randomOne.length < 8) {
    randomOne = "0" + randomOne;
  }
  var randomTwo = Math.floor(Math.random() * 0x100000000).toString(16);
  while (randomTwo.length < 8) {
    randomTwo = "0" + randomTwo;
  }
  return "friend_stamina_gift_" + timeHex + randomOne + randomTwo;
}

function requireClientGiftRecordId(value, fieldName) {
  var normalized = requireNonEmptyString(value, fieldName);
  if (!CLIENT_GIFT_RECORD_ID_PATTERN.test(normalized)) {
    throw new Error(fieldName + " format is invalid.");
  }
  return normalized;
}

function normalizeCloudFunctionResult(result, functionName) {
  requireObject(result, functionName + " response");
  if (result.result && typeof result.result === "object" && !Array.isArray(result.result)) {
    if (result.result.result && typeof result.result.result === "object" && !Array.isArray(result.result.result)) {
      return result.result.result;
    }
    return result.result;
  }
  return result;
}

function stringifyForError(data) {
  var text = JSON.stringify(data);
  if (text.length > 800) {
    return text.slice(0, 800);
  }
  return text;
}

function resolveGiftRecordId(result, functionName, expectedClientGiftRecordId) {
  var resolvedGiftRecordId = null;
  if (typeof result.giftRecordId === "string" && result.giftRecordId.trim()) {
    resolvedGiftRecordId = result.giftRecordId.trim();
  } else if (typeof result._id === "string" && result._id.trim()) {
    resolvedGiftRecordId = result._id.trim();
  }
  if (!resolvedGiftRecordId) {
    throw new Error(functionName + " result missing string giftRecordId; raw=" + stringifyForError(result));
  }
  if (expectedClientGiftRecordId) {
    return expectedClientGiftRecordId;
  }
  return resolvedGiftRecordId;
}

function FriendGiftService(options) {
  requireObject(options, "FriendGiftService options");
  this.platform = resolvePlatform(options.platform);
  this.cloudInitialized = false;
  this.cloudEnvId = typeof options.cloudEnvId === "string" ? options.cloudEnvId.trim() : "";
}

FriendGiftService.prototype._requireCloud = function () {
  if (!this.platform || !this.platform.cloud) {
    throw new Error("wx.cloud is required for friend gift service.");
  }
  if (typeof this.platform.cloud.callFunction !== "function") {
    throw new Error("wx.cloud.callFunction is required for friend gift service.");
  }
  if (this.cloudInitialized !== true && typeof this.platform.cloud.init === "function") {
    var initOptions = {};
    if (this.cloudEnvId) {
      initOptions.env = this.cloudEnvId;
    }
    this.platform.cloud.init(initOptions);
    this.cloudInitialized = true;
  }
  return this.platform.cloud;
};

FriendGiftService.prototype.getPlatform = function () {
  return this.platform;
};

FriendGiftService.prototype.createStaminaGift = function (amount, giftRecordId) {
  var giftAmount = requirePositiveInteger(amount, "Friend stamina gift amount");
  var expectedClientGiftRecordId = null;
  var payload = {
    amount: giftAmount
  };
  if (typeof giftRecordId === "string" && giftRecordId.trim()) {
    expectedClientGiftRecordId = requireClientGiftRecordId(giftRecordId, "friend stamina giftRecordId");
    payload.giftRecordId = expectedClientGiftRecordId;
  }
  return this._requireCloud().callFunction({
    name: CREATE_STAMINA_GIFT_FUNCTION_NAME,
    data: payload
  }).then(function (response) {
    var result = normalizeCloudFunctionResult(response, CREATE_STAMINA_GIFT_FUNCTION_NAME);
    return {
      giftRecordId: resolveGiftRecordId(
        result,
        CREATE_STAMINA_GIFT_FUNCTION_NAME,
        expectedClientGiftRecordId
      ),
      amount: requirePositiveInteger(result.amount, CREATE_STAMINA_GIFT_FUNCTION_NAME + " amount"),
      deploymentMarker: typeof result.deploymentMarker === "string" ? result.deploymentMarker : ""
    };
  });
};

FriendGiftService.buildClientGiftRecordId = buildClientGiftRecordId;

FriendGiftService.prototype.claimStaminaGift = function (giftRecordId) {
  var normalizedGiftRecordId = requireNonEmptyString(giftRecordId, "friendGiftId");
  return this._requireCloud().callFunction({
    name: "claimFriendStaminaGift",
    data: {
      giftRecordId: normalizedGiftRecordId
    }
  }).then(function (response) {
    var result = normalizeCloudFunctionResult(response, "claimFriendStaminaGift");
    return {
      accepted: result.accepted === true,
      reason: requireNonEmptyString(result.reason, "claimFriendStaminaGift reason"),
      giftRecordId: requireNonEmptyString(result.giftRecordId, "claimFriendStaminaGift giftRecordId"),
      amount: result.accepted === true ? requirePositiveInteger(result.amount, "claimFriendStaminaGift amount") : 0
    };
  });
};

FriendGiftService.prototype.resolveEnterQuery = function () {
  if (!this.platform) {
    return null;
  }
  var options = null;
  if (typeof this.platform.getEnterOptionsSync === "function") {
    options = this.platform.getEnterOptionsSync();
  } else if (typeof this.platform.getLaunchOptionsSync === "function") {
    options = this.platform.getLaunchOptionsSync();
  }
  if (!options || typeof options !== "object") {
    return null;
  }
  if (!options.query || typeof options.query !== "object") {
    return null;
  }
  return options.query;
};

module.exports = FriendGiftService;
