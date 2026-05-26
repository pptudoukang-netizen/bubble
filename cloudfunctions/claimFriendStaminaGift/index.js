"use strict";

var cloud = require("wx-server-sdk");

var COLLECTION_NAME = "friend_stamina_gifts";
var GIFT_TYPE_STAMINA = "stamina";

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

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

function buildRejected(reason, giftRecordId) {
  return {
    accepted: false,
    reason: reason,
    giftRecordId: giftRecordId,
    amount: 0
  };
}

exports.main = async function (event) {
  requireObject(event, "claimFriendStaminaGift event");
  var giftRecordId = requireNonEmptyString(event.giftRecordId, "friendGiftId");
  var context = cloud.getWXContext();
  var receiverOpenid = requireNonEmptyString(context.OPENID, "receiver OPENID");
  var db = cloud.database();
  var collection = db.collection(COLLECTION_NAME);
  var queryResult = await collection.where({
    _id: giftRecordId
  }).limit(1).get();
  if (!queryResult || !Array.isArray(queryResult.data)) {
    throw new Error("Query friend stamina gift result is invalid.");
  }
  if (queryResult.data.length !== 1) {
    return buildRejected("FRIEND_GIFT_NOT_FOUND", giftRecordId);
  }

  var gift = queryResult.data[0];
  requireObject(gift, "friend stamina gift record");
  if (gift.type !== GIFT_TYPE_STAMINA) {
    throw new Error("Friend gift type is invalid: " + gift.type);
  }
  var amount = requirePositiveInteger(gift.amount, "friend stamina gift amount");
  var senderOpenid = requireNonEmptyString(gift.senderOpenid, "friend stamina gift senderOpenid");
  if (senderOpenid === receiverOpenid) {
    return buildRejected("FRIEND_GIFT_SELF_CLAIM", giftRecordId);
  }
  if (gift.status === "claimed") {
    if (gift.receiverOpenid === receiverOpenid) {
      return buildRejected("FRIEND_GIFT_ALREADY_CLAIMED_BY_SELF", giftRecordId);
    }
    return buildRejected("FRIEND_GIFT_ALREADY_CLAIMED", giftRecordId);
  }
  if (gift.status !== "pending") {
    throw new Error("Friend gift status is invalid: " + gift.status);
  }

  var updateResult = await collection.doc(giftRecordId).update({
    data: {
      status: "claimed",
      receiverOpenid: receiverOpenid,
      claimedAt: Date.now()
    }
  });
  if (!updateResult || !updateResult.stats || updateResult.stats.updated !== 1) {
    throw new Error("Claim friend stamina gift update failed.");
  }

  return {
    accepted: true,
    reason: "FRIEND_GIFT_CLAIMED",
    giftRecordId: giftRecordId,
    amount: amount
  };
};
