"use strict";

function stringifyForError(data) {
  var text = JSON.stringify(data);
  if (text.length > 800) {
    return text.slice(0, 800);
  }
  return text;
}

function parseDataListText(text) {
  if (typeof text !== "string" || !text) {
    throw new Error("getGameCircleData dataList text must be non-empty.");
  }
  var parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.dataList)) {
    return parsed.dataList;
  }
  throw new Error("getGameCircleData dataList text missing dataList array.");
}

function resolveDataList(openData) {
  if (!openData || typeof openData !== "object" || Array.isArray(openData)) {
    throw new Error("getGameCircleData requires decrypted gameCircleData object.");
  }
  if (Array.isArray(openData.dataList)) {
    return openData.dataList;
  }
  if (typeof openData.dataList === "string") {
    return parseDataListText(openData.dataList);
  }
  if (openData.data && typeof openData.data === "object") {
    if (Array.isArray(openData.data.dataList)) {
      return openData.data.dataList;
    }
    if (typeof openData.data.dataList === "string") {
      return parseDataListText(openData.data.dataList);
    }
  }
  if (openData.gameCircleData && typeof openData.gameCircleData === "object") {
    return resolveDataList(openData.gameCircleData);
  }
  throw new Error("getGameCircleData decrypted data missing dataList; gameCircleData=" + stringifyForError(openData));
}

exports.main = async function (event) {
  if (!event || typeof event !== "object") {
    throw new Error("getGameCircleData requires event.");
  }
  var gameCircleData = event.gameCircleData;
  return {
    dataList: resolveDataList(gameCircleData)
  };
};
