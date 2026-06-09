"use strict";

var REPORT_INTERVAL_MS = 3000;
var OVERLAY_NODE_NAME = "LevelSelectMemoryDiagnosticsOverlay";
var OVERLAY_WIDTH = 520;
var OVERLAY_HEIGHT = 340;

var isActive = false;
var reportTimer = null;
var counters = {};
var overlayNode = null;
var overlayLabel = null;

function requireCc() {
  if (!cc || !cc.assetManager || !cc.assetManager.assets) {
    throw new Error("LevelSelectMemoryDiagnostics requires cc.assetManager.assets.");
  }
  if (typeof cc.warn !== "function") {
    throw new Error("LevelSelectMemoryDiagnostics requires cc.warn.");
  }
  return cc;
}

function requireHostNode(hostNode) {
  if (!hostNode || !cc.isValid(hostNode)) {
    throw new Error("LevelSelectMemoryDiagnostics requires a valid overlay host node.");
  }
  return hostNode;
}

function requireAssetCache(ccRef) {
  var assets = ccRef.assetManager.assets;
  if (!assets || typeof assets.forEach !== "function") {
    throw new Error("LevelSelectMemoryDiagnostics requires assetManager.assets.forEach.");
  }
  return assets;
}

function configureOverlayLabel(label) {
  if (!label) {
    throw new Error("LevelSelectMemoryDiagnostics overlay label is required.");
  }
  if (!cc.Label || !cc.Label.CacheMode || cc.Label.CacheMode.CHAR === undefined) {
    throw new Error("LevelSelectMemoryDiagnostics overlay requires cc.Label.CacheMode.CHAR.");
  }
  label.useSystemFont = true;
  label.fontFamily = "Arial";
  label.fontSize = 18;
  label.lineHeight = 22;
  label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
  label.verticalAlign = cc.Label.VerticalAlign.TOP;
  label.overflow = cc.Label.Overflow.CLAMP;
  label.enableWrapText = true;
  label.cacheMode = cc.Label.CacheMode.CHAR;
}

function ensureOverlay(hostNode) {
  requireHostNode(hostNode);
  if (overlayNode && cc.isValid(overlayNode) && overlayLabel) {
    overlayNode.active = true;
    return;
  }

  var existingNode = hostNode.getChildByName(OVERLAY_NODE_NAME);
  if (existingNode && cc.isValid(existingNode)) {
    existingNode.destroy();
  }

  overlayNode = new cc.Node(OVERLAY_NODE_NAME);
  overlayNode.parent = hostNode;
  overlayNode.zIndex = 20000;
  overlayNode.setAnchorPoint(0, 1);
  overlayNode.setContentSize(OVERLAY_WIDTH, OVERLAY_HEIGHT);

  var widget = overlayNode.addComponent(cc.Widget);
  widget.isAlignTop = true;
  widget.isAlignLeft = true;
  widget.top = 8;
  widget.left = 8;
  if (typeof widget.updateAlignment !== "function") {
    throw new Error("LevelSelectMemoryDiagnostics overlay requires cc.Widget.updateAlignment.");
  }
  widget.updateAlignment();

  var backgroundNode = new cc.Node("Background");
  backgroundNode.parent = overlayNode;
  backgroundNode.setAnchorPoint(0, 1);
  backgroundNode.setPosition(0, 0);
  var graphics = backgroundNode.addComponent(cc.Graphics);
  graphics.fillColor = cc.color(0, 0, 0, 170);
  graphics.roundRect(0, -OVERLAY_HEIGHT, OVERLAY_WIDTH, OVERLAY_HEIGHT, 8);
  graphics.fill();

  var labelNode = new cc.Node("Label");
  labelNode.parent = overlayNode;
  labelNode.setAnchorPoint(0, 1);
  labelNode.setPosition(10, -10);
  labelNode.setContentSize(OVERLAY_WIDTH - 20, OVERLAY_HEIGHT - 20);
  labelNode.color = cc.color(255, 255, 255, 255);

  overlayLabel = labelNode.addComponent(cc.Label);
  configureOverlayLabel(overlayLabel);
  overlayLabel.string = "Level Select Memory\ncollecting...";

  var outline = labelNode.addComponent(cc.LabelOutline);
  outline.color = cc.color(0, 0, 0, 255);
  outline.width = 2;
}

function destroyOverlay() {
  overlayLabel = null;
  if (!overlayNode) {
    return;
  }
  if (cc.isValid(overlayNode)) {
    overlayNode.destroy();
  }
  overlayNode = null;
}

