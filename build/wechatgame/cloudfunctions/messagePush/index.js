"use strict";

var crypto = require("crypto");
var cloud = require("wx-server-sdk");

var COLLECTION_NAME = "minigame_gift_deliveries";
var EVENT_DELIVER_GOODS = "minigame_deliver_goods";
var EVENT_COMMON_MINIGAME = "comm_minigame";
var MSG_TYPE_EVENT = "event";

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requireString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function requireInteger(value, fieldName) {
  if (!Number.isInteger(value)) {
    throw new Error(fieldName + " must be an integer.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  var normalized = requireInteger(value, fieldName);
  if (normalized <= 0) {
    throw new Error(fieldName + " must be positive.");
  }
  return normalized;
}

function buildSuccessResponse() {
  return {
    ErrCode: 0,
    ErrMsg: "Success"
  };
}

function buildFailureResponse(error) {
  return {
    ErrCode: 1,
    ErrMsg: error && error.message ? error.message : "Message push failed."
  };
}

function buildDeliveryDocumentId(orderId) {
  return "gift_delivery_" + crypto.createHash("sha1").update(orderId).digest("hex");
}

function normalizeGoodsList(goodsList) {
  if (!Array.isArray(goodsList) || goodsList.length === 0) {
    throw new Error("MiniGame.GoodsList must be a non-empty array.");
  }
  return goodsList.map(function (goods, index) {
    requireObject(goods, "MiniGame.GoodsList[" + index + "]");
    return {
      id: requireString(goods.Id, "MiniGame.GoodsList[" + index + "].Id"),
      num: requirePositiveInteger(goods.Num, "MiniGame.GoodsList[" + index + "].Num")
    };
  });
}

function normalizeDeliverGoodsEvent(event) {
  requireObject(event, "message push event");
  var miniGame = requireObject(event.MiniGame, "MiniGame");
  return {
    createTime: requireInteger(event.CreateTime, "CreateTime"),
    msgType: requireString(event.MsgType, "MsgType"),
    event: requireString(event.Event, "Event"),
    orderId: requireString(miniGame.OrderId, "MiniGame.OrderId"),
    isPreview: requireInteger(miniGame.IsPreview, "MiniGame.IsPreview"),
    toUserOpenid: requireString(miniGame.ToUserOpenid, "MiniGame.ToUserOpenid"),
    zone: requireInteger(miniGame.Zone, "MiniGame.Zone"),
    giftTypeId: requireInteger(miniGame.GiftTypeId, "MiniGame.GiftTypeId"),
    giftId: requireString(miniGame.GiftId, "MiniGame.GiftId"),
    sendTime: requireInteger(miniGame.SendTime, "MiniGame.SendTime"),
    goodsList: normalizeGoodsList(miniGame.GoodsList)
  };
}

async function recordDelivery(delivery) {
  var db = cloud.database();
  var documentId = buildDeliveryDocumentId(delivery.orderId);
  var collection = db.collection(COLLECTION_NAME);
  var existing = await collection.where({
    orderId: delivery.orderId
  }).limit(1).get();
  if (!existing || !Array.isArray(existing.data)) {
    throw new Error("Query gift delivery result is invalid.");
  }
  if (existing.data.length > 0) {
    return {
      idempotent: true,
      documentId: documentId
    };
  }

  await collection.add({
    data: {
      _id: documentId,
      orderId: delivery.orderId,
      giftId: delivery.giftId,
      giftTypeId: delivery.giftTypeId,
      toUserOpenid: delivery.toUserOpenid,
      zone: delivery.zone,
      isPreview: delivery.isPreview,
      sendTime: delivery.sendTime,
      createTime: delivery.createTime,
      goodsList: delivery.goodsList,
      status: "delivered",
      recordedAt: Date.now()
    }
  });
  return {
    idempotent: false,
    documentId: documentId
  };
}

async function handleDeliverGoods(event) {
  var delivery = normalizeDeliverGoodsEvent(event);
  await recordDelivery(delivery);
  return buildSuccessResponse();
}

exports.main = async function (event) {
  requireObject(event, "message push event");

  if (
    event.MsgType === MSG_TYPE_EVENT &&
    (event.Event === EVENT_DELIVER_GOODS || event.Event === EVENT_COMMON_MINIGAME)
  ) {
    try {
      return await handleDeliverGoods(event);
    } catch (error) {
      return buildFailureResponse(error);
    }
  }

  if (event.Event === "debug_demo" || event.MsgType === "text") {
    return "success";
  }

  throw new Error("Unsupported message push event: MsgType=" + event.MsgType + ", Event=" + event.Event);
};
