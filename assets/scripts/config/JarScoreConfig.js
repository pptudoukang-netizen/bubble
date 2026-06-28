"use strict";

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("JarScoreConfig." + fieldName + " must be a positive integer.");
  }
  return value;
}

function assertBaseScoreTable(table) {
  if (!Array.isArray(table) || !table.length) {
    throw new Error("JarScoreConfig base score table must be a non-empty array.");
  }
  table.forEach(function (score, index) {
    if (!Number.isInteger(score) || score < 0) {
      throw new Error("JarScoreConfig base score at index " + index + " must be a non-negative integer.");
    }
  });
  return table.slice();
}

var JarScoreConfig = {
  baseScoresByJarCount: {
    1: assertBaseScoreTable([120]),
    2: assertBaseScoreTable([80, 80]),
    3: assertBaseScoreTable([60, 120, 60]),
    4: assertBaseScoreTable([40, 90, 90, 40])
  }
};

JarScoreConfig.getBaseScoresForJarCount = function (jarCount) {
  var count = assertPositiveInteger(jarCount, "jarCount");
  if (!Object.prototype.hasOwnProperty.call(this.baseScoresByJarCount, count)) {
    throw new Error("JarScoreConfig has no base score table for jarCount " + count + ".");
  }
  return this.baseScoresByJarCount[count].slice();
};

JarScoreConfig.getBaseScoreForJarIndex = function (jarCount, jarIndex) {
  var table = this.getBaseScoresForJarCount(jarCount);
  if (!Number.isInteger(jarIndex) || jarIndex < 0 || jarIndex >= table.length) {
    throw new Error("JarScoreConfig jarIndex " + jarIndex + " is out of range for jarCount " + jarCount + ".");
  }
  return table[jarIndex];
};

module.exports = JarScoreConfig;