function createAssetSnapshot() {
  var ccRef = requireCc();
  var assets = requireAssetCache(ccRef);
  var snapshot = {
    total: 0,
    Texture2D: 0,
    SpriteFrame: 0,
    SpriteAtlas: 0,
    RenderTexture: 0
  };

  assets.forEach(function (asset) {
    snapshot.total += 1;
    if (ccRef.Texture2D && asset instanceof ccRef.Texture2D) {
      snapshot.Texture2D += 1;
      return;
    }
    if (ccRef.SpriteFrame && asset instanceof ccRef.SpriteFrame) {
      snapshot.SpriteFrame += 1;
      return;
    }
    if (ccRef.SpriteAtlas && asset instanceof ccRef.SpriteAtlas) {
      snapshot.SpriteAtlas += 1;
      return;
    }
    if (ccRef.RenderTexture && asset instanceof ccRef.RenderTexture) {
      snapshot.RenderTexture += 1;
    }
  });

  return snapshot;
}

function formatCounter(countersSnapshot, key) {
  var value = countersSnapshot[key];
  return Number.isFinite(value) ? value : 0;
}

function sumCountersByPrefix(countersSnapshot, prefix) {
  return Object.keys(countersSnapshot).reduce(function (total, key) {
    if (key.indexOf(prefix) !== 0) {
      return total;
    }
    return total + countersSnapshot[key];
  }, 0);
}

function formatTopCounters(countersSnapshot) {
  var keys = Object.keys(countersSnapshot).sort(function (left, right) {
    return countersSnapshot[right] - countersSnapshot[left];
  }).slice(0, 5);
  if (keys.length === 0) {
    return "Top counters: none";
  }
  return "Top counters: " + keys.map(function (key) {
    return key + "=" + countersSnapshot[key];
  }).join(", ");
}

function formatOverlayText(payload) {
  return [
    "Level Select Memory (" + payload.intervalMs + "ms)",
    "Assets total=" + payload.assets.total +
      " Texture2D=" + payload.assets.Texture2D +
      " SpriteFrame=" + payload.assets.SpriteFrame,
    "Atlas=" + payload.assets.SpriteAtlas +
      " RenderTexture=" + payload.assets.RenderTexture,
    "Map render=" + formatCounter(payload.counters, "floatingMap.render") +
      " visible=" + formatCounter(payload.counters, "floatingMap.renderVisibleNodes") +
      " create=" + formatCounter(payload.counters, "floatingMap.createRuntimeRoot") +
      " destroy=" + formatCounter(payload.counters, "floatingMap.destroyExistingRuntimeRoot"),
    "Island create=" + sumCountersByPrefix(payload.counters, "floatingMap.createIsland:") +
      " destroy=" + formatCounter(payload.counters, "floatingMap.destroyIsland") +
      " scrollTick=" + formatCounter(payload.counters, "floatingMap.scrollTimerTick") +
      " inertiaTick=" + formatCounter(payload.counters, "floatingMap.inertiaTimerTick"),
    "Bundle loads=" + formatCounter(payload.counters, "bundle.loadBundle:resources") +
      " mapLoad=" + formatCounter(payload.counters, "bundle.loadBundle:map") +
      " topStatus=" + formatCounter(payload.counters, "levelSelect.updateTopStatus") +
      " staminaTick=" + formatCounter(payload.counters, "levelSelect.staminaTickerTick"),
    formatTopCounters(payload.counters)
  ].join("\n");
}

function updateOverlay(payload) {
  if (!overlayNode || !cc.isValid(overlayNode) || !overlayLabel) {
    return;
  }
  overlayLabel.string = formatOverlayText(payload);
}

function cloneCounters() {
  var snapshot = {};
  Object.keys(counters).sort().forEach(function (key) {
    snapshot[key] = counters[key];
  });
  counters = {};
  return snapshot;
}

function report() {
  if (isActive !== true) {
    return;
  }
  var ccRef = requireCc();
  var payload = {
    intervalMs: REPORT_INTERVAL_MS,
    counters: cloneCounters(),
    assets: createAssetSnapshot()
  };
  updateOverlay(payload);
  ccRef.warn("[LevelSelectMemoryDiagnostics]", JSON.stringify(payload));
}

function start(hostNode) {
  isActive = true;
  ensureOverlay(hostNode);
  if (reportTimer !== null) {
    return;
  }
  reportTimer = setInterval(report, REPORT_INTERVAL_MS);
}

function stop() {
  isActive = false;
  counters = {};
  destroyOverlay();
  if (reportTimer === null) {
    return;
  }
  clearInterval(reportTimer);
  reportTimer = null;
}

function increment(name, amount) {
  if (isActive !== true) {
    return;
  }
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("LevelSelectMemoryDiagnostics counter name must be a non-empty string.");
  }
  var value = amount === undefined ? 1 : amount;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("LevelSelectMemoryDiagnostics counter amount must be a finite number.");
  }
  counters[name] = (counters[name] || 0) + value;
}

module.exports = {
  start: start,
  stop: stop,
  increment: increment
};
