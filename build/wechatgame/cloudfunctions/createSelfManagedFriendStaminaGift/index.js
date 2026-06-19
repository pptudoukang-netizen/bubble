"use strict";

var crypto = require("crypto");
var cloud = require("wx-server-sdk");

var COLLECTION_NAME = "friend_stamina_gifts";
var GIFT_TYPE_STAMINA = "stamina";
var DEPLOYMENT_MARKER = "createSelfManagedFriendStaminaGift_v20260619_2";
var CLIENT_GIFT_RECORD_ID_PATTERN = /^friend_stamina_gift_[a-f0-9]{16,64}$/;

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
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

function buildGiftRecordId(senderOpenid, now) {
  var seed = [
    senderOpenid,
    String(now),
    crypto.randomBytes(8).toString("hex")
  ].join(":");
  return "friend_stamina_gift_" + crypto.createHash("sha1").update(seed).digest("hex");
}

function requireClientGiftRecordId(value, fieldName) {
  var normalized = requireNonEmptyString(value, fieldName);
  if (!CLIENT_GIFT_RECORD_ID_PATTERN.test(normalized)) {
    throw new Error(fieldName + " format is invalid.");
  }
  return normalized;
}

exports.main = async function (event) {
  console.log("[Bubble]", DEPLOYMENT_MARKER, "invoked");
  requireObject(event, "createSelfManagedFriendStaminaGift event");
  var amount = requirePositiveInteger(event.amount, "createSelfManagedFriendStaminaGift amount");
  var context = cloud.getWXContext();
  var senderOpenid = requireNonEmptyString(context.OPENID, "sender OPENID");
  var now = Date.now();
  var giftRecordId;
  if (typeof event.giftRecordId === "string" && event.giftRecordId.trim()) {
    giftRecordId = requireClientGiftRecordId(event.giftRecordId, "createSelfManagedFriendStaminaGift giftRecordId");
  } else {
    giftRecordId = buildGiftRecordId(senderOpenid, now);
  }
  var result = await cloud.database().collection(COLLECTION_NAME).doc(giftRecordId).set({
    data: {
      type: GIFT_TYPE_STAMINA,
      amount: amount,
      senderOpenid: senderOpenid,
      receiverOpenid: "",
      status: "pending",
      createdAt: now,
      claimedAt: 0
    }
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Create friend stamina gift record failed.");
  }
  return {
    deploymentMarker: DEPLOYMENT_MARKER,
    giftRecordId: giftRecordId,
    amount: amount
  };
};
