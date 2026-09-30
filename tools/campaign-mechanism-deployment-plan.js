"use strict";

var Catalog = require("./level-combination-catalog");
var DeploymentPolicy = require("./level-combination-deployment-policy");
var SpecialMechanismSchedule = require("./campaign-special-mechanism-schedule");
var AssistSpiritRescueConfig = require("../assets/scripts/config/AssistSpiritRescueConfig");

var EXPECTED_SCHEDULED_LEVEL_COUNT = SpecialMechanismSchedule.INTRODUCTIONS.reduce(function (count, definition) {
  return count + SpecialMechanismSchedule.getScheduledEntries(definition).length;
}, 0);
var TARGET_LEVEL_COUNT = 1000;
var SCHEDULE_KEY_TO_MECHANISM_ID = Object.freeze({
  blackHole: "black_hole",
  poisonAttachment: "poison_attachment",
  spiritCocoon: "spirit_cocoon",
  iceCrystalAttachment: "ice_crystal_attachment",
  transparentBall: "transparent_ball",
  breeder: "breeder",
  bubbleShieldAttachment: "bubble_shield_attachment",
  mine: "mine",
  bud: "bud",
  multiRescueTargets: "multi_rescue",
  colorCloud: "color_cloud",
  spider: "spider",
  windTunnelExit: "wind_tunnel",
  rainbowPrism: "rainbow_prism"
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function buildMechanismOrder() {
  var order = {};
  Catalog.MECHANISMS.forEach(function (mechanism, index) {
    order[mechanism.id] = index;
  });
  return order;
}

var MECHANISM_ORDER = buildMechanismOrder();

function combinationSignature(mechanismIds) {
  var sorted = mechanismIds.slice().sort(function (left, right) {
    return MECHANISM_ORDER[left] - MECHANISM_ORDER[right];
  });
  return sorted.join("+");
}

function buildCombinationBySignature() {
  var index = {};
  Catalog.buildCombinations().forEach(function (combination) {
    var signature = combinationSignature(combination.mechanisms.map(function (mechanism) {
      return mechanism.id;
    }));
    if (hasOwn(index, signature)) {
      throw new Error("Duplicated catalog combination signature: " + signature + ".");
    }
    index[signature] = combination;
  });
  return index;
}

var COMBINATION_BY_SIGNATURE = buildCombinationBySignature();

function getCombination(mechanismIds) {
  var signature = combinationSignature(mechanismIds);
  if (!hasOwn(COMBINATION_BY_SIGNATURE, signature)) {
    throw new Error("Deployment plan requested a forbidden combination: " + signature + ".");
  }
  return COMBINATION_BY_SIGNATURE[signature];
}

function stableHash(text) {
  var hash = 2166136261;
  for (var index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function effectiveCandidateWeight(combination, recommendation) {
  if (recommendation.weight > 0) {
    return recommendation.weight;
  }
  var baseMechanism = combination.mechanisms.filter(function (mechanism) {
    return mechanism.group === Catalog.GROUP_BASE;
  });
  if (baseMechanism.length !== 1) {
    throw new Error("Fixed-mode base partner combination is malformed: " + combination.id + ".");
  }
  var complexity = DeploymentPolicy.getProfile(baseMechanism[0].id).complexity;
  if (complexity === 1) {
    return 6;
  }
  if (complexity === 2) {
    return 3;
  }
  if (complexity === 3) {
    return 1;
  }
  throw new Error("Unsupported base partner complexity: " + complexity + ".");
}

function buildBasePairCandidates(newMechanismId) {
  var newMechanism = Catalog.getMechanism(newMechanismId);
  return Catalog.MECHANISMS.filter(function (mechanism) {
    return mechanism.group === Catalog.GROUP_BASE;
  }).filter(function (baseMechanism) {
    return Catalog.pairDecision(newMechanism, baseMechanism).allowed;
  }).map(function (baseMechanism) {
    var combination = getCombination([newMechanismId, baseMechanism.id]);
    var recommendation = DeploymentPolicy.getRecommendation(combination);
    return Object.freeze({
      baseMechanismId: baseMechanism.id,
      combination: combination,
      recommendation: recommendation,
      effectiveWeight: effectiveCandidateWeight(combination, recommendation)
    });
  });
}

function chooseBasePair(newMechanismId, levelId, singleExposureCount, basePairUseCount, selectionState) {
  var requireHighComplexity = singleExposureCount >= 3 && basePairUseCount % 4 === 3;
  var candidates = buildBasePairCandidates(newMechanismId).filter(function (candidate) {
    if (candidate.recommendation.firstAllowedLevel > levelId) {
      return false;
    }
    var highComplexity = candidate.recommendation.complexityScore >= 6;
    if (requireHighComplexity !== highComplexity) {
      return false;
    }
    var state = selectionState[candidate.combination.id];
    return state === undefined || levelId - state.lastLevel >= candidate.recommendation.longTermMinimumGap;
  });
  if (candidates.length === 0) {
    throw new Error(
      "No eligible base partner exists for " + newMechanismId + " at level " + levelId +
      " after " + singleExposureCount + " single exposures and " + basePairUseCount + " base pairs."
    );
  }
  candidates.sort(function (left, right) {
    var leftState = selectionState[left.combination.id];
    var rightState = selectionState[right.combination.id];
    var leftUseCount = leftState === undefined ? 0 : leftState.useCount;
    var rightUseCount = rightState === undefined ? 0 : rightState.useCount;
    var leftRatio = (leftUseCount + 1) / left.effectiveWeight;
    var rightRatio = (rightUseCount + 1) / right.effectiveWeight;
    if (leftRatio !== rightRatio) {
      return leftRatio - rightRatio;
    }
    return stableHash(newMechanismId + ":" + levelId + ":" + left.combination.id) -
      stableHash(newMechanismId + ":" + levelId + ":" + right.combination.id);
  });
  var selected = candidates[0];
  var previousState = selectionState[selected.combination.id];
  selectionState[selected.combination.id] = {
    lastLevel: levelId,
    useCount: previousState === undefined ? 1 : previousState.useCount + 1
  };
  return selected.combination;
}

function buildScheduledEvents() {
  var events = [];
  var seenLevels = {};
  var seenScheduleKeys = {};
  SpecialMechanismSchedule.INTRODUCTIONS.forEach(function (definition) {
    if (!hasOwn(SCHEDULE_KEY_TO_MECHANISM_ID, definition.key)) {
      throw new Error("Deployment plan has no mechanism mapping for schedule key: " + definition.key + ".");
    }
    seenScheduleKeys[definition.key] = true;
    var mechanismId = SCHEDULE_KEY_TO_MECHANISM_ID[definition.key];
    Catalog.getMechanism(mechanismId);
    var recurrenceIndex = 0;
    SpecialMechanismSchedule.getScheduledEntries(definition).forEach(function (entry) {
      if (hasOwn(seenLevels, entry.levelId)) {
        throw new Error(
          "Deployment plan schedule level " + entry.levelId + " overlaps " + seenLevels[entry.levelId] + "."
        );
      }
      seenLevels[entry.levelId] = mechanismId;
      events.push({
        levelId: entry.levelId,
        stage: entry.stage,
        recurrenceIndex: entry.stage === "recurrence" ? recurrenceIndex : -1,
        scheduleKey: definition.key,
        mechanismId: mechanismId
      });
      if (entry.stage === "recurrence") {
        recurrenceIndex += 1;
      }
    });
  });
  Object.keys(SCHEDULE_KEY_TO_MECHANISM_ID).forEach(function (scheduleKey) {
    if (!hasOwn(seenScheduleKeys, scheduleKey)) {
      throw new Error("Deployment plan mapping is not used by the schedule: " + scheduleKey + ".");
    }
  });
  events.sort(function (left, right) { return left.levelId - right.levelId; });
  if (events.length !== EXPECTED_SCHEDULED_LEVEL_COUNT) {
    throw new Error(
      "Deployment plan expected " + EXPECTED_SCHEDULED_LEVEL_COUNT +
      " scheduled levels, got " + events.length + "."
    );
  }
  return events;
}

function resolveTargetKind(event) {
  if (event.stage === "teaching" || event.stage === "review") {
    return "single";
  }
  if (event.stage === "combination") {
    return "base_pair";
  }
  if (event.stage !== "recurrence") {
    throw new Error("Unsupported deployment stage: " + event.stage + ".");
  }
  if (event.mechanismId === "multi_rescue") {
    return event.recurrenceIndex % 2 === 0 ? "single" : "base_pair";
  }
  var patternIndex = event.recurrenceIndex % 3;
  if (patternIndex === 0) {
    return "single";
  }
  return patternIndex === 1 ? "base_pair" : "board_pair";
}

function buildDeploymentPlan() {
  var selectionState = {};
  var singleExposureCounts = {};
  var basePairUseCounts = {};
  return Object.freeze(buildScheduledEvents().map(function (event) {
    var currentSingleCount = hasOwn(singleExposureCounts, event.mechanismId)
      ? singleExposureCounts[event.mechanismId]
      : 0;
    var currentBasePairCount = hasOwn(basePairUseCounts, event.mechanismId)
      ? basePairUseCounts[event.mechanismId]
      : 0;
    var targetKind = resolveTargetKind(event);
    var combination;
    if (targetKind === "single") {
      combination = getCombination([event.mechanismId]);
      singleExposureCounts[event.mechanismId] = currentSingleCount + 1;
    } else if (targetKind === "board_pair") {
      combination = getCombination([event.mechanismId, "board_occlusion"]);
    } else if (targetKind === "base_pair") {
      combination = chooseBasePair(
        event.mechanismId,
        event.levelId,
        currentSingleCount,
        currentBasePairCount,
        selectionState
      );
      basePairUseCounts[event.mechanismId] = currentBasePairCount + 1;
    } else {
      throw new Error("Unsupported target kind: " + targetKind + ".");
    }
    var recommendation = DeploymentPolicy.getRecommendation(combination);
    if (recommendation.firstAllowedLevel > event.levelId) {
      throw new Error(
        "Recommended combination " + combination.id + " is scheduled before level " +
        recommendation.firstAllowedLevel + ": " + event.levelId + "."
      );
    }
    return Object.freeze({
      levelId: event.levelId,
      stage: event.stage,
      recurrenceIndex: event.recurrenceIndex,
      scheduleKey: event.scheduleKey,
      mechanismId: event.mechanismId,
      targetKind: targetKind,
      combination: combination,
      recommendation: recommendation,
      singleExposureCountBefore: currentSingleCount
    });
  }));
}

var BASE_INTRODUCTIONS = Object.freeze([
  Object.freeze({ mechanismId: "stone", firstLevel: 10 }),
  Object.freeze({ mechanismId: "rainbow", firstLevel: 12 }),
  Object.freeze({ mechanismId: "blast", firstLevel: 14 }),
  Object.freeze({ mechanismId: "ice", firstLevel: 16 }),
  Object.freeze({ mechanismId: "swirl", firstLevel: 21 }),
  Object.freeze({ mechanismId: "vine_spirit", firstLevel: 31 }),
  Object.freeze({ mechanismId: "molotov", firstLevel: 41 }),
  Object.freeze({ mechanismId: "wormhole", firstLevel: 53 }),
  Object.freeze({ mechanismId: "splitter", firstLevel: 61 }),
  Object.freeze({ mechanismId: "lock_chain", firstLevel: 81 })
]);

var BOARD_OCCLUSION_EVENTS = Object.freeze([
  Object.freeze({ levelId: 31, stage: "teaching", recurrenceIndex: -1 }),
  Object.freeze({ levelId: 36, stage: "review", recurrenceIndex: -1 }),
  Object.freeze({ levelId: 43, stage: "combination", recurrenceIndex: -1 }),
  Object.freeze({ levelId: 103, stage: "recurrence", recurrenceIndex: 0 }),
  Object.freeze({ levelId: 164, stage: "recurrence", recurrenceIndex: 1 }),
  Object.freeze({ levelId: 223, stage: "recurrence", recurrenceIndex: 2 }),
  Object.freeze({ levelId: 283, stage: "recurrence", recurrenceIndex: 3 })
]);

function isTimedLevel(levelId) {
  return levelId % 10 === 0;
}

function isSingleRescueLevel(levelId) {
  return AssistSpiritRescueConfig.RESCUE_LEVEL_IDS.indexOf(levelId) >= 0;
}

function reserveCampaignLevel(occupiedLevels, levelId, owner) {
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > TARGET_LEVEL_COUNT) {
    throw new Error("Campaign deployment level is outside [1, 1000]: " + levelId + ".");
  }
  if (hasOwn(occupiedLevels, levelId)) {
    throw new Error(
      "Campaign deployment level " + levelId + " overlaps " + occupiedLevels[levelId] + " and " + owner + "."
    );
  }
  occupiedLevels[levelId] = owner;
}

function findNearestAvailableLevel(rangeStart, rangeEnd, targetLevel, occupiedLevels, owner) {
  if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || !Number.isInteger(targetLevel) ||
      rangeStart < 1 || rangeStart > rangeEnd || targetLevel < rangeStart || targetLevel > rangeEnd) {
    throw new Error(
      "Campaign deployment range is invalid for " + owner + ": " +
      rangeStart + "-" + rangeEnd + " target=" + targetLevel + "."
    );
  }
  var maximumDistance = Math.max(targetLevel - rangeStart, rangeEnd - targetLevel);
  for (var distance = 0; distance <= maximumDistance; distance += 1) {
    var candidates = distance === 0
      ? [targetLevel]
      : [targetLevel - distance, targetLevel + distance];
    for (var index = 0; index < candidates.length; index += 1) {
      var levelId = candidates[index];
      if (levelId >= rangeStart && levelId <= rangeEnd && !hasOwn(occupiedLevels, levelId)) {
        return levelId;
      }
    }
  }
  throw new Error(
    "No campaign deployment level is available for " + owner + " in " + rangeStart + "-" + rangeEnd + "."
  );
}

function hasAvailableLevel(rangeStart, rangeEnd, occupiedLevels) {
  for (var levelId = rangeStart; levelId <= rangeEnd; levelId += 1) {
    if (!hasOwn(occupiedLevels, levelId)) {
      return true;
    }
  }
  return false;
}

function buildBaseSchedule(occupiedLevels) {
  var entriesByMechanism = {};
  BASE_INTRODUCTIONS.forEach(function (definition) {
    Catalog.getMechanism(definition.mechanismId);
    entriesByMechanism[definition.mechanismId] = [];
  });

  BASE_INTRODUCTIONS.forEach(function (definition) {
    var levelId = findNearestAvailableLevel(
      definition.firstLevel,
      definition.firstLevel + 6,
      definition.firstLevel,
      occupiedLevels,
      definition.mechanismId + " teaching"
    );
    reserveCampaignLevel(occupiedLevels, levelId, definition.mechanismId + " teaching");
    entriesByMechanism[definition.mechanismId].push({
      levelId: levelId,
      stage: "teaching",
      recurrenceIndex: -1,
      mechanismId: definition.mechanismId
    });
  });

  BASE_INTRODUCTIONS.forEach(function (definition) {
    var teachingLevel = entriesByMechanism[definition.mechanismId][0].levelId;
    var levelId = findNearestAvailableLevel(
      teachingLevel + 4,
      teachingLevel + 6,
      teachingLevel + 5,
      occupiedLevels,
      definition.mechanismId + " review"
    );
    reserveCampaignLevel(occupiedLevels, levelId, definition.mechanismId + " review");
    entriesByMechanism[definition.mechanismId].push({
      levelId: levelId,
      stage: "review",
      recurrenceIndex: -1,
      mechanismId: definition.mechanismId
    });
  });

  BASE_INTRODUCTIONS.forEach(function (definition) {
    var teachingLevel = entriesByMechanism[definition.mechanismId][0].levelId;
    var levelId = findNearestAvailableLevel(
      teachingLevel + 10,
      teachingLevel + 15,
      teachingLevel + 12,
      occupiedLevels,
      definition.mechanismId + " combination"
    );
    reserveCampaignLevel(occupiedLevels, levelId, definition.mechanismId + " combination");
    entriesByMechanism[definition.mechanismId].push({
      levelId: levelId,
      stage: "combination",
      recurrenceIndex: -1,
      mechanismId: definition.mechanismId
    });
  });

  while (true) {
    var candidates = BASE_INTRODUCTIONS.map(function (definition) {
      var entries = entriesByMechanism[definition.mechanismId];
      var previousLevel = entries[entries.length - 1].levelId;
      return {
        definition: definition,
        previousLevel: previousLevel,
        targetLevel: previousLevel + 60
      };
    }).filter(function (candidate) {
      var rangeStart = candidate.previousLevel + 50;
      var rangeEnd = Math.min(candidate.previousLevel + 80, TARGET_LEVEL_COUNT);
      return rangeStart <= TARGET_LEVEL_COUNT && hasAvailableLevel(rangeStart, rangeEnd, occupiedLevels);
    });
    if (candidates.length === 0) {
      break;
    }
    candidates.sort(function (left, right) {
      return left.targetLevel - right.targetLevel ||
        left.definition.firstLevel - right.definition.firstLevel;
    });
    var selected = candidates[0];
    var rangeEnd = Math.min(selected.previousLevel + 80, TARGET_LEVEL_COUNT);
    var targetLevel = Math.min(selected.targetLevel, rangeEnd);
    var levelId = findNearestAvailableLevel(
      selected.previousLevel + 50,
      rangeEnd,
      targetLevel,
      occupiedLevels,
      selected.definition.mechanismId + " recurrence"
    );
    reserveCampaignLevel(occupiedLevels, levelId, selected.definition.mechanismId + " recurrence");
    var entries = entriesByMechanism[selected.definition.mechanismId];
    entries.push({
      levelId: levelId,
      stage: "recurrence",
      recurrenceIndex: entries.filter(function (entry) { return entry.stage === "recurrence"; }).length,
      mechanismId: selected.definition.mechanismId
    });
  }

  return Object.keys(entriesByMechanism).reduce(function (allEntries, mechanismId) {
    return allEntries.concat(entriesByMechanism[mechanismId]);
  }, []).sort(function (left, right) { return left.levelId - right.levelId; });
}

function getPairEffectiveWeight(candidate, primaryMechanismId) {
  if (candidate.recommendation.weight > 0) {
    return candidate.recommendation.weight;
  }
  var partner = candidate.combination.mechanisms.filter(function (mechanism) {
    return mechanism.id !== primaryMechanismId && mechanism.group === Catalog.GROUP_BASE;
  });
  if (partner.length !== 1) {
    throw new Error(
      "Fixed campaign pair must contain exactly one base partner: " + candidate.combination.id + "."
    );
  }
  var complexity = DeploymentPolicy.getProfile(partner[0].id).complexity;
  return complexity === 1 ? 6 : (complexity === 2 ? 3 : 1);
}

function chooseCampaignBasePartner(primaryMechanismId, levelId, requireHighComplexity, selectionState) {
  var primary = Catalog.getMechanism(primaryMechanismId);
  var candidates = Catalog.MECHANISMS.filter(function (mechanism) {
    return mechanism.group === Catalog.GROUP_BASE && mechanism.id !== primaryMechanismId;
  }).filter(function (baseMechanism) {
    return Catalog.pairDecision(primary, baseMechanism).allowed;
  }).map(function (baseMechanism) {
    var combination = getCombination([primaryMechanismId, baseMechanism.id]);
    var recommendation = DeploymentPolicy.getRecommendation(combination);
    return {
      combination: combination,
      recommendation: recommendation
    };
  }).filter(function (candidate) {
    if (candidate.recommendation.firstAllowedLevel > levelId) {
      return false;
    }
    var highComplexity = candidate.recommendation.complexityScore >= 6;
    if (!requireHighComplexity && highComplexity) {
      return false;
    }
    var state = selectionState[candidate.combination.id];
    return state === undefined || levelId - state.lastLevel >= candidate.recommendation.longTermMinimumGap;
  });
  if (candidates.length === 0) {
    throw new Error(
      "No eligible campaign base partner exists for " + primaryMechanismId + " at level " + levelId +
      " with requireHighComplexity=" + requireHighComplexity + "."
    );
  }
  candidates.forEach(function (candidate) {
    candidate.effectiveWeight = getPairEffectiveWeight(candidate, primaryMechanismId);
  });
  candidates.sort(function (left, right) {
    if (requireHighComplexity) {
      var leftHighComplexity = left.recommendation.complexityScore >= 6;
      var rightHighComplexity = right.recommendation.complexityScore >= 6;
      if (leftHighComplexity !== rightHighComplexity) {
        return leftHighComplexity ? -1 : 1;
      }
    }
    var leftState = selectionState[left.combination.id];
    var rightState = selectionState[right.combination.id];
    var leftUseCount = leftState === undefined ? 0 : leftState.useCount;
    var rightUseCount = rightState === undefined ? 0 : rightState.useCount;
    var leftRatio = (leftUseCount + 1) / left.effectiveWeight;
    var rightRatio = (rightUseCount + 1) / right.effectiveWeight;
    if (leftRatio !== rightRatio) {
      return leftRatio - rightRatio;
    }
    return stableHash(primaryMechanismId + ":" + levelId + ":" + left.combination.id) -
      stableHash(primaryMechanismId + ":" + levelId + ":" + right.combination.id);
  });
  var selected = candidates[0];
  var previous = selectionState[selected.combination.id];
  selectionState[selected.combination.id] = {
    lastLevel: levelId,
    useCount: previous === undefined ? 1 : previous.useCount + 1
  };
  return selected.combination;
}

function makeCampaignPlanRow(levelId, source, stage, targetKind, combination) {
  if (!combination || !Array.isArray(combination.mechanisms) || combination.mechanisms.length < 1) {
    throw new Error("Campaign mechanism plan requires a legal combination at level " + levelId + ".");
  }
  var recommendation = DeploymentPolicy.getRecommendation(combination);
  if (recommendation.firstAllowedLevel > levelId) {
    throw new Error(
      "Campaign combination " + combination.id + " is scheduled before its first allowed level " +
      recommendation.firstAllowedLevel + ": " + levelId + "."
    );
  }
  return Object.freeze({
    levelId: levelId,
    source: source,
    stage: stage,
    targetKind: targetKind,
    combination: combination,
    recommendation: recommendation,
    mechanismIds: Object.freeze(combination.mechanisms.map(function (mechanism) { return mechanism.id; }))
  });
}

function makeOrdinaryPlanRow(levelId) {
  return Object.freeze({
    levelId: levelId,
    source: "ordinary",
    stage: "ordinary",
    targetKind: "ordinary",
    combination: null,
    recommendation: null,
    mechanismIds: Object.freeze([])
  });
}

function assertCampaignPlanRow(row) {
  if (row.mechanismIds.length > 2) {
    throw new Error("Campaign level " + row.levelId + " exceeds the two-mechanism limit.");
  }
  var ballIds = [];
  row.mechanismIds.forEach(function (mechanismId) {
    Catalog.getMechanism(mechanismId).balls.forEach(function (ballId) {
      if (ballIds.indexOf(ballId) < 0) {
        ballIds.push(ballId);
      }
    });
  });
  if (ballIds.length > 3) {
    throw new Error("Campaign level " + row.levelId + " exceeds the three-special-ball-type limit.");
  }
  var containsTimed = row.mechanismIds.indexOf("timed_mode") >= 0;
  var containsSingleRescue = row.mechanismIds.indexOf("single_rescue") >= 0;
  if (containsTimed !== isTimedLevel(row.levelId)) {
    throw new Error("Campaign timed-mode plan differs from the fixed schedule at level " + row.levelId + ".");
  }
  if (containsSingleRescue !== isSingleRescueLevel(row.levelId)) {
    throw new Error("Campaign single-rescue plan differs from the fixed schedule at level " + row.levelId + ".");
  }
  if (row.mechanismIds.indexOf("multi_rescue") >= 0 && row.mechanismIds.indexOf("board_occlusion") >= 0) {
    throw new Error("Campaign multi-rescue level cannot use board occlusion: " + row.levelId + ".");
  }
}

function buildCampaignPlan() {
  var rows = [];
  var occupiedLevels = {};
  var newPlan = buildDeploymentPlan();
  var newPlanByLevel = {};
  newPlan.forEach(function (entry) {
    reserveCampaignLevel(occupiedLevels, entry.levelId, "new mechanism " + entry.mechanismId);
    newPlanByLevel[entry.levelId] = entry;
  });
  for (var levelId = 1; levelId <= TARGET_LEVEL_COUNT; levelId += 1) {
    if (isTimedLevel(levelId)) {
      reserveCampaignLevel(occupiedLevels, levelId, "timed mode");
    }
  }
  AssistSpiritRescueConfig.RESCUE_LEVEL_IDS.forEach(function (levelId) {
    reserveCampaignLevel(occupiedLevels, levelId, "single rescue");
  });
  BOARD_OCCLUSION_EVENTS.forEach(function (entry) {
    reserveCampaignLevel(occupiedLevels, entry.levelId, "board occlusion " + entry.stage);
  });
  var baseSchedule = buildBaseSchedule(occupiedLevels);

  var rowByLevel = {};
  Object.keys(newPlanByLevel).forEach(function (levelKey) {
    var entry = newPlanByLevel[levelKey];
    rowByLevel[entry.levelId] = makeCampaignPlanRow(
      entry.levelId,
      "new",
      entry.stage,
      entry.targetKind,
      entry.combination
    );
  });

  var timedPairState = {};
  for (var timedLevel = 10, timedIndex = 0; timedLevel <= TARGET_LEVEL_COUNT; timedLevel += 10, timedIndex += 1) {
    var timedCombination = timedIndex < 2 || timedIndex % 2 === 1
      ? getCombination(["timed_mode"])
      : chooseCampaignBasePartner("timed_mode", timedLevel, false, timedPairState);
    rowByLevel[timedLevel] = makeCampaignPlanRow(
      timedLevel,
      "timed",
      timedIndex === 0 ? "teaching" : (timedIndex === 1 ? "review" : "recurrence"),
      timedCombination.mechanisms.length === 1 ? "single" : "base_pair",
      timedCombination
    );
  }

  var rescuePairState = {};
  AssistSpiritRescueConfig.RESCUE_LEVEL_IDS.forEach(function (rescueLevel, rescueIndex) {
    var usePair = rescueIndex >= 2 && rescueIndex % 3 === 2;
    var rescueCombination = usePair
      ? chooseCampaignBasePartner("single_rescue", rescueLevel, false, rescuePairState)
      : getCombination(["single_rescue"]);
    rowByLevel[rescueLevel] = makeCampaignPlanRow(
      rescueLevel,
      "single_rescue",
      rescueIndex === 0 ? "teaching" : (rescueIndex === 1 ? "review" : "recurrence"),
      usePair ? "base_pair" : "single",
      rescueCombination
    );
  });

  var boardPairState = {};
  BOARD_OCCLUSION_EVENTS.forEach(function (entry) {
    var usePair = entry.stage === "combination" ||
      (entry.stage === "recurrence" && entry.recurrenceIndex % 2 === 1);
    var boardCombination = usePair
      ? chooseCampaignBasePartner("board_occlusion", entry.levelId, false, boardPairState)
      : getCombination(["board_occlusion"]);
    rowByLevel[entry.levelId] = makeCampaignPlanRow(
      entry.levelId,
      "board_occlusion",
      entry.stage,
      usePair ? "base_pair" : "single",
      boardCombination
    );
  });

  var basePairState = {};
  var singleExposureCounts = {};
  var basePairUseCounts = {};
  BASE_INTRODUCTIONS.forEach(function (definition) {
    singleExposureCounts[definition.mechanismId] = 0;
    basePairUseCounts[definition.mechanismId] = 0;
  });
  baseSchedule.forEach(function (entry) {
    var targetKind;
    if (entry.stage === "teaching" || entry.stage === "review") {
      targetKind = "single";
    } else if (entry.stage === "combination") {
      targetKind = "base_pair";
    } else if (entry.stage === "recurrence") {
      var patternIndex = entry.recurrenceIndex % 3;
      targetKind = patternIndex === 0 ? "single" : (patternIndex === 1 ? "base_pair" : "board_pair");
    } else {
      throw new Error("Unsupported base campaign stage: " + entry.stage + ".");
    }
    var combination;
    if (targetKind === "single") {
      combination = getCombination([entry.mechanismId]);
      singleExposureCounts[entry.mechanismId] += 1;
    } else if (targetKind === "board_pair") {
      if (singleExposureCounts[entry.mechanismId] < 3) {
        throw new Error(
          "Base mechanism " + entry.mechanismId + " reached a board pair before three single exposures."
        );
      }
      combination = getCombination([entry.mechanismId, "board_occlusion"]);
    } else {
      var requireHighComplexity = singleExposureCounts[entry.mechanismId] >= 3 &&
        basePairUseCounts[entry.mechanismId] % 4 === 3;
      combination = chooseCampaignBasePartner(
        entry.mechanismId,
        entry.levelId,
        requireHighComplexity,
        basePairState
      );
      basePairUseCounts[entry.mechanismId] += 1;
    }
    rowByLevel[entry.levelId] = makeCampaignPlanRow(
      entry.levelId,
      "base",
      entry.stage,
      targetKind,
      combination
    );
  });

  for (var campaignLevelId = 1; campaignLevelId <= TARGET_LEVEL_COUNT; campaignLevelId += 1) {
    var row = hasOwn(rowByLevel, campaignLevelId)
      ? rowByLevel[campaignLevelId]
      : makeOrdinaryPlanRow(campaignLevelId);
    assertCampaignPlanRow(row);
    rows.push(row);
  }
  if (rows.length !== TARGET_LEVEL_COUNT) {
    throw new Error("Campaign mechanism plan must contain exactly 1000 rows.");
  }
  return Object.freeze(rows);
}

var CAMPAIGN_PLAN = buildCampaignPlan();

function getCampaignLevelPlan(levelId) {
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > TARGET_LEVEL_COUNT) {
    throw new Error("Campaign mechanism plan requires levelId in [1, 1000]: " + levelId + ".");
  }
  return CAMPAIGN_PLAN[levelId - 1];
}

module.exports = Object.freeze({
  EXPECTED_SCHEDULED_LEVEL_COUNT: EXPECTED_SCHEDULED_LEVEL_COUNT,
  TARGET_LEVEL_COUNT: TARGET_LEVEL_COUNT,
  SCHEDULE_KEY_TO_MECHANISM_ID: SCHEDULE_KEY_TO_MECHANISM_ID,
  BASE_INTRODUCTIONS: BASE_INTRODUCTIONS,
  BOARD_OCCLUSION_EVENTS: BOARD_OCCLUSION_EVENTS,
  buildDeploymentPlan: buildDeploymentPlan,
  buildCampaignPlan: buildCampaignPlan,
  getCampaignLevelPlan: getCampaignLevelPlan
});
