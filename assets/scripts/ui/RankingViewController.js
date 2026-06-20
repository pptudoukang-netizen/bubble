"use strict";

var BundleLoader = require("../utils/BundleLoader");
var Logger = require("../utils/Logger");
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");

var ROOT_WIDTH = 720;
var ROOT_HEIGHT = 1280;
var LIST_WIDTH = 590;
var LIST_HEIGHT = 826;
var ROW_WIDTH = 590;
var ROW_HEIGHT = 143;
var ROW_GAP = 8;
var ROW_STRIDE = ROW_HEIGHT + ROW_GAP;
var ROW_POOL_BUFFER = 2;
var MIN_ROW_POOL_SIZE = 6;
var RANKING_ITEM_PREFAB_PATH = "prefabs/ui/RankingItem";
var RANKING_STATIC_PROXY_ROOT_NAME = "ranking_static_proxy_root";
var RANKING_ROW_PROXY_ROOT_NAME = "ranking_row_proxy_root";
var RANKING_STATIC_PROXY_LAYER_NAMES = {
  panel: "ranking_proxy_panel_layer",
  chrome: "ranking_proxy_chrome_layer"
};
var RANKING_ROW_PROXY_LAYER_NAMES = {
  background: "ranking_proxy_row_background_layer",
  badge: "ranking_proxy_row_badge_layer",
  avatarFrame: "ranking_proxy_row_avatar_frame_layer"
};

var TEXT = {
  scoreSuffix: "",
  levelSuffix: "\u5173"
};

var SPRITE_PATHS = {
  rank1Badge: "image/ranking/1",
  rank2Badge: "image/ranking/2",
  rank3Badge: "image/ranking/3",
  itemBg1: "image/ranking/item_bg_1",
  itemBg2: "image/ranking/item_bg_2"
};
var AVATAR_SPRITE_FRAME_CACHE = {};
var AVATAR_LOAD_PROMISES = {};

function createSpriteFrameFromImage(image) {
  var texture = new cc.Texture2D();
  texture.initWithElement(image);
  texture.handleLoadedTexture();
  return new cc.SpriteFrame(texture);
}

function findNodeByNameRecursive(rootNode, name) {
  if (!rootNode || !rootNode.isValid) {
    return null;
  }
  if (rootNode.name === name) {
    return rootNode;
  }

  var children = rootNode.children;
  if (!Array.isArray(children)) {
    throw new Error("RankingView node children must be an array: " + rootNode.name);
  }
  for (var i = 0; i < children.length; i += 1) {
    var found = findNodeByNameRecursive(children[i], name);
    if (found) {
      return found;
    }
  }
  return null;
}

function bindTapOnce(node, onTap) {
  if (!node || !node.isValid || node.__rankingTapBound === true) {
    return;
  }

  node.__rankingTapBound = true;
  node.on(cc.Node.EventType.TOUCH_START, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 0.96;
  });
  node.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 1;
  });
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 1;
    if (typeof onTap === "function") {
      onTap();
    }
  });
}

function bindCloseAreaOnce(node, onTap) {
  if (!node || !node.isValid || node.__rankingCloseAreaBound === true) {
    return;
  }

  node.__rankingCloseAreaBound = true;
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    if (typeof onTap === "function") {
      onTap();
    }
  });
}

function loadSpriteFrame(path) {
  return new Promise(function (resolve) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error || !spriteFrame) {
        Logger.warn("Load ranking sprite failed", path, error && error.message ? error.message : error);
        resolve(null);
        return;
      }
      resolve(spriteFrame);
    });
  });
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

function getScrollOffsetY(scrollView) {
  if (!scrollView || typeof scrollView.getScrollOffset !== "function") {
    return 0;
  }

  var offset = scrollView.getScrollOffset();
  return Math.max(0, Math.floor(Number(offset && offset.y) || 0));
}

function setSpriteFrame(sprite, spriteFrame) {
  if (!sprite || !sprite.node || !sprite.node.isValid || !spriteFrame) {
    return;
  }
  sprite.spriteFrame = spriteFrame;
  if (cc.Sprite && cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }
}

function setDefaultAvatarSpriteFrame(sprite, spriteFrame) {
  if (!sprite || !sprite.node || !sprite.node.isValid) {
    throw new Error("Ranking default avatar sprite is required.");
  }
  if (!spriteFrame) {
    throw new Error("Ranking default avatar SpriteFrame is required.");
  }
  sprite.node.__rankingAvatarUrl = "";
  setSpriteFrame(sprite, spriteFrame);
}

function createSpriteFrameFromRemoteAsset(imageAsset, imageUrl) {
  if (imageAsset instanceof cc.SpriteFrame) {
    return imageAsset;
  }
  if (imageAsset instanceof cc.Texture2D) {
    return new cc.SpriteFrame(imageAsset);
  }
  if (imageAsset._texture instanceof cc.Texture2D) {
    return new cc.SpriteFrame(imageAsset._texture);
  }
  if (imageAsset._nativeAsset) {
    return createSpriteFrameFromImage(imageAsset._nativeAsset);
  }
  throw new Error("Unsupported ranking avatar asset: " + imageUrl);
}

function loadSpriteFrameFromWxImage(imageUrl) {
  return new Promise(function (resolve, reject) {
    var image = wx.createImage();
    image.onload = function () {
      resolve(createSpriteFrameFromImage(image));
    };
    image.onerror = function (error) {
      reject(new Error("Load ranking avatar with wx.createImage failed: " + imageUrl + ", " + JSON.stringify(error)));
    };
    image.src = imageUrl;
  });
}

function loadSpriteFrameFromAssetManager(imageUrl) {
  return new Promise(function (resolve, reject) {
    cc.assetManager.loadRemote(imageUrl, function (error, imageAsset) {
      if (error || !imageAsset) {
        reject(new Error("Load ranking avatar failed: " + imageUrl));
        return;
      }
      resolve(createSpriteFrameFromRemoteAsset(imageAsset, imageUrl));
    });
  });
}

function loadAvatarSpriteFrame(imageUrl) {
  if (typeof wx !== "undefined" && wx && typeof wx.createImage === "function") {
    return loadSpriteFrameFromWxImage(imageUrl);
  }
  return loadSpriteFrameFromAssetManager(imageUrl);
}

function setSpriteRemoteImage(sprite, imageUrl) {
  if (!sprite || !sprite.node || !sprite.node.isValid) {
    throw new Error("Ranking avatar sprite is required.");
  }
  if (typeof imageUrl !== "string" || !imageUrl) {
    return;
  }

  var targetNode = sprite.node;
  targetNode.__rankingAvatarUrl = imageUrl;
  if (AVATAR_SPRITE_FRAME_CACHE[imageUrl]) {
    if (!targetNode.isValid || targetNode.__rankingAvatarUrl !== imageUrl) {
      return;
    }
    sprite.spriteFrame = AVATAR_SPRITE_FRAME_CACHE[imageUrl];
    if (cc.Sprite && cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
      sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    }
    return;
  }

  if (!AVATAR_LOAD_PROMISES[imageUrl]) {
    AVATAR_LOAD_PROMISES[imageUrl] = loadAvatarSpriteFrame(imageUrl).then(function (spriteFrame) {
      AVATAR_SPRITE_FRAME_CACHE[imageUrl] = spriteFrame;
      delete AVATAR_LOAD_PROMISES[imageUrl];
      return spriteFrame;
    }).catch(function (error) {
      delete AVATAR_LOAD_PROMISES[imageUrl];
      throw error;
    });
  }

  sprite.spriteFrame = null;
  AVATAR_LOAD_PROMISES[imageUrl].then(function (spriteFrame) {
    if (!targetNode.isValid || targetNode.__rankingAvatarUrl !== imageUrl) {
      return;
    }
    sprite.spriteFrame = spriteFrame;
    if (cc.Sprite && cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
      sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    }
  });
}

function RankingViewController(options) {
  options = options || {};
  this.node = options.node || null;
  this.onClose = typeof options.onClose === "function" ? options.onClose : function () {};
  this._entries = [];
  this._rowPool = [];
  this._rankingItemPrefab = options.rankingItemPrefab || null;
  this._rankingItemPrefabLoadPromise = null;
  this._spriteFrames = null;
  this._spriteFrameLoadPromise = null;
  this._staticProxyRoot = null;
  this._staticProxyLayers = {};
  this._staticProxyRecords = [];
  this._rowProxyRoot = null;
  this._rowProxyLayers = {};
  this._rowProxyRecords = [];
  this._nodes = this._resolveNodes();
  this._bindActions();
  this.ensureSpriteFrames();
  this.ensureRankingItemPrefab();
}

RankingViewController.prototype._resolveNodes = function () {
  if (!this.node || !this.node.isValid) {
    return {};
  }

  this.node.setContentSize(ROOT_WIDTH, ROOT_HEIGHT);
  if (!this.node.getComponent(cc.BlockInputEvents)) {
    this.node.addComponent(cc.BlockInputEvents);
  }

  var mask = findNodeByNameRecursive(this.node, "mask");
  var panel = findNodeByNameRecursive(this.node, "Panel");
  var closeButton = panel ? findNodeByNameRecursive(panel, "btn_close") : null;
  if (!mask || !panel || !closeButton) {
    Logger.warn("RankingView prefab structure is incomplete.");
    return {};
  }

  var scrollNodes = this._ensureScrollView(panel);
  if (!scrollNodes) {
    Logger.warn("RankingView listview is missing.");
    return {};
  }
  var emptyLabel = findNodeByNameRecursive(panel, "empty_label");
  if (emptyLabel) {
    emptyLabel.active = false;
  }

  this.node.__rankingNodes = {
    mask: mask,
    panel: panel,
    closeButton: closeButton,
    scrollView: scrollNodes.scrollView,
    viewport: scrollNodes.viewport,
    content: scrollNodes.content,
    emptyLabel: emptyLabel
  };

  return this.node.__rankingNodes;
};

RankingViewController.prototype._ensureScrollView = function (panel) {
  var scrollNode = findNodeByNameRecursive(panel, "listview");
  if (!scrollNode) {
    return null;
  }

  var listWidth = Math.max(1, scrollNode.width || LIST_WIDTH);
  var listHeight = Math.max(1, scrollNode.height || LIST_HEIGHT);
  var scrollView = scrollNode.getComponent(cc.ScrollView) || scrollNode.addComponent(cc.ScrollView);
  scrollView.horizontal = false;
  scrollView.vertical = true;
  scrollView.inertia = true;
  scrollView.brake = 0.55;
  scrollView.elastic = true;
  scrollView.bounceDuration = 0.23;
  scrollView.scrollEvents = [];

  var viewport = scrollNode.getChildByName("view") || scrollNode.getChildByName("View") || scrollNode.getChildByName("Viewport");
  if (!viewport) {
    viewport = new cc.Node("view");
    viewport.parent = scrollNode;
  }
  viewport.name = "view";
  viewport.setContentSize(listWidth, listHeight);
  viewport.setPosition(0, 0);
  var mask = viewport.getComponent(cc.Mask) || viewport.addComponent(cc.Mask);
  mask.type = cc.Mask.Type.RECT;

  var content = viewport.getChildByName("content") || viewport.getChildByName("Content");
  if (!content) {
    content = new cc.Node("content");
    content.parent = viewport;
  }
  content.name = "content";
  content.setAnchorPoint(0.5, 0.5);
  content.setContentSize(listWidth, listHeight);
  content.setPosition(0, 0);

  scrollView.content = content;
  scrollView.node.off(cc.ScrollView.EventType.SCROLLING, this._updateVirtualRows, this);
  scrollView.node.on(cc.ScrollView.EventType.SCROLLING, this._updateVirtualRows, this);
  scrollView.node.off(cc.ScrollView.EventType.SCROLL_ENDED, this._updateVirtualRows, this);
  scrollView.node.on(cc.ScrollView.EventType.SCROLL_ENDED, this._updateVirtualRows, this);

  return {
    scrollView: scrollView,
    viewport: viewport,
    content: content
  };
};

RankingViewController.prototype._bindActions = function () {
  if (!this.node || !this.node.isValid) {
    return;
  }

  bindTapOnce(this._nodes.closeButton, this.onClose);
  bindCloseAreaOnce(this._nodes.mask, this.onClose);
  if (this._nodes.closeButton && this._nodes.closeButton.isValid) {
    this._bindProxySyncToNode(this._nodes.closeButton);
  }
};

RankingViewController.prototype._bindProxySyncToNode = function (node) {
  if (!node || !node.isValid) {
    throw new Error("RankingView proxy sync node is invalid.");
  }
  if (node.__rankingProxySyncBound === true) {
    return;
  }
  node.__rankingProxySyncBound = true;
  node.on(cc.Node.EventType.TOUCH_START, function () {
    this._syncRenderProxies();
  }, this);
  node.on(cc.Node.EventType.TOUCH_CANCEL, function () {
    this._syncRenderProxies();
  }, this);
  node.on(cc.Node.EventType.TOUCH_END, function () {
    this._syncRenderProxies();
  }, this);
};

RankingViewController.prototype._ensureStaticProxyLayers = function () {
  if (this._staticProxyRoot && this._staticProxyRoot.isValid) {
    return;
  }
  var root = SpriteProxyLayerHelper.createProxyRoot(this._nodes.panel, {
    name: RANKING_STATIC_PROXY_ROOT_NAME,
    zIndex: -1
  });
  this._staticProxyRoot = root;
  this._staticProxyLayers = SpriteProxyLayerHelper.createProxyLayers(root, [
    { key: "panel", name: RANKING_STATIC_PROXY_LAYER_NAMES.panel, zIndex: 0 },
    { key: "chrome", name: RANKING_STATIC_PROXY_LAYER_NAMES.chrome, zIndex: 1 }
  ]);
};

RankingViewController.prototype._ensureRowProxyLayers = function () {
  var content = this._nodes.content;
  if (!content || !content.isValid) {
    throw new Error("RankingView row proxy requires content node.");
  }
  if (!this._rowProxyRoot || !this._rowProxyRoot.isValid) {
    this._rowProxyRoot = SpriteProxyLayerHelper.createProxyRoot(content, {
      name: RANKING_ROW_PROXY_ROOT_NAME,
      zIndex: -1
    });
    this._rowProxyLayers = SpriteProxyLayerHelper.createProxyLayers(this._rowProxyRoot, [
      { key: "background", name: RANKING_ROW_PROXY_LAYER_NAMES.background, zIndex: 0 },
      { key: "badge", name: RANKING_ROW_PROXY_LAYER_NAMES.badge, zIndex: 1 },
      { key: "avatarFrame", name: RANKING_ROW_PROXY_LAYER_NAMES.avatarFrame, zIndex: 2 }
    ]);
  }
  var contentSize = SpriteProxyLayerHelper.requireNodeSize(content, "RankingView content");
  this._rowProxyRoot.setContentSize(contentSize.width, contentSize.height);
  Object.keys(this._rowProxyLayers).forEach(function (key) {
    this._rowProxyLayers[key].setContentSize(contentSize.width, contentSize.height);
  }, this);
};

RankingViewController.prototype._createStaticProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._staticProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("RankingView static proxy layer is invalid: " + layerKey);
  }
  this._staticProxyRecords.push(SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._staticProxyRoot,
    name: name,
    visible: visible === true
  }));
};

RankingViewController.prototype._createRowProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._rowProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("RankingView row proxy layer is invalid: " + layerKey);
  }
  this._rowProxyRecords.push(SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._rowProxyRoot,
    name: name,
    visible: visible === true
  }));
};

RankingViewController.prototype._collectSpriteNodes = function (rootNode, output) {
  if (!rootNode || !rootNode.isValid) {
    throw new Error("RankingView collect sprite root node is invalid.");
  }
  if (!Array.isArray(output)) {
    throw new Error("RankingView collect sprite output must be an array.");
  }
  if (rootNode.getComponent(cc.Sprite)) {
    output.push(rootNode);
  }
  var children = rootNode.children;
  if (!Array.isArray(children)) {
    throw new Error("RankingView collect sprite children must be an array: " + rootNode.name);
  }
  children.forEach(function (child) {
    this._collectSpriteNodes(child, output);
  }, this);
};

RankingViewController.prototype._rebuildStaticRenderProxies = function () {
  if (!this._nodes || !this._nodes.panel || !this._nodes.panel.isValid) {
    throw new Error("RankingView static proxy requires panel node.");
  }
  this._ensureStaticProxyLayers();
  SpriteProxyLayerHelper.clearRecords(this._staticProxyRecords);
  var titleBgNode = findNodeByNameRecursive(this._nodes.panel, "title_bg");
  var decorateNode = findNodeByNameRecursive(this._nodes.panel, "decorate");
  if (!titleBgNode || !decorateNode) {
    throw new Error("RankingView static proxy requires title_bg and decorate nodes.");
  }
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.panel, false, "RankingView Panel background");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.closeButton, false, "RankingView close button");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(titleBgNode, false, "RankingView title_bg");
  this._createStaticProxyRecord("panel", this._nodes.panel, "ranking_panel_bg_proxy", true);
  this._createStaticProxyRecord("chrome", this._nodes.closeButton, "ranking_close_button_proxy", true);
  this._createStaticProxyRecord("chrome", titleBgNode, "ranking_title_bg_proxy", true);
  var decorateSprites = [];
  this._collectSpriteNodes(decorateNode, decorateSprites);
  decorateSprites.forEach(function (spriteNode, index) {
    SpriteProxyLayerHelper.setSpriteRenderEnabled(spriteNode, false, "RankingView decorate sprite");
    this._createStaticProxyRecord("chrome", spriteNode, "ranking_decorate_proxy_" + index, true);
  }, this);
};

RankingViewController.prototype._hideRowSourceSprites = function (row) {
  var refs = row.__rankingRow;
  if (!refs) {
    throw new Error("RankingView row refs are required before proxying.");
  }
  if (refs.bgSprite) {
    refs.bgSprite.enabled = false;
  }
  if (refs.badgeSprite) {
    refs.badgeSprite.enabled = false;
  }
  if (refs.avatarFrameSprite) {
    refs.avatarFrameSprite.enabled = false;
  }
};

RankingViewController.prototype._rebuildRowRenderProxies = function () {
  if (!this._nodes || !this._nodes.content || !this._nodes.content.isValid) {
    return;
  }
  this._ensureRowProxyLayers();
  SpriteProxyLayerHelper.clearRecords(this._rowProxyRecords);
  this._rowPool.forEach(function (row, index) {
    if (!row || !row.isValid || row.active !== true) {
      return;
    }
    var refs = row.__rankingRow;
    if (!refs) {
      throw new Error("RankingView row refs are required for proxy: " + row.name);
    }
    this._hideRowSourceSprites(row);
    this._createRowProxyRecord("background", row, "ranking_row_bg_proxy_" + index, true);
    this._createRowProxyRecord("badge", refs.badgeNode, "ranking_row_badge_proxy_" + index, refs.badgeNode && refs.badgeNode.active === true);
    this._createRowProxyRecord("avatarFrame", refs.avatarFrameNode, "ranking_row_avatar_frame_proxy_" + index, true);
  }, this);
};

RankingViewController.prototype._syncRenderProxies = function () {
  if (this._staticProxyRoot && this._staticProxyRoot.isValid) {
    SpriteProxyLayerHelper.syncRecords(this._staticProxyRecords, this._staticProxyRoot);
  }
  if (this._rowProxyRoot && this._rowProxyRoot.isValid) {
    SpriteProxyLayerHelper.syncRecords(this._rowProxyRecords, this._rowProxyRoot);
  }
};

RankingViewController.prototype.ensureSpriteFrames = function () {
  if (this._spriteFrames) {
    return Promise.resolve(this._spriteFrames);
  }
  if (this._spriteFrameLoadPromise) {
    return this._spriteFrameLoadPromise;
  }

  var keys = Object.keys(SPRITE_PATHS);
  this._spriteFrameLoadPromise = Promise.all(keys.map(function (key) {
    return loadSpriteFrame(SPRITE_PATHS[key]).then(function (spriteFrame) {
      return {
        key: key,
        spriteFrame: spriteFrame
      };
    });
  })).then(function (results) {
    var spriteFrames = {};
    results.forEach(function (result) {
      spriteFrames[result.key] = result.spriteFrame;
    });
    this._spriteFrames = spriteFrames;
    this._spriteFrameLoadPromise = null;
    this._updateVirtualRows();
    return spriteFrames;
  }.bind(this)).catch(function (error) {
    this._spriteFrameLoadPromise = null;
    Logger.warn("Load ranking sprites failed", error && error.message ? error.message : error);
    return null;
  }.bind(this));

  return this._spriteFrameLoadPromise;
};

RankingViewController.prototype.ensureRankingItemPrefab = function () {
  if (this._rankingItemPrefab) {
    return Promise.resolve(this._rankingItemPrefab);
  }
  if (this._rankingItemPrefabLoadPromise) {
    return this._rankingItemPrefabLoadPromise;
  }

  this._rankingItemPrefabLoadPromise = new Promise(function (resolve) {
    BundleLoader.loadRes(RANKING_ITEM_PREFAB_PATH, cc.Prefab, function (error, prefab) {
      this._rankingItemPrefabLoadPromise = null;
      if (error || !prefab) {
        Logger.warn("Load ranking item prefab failed", error && error.message ? error.message : error);
        resolve(null);
        return;
      }

      this._rankingItemPrefab = prefab;
      this._rebuildRowsFromPrefab();
      this._updateVirtualRows();
      resolve(prefab);
    }.bind(this));
  }.bind(this));

  return this._rankingItemPrefabLoadPromise;
};

RankingViewController.prototype._rebuildRowsFromPrefab = function () {
  if (!this._rankingItemPrefab || this._rowPool.length === 0) {
    return;
  }

  SpriteProxyLayerHelper.clearRecords(this._rowProxyRecords);
  this._rowPool.forEach(function (rowNode) {
    if (rowNode && rowNode.isValid) {
      rowNode.destroy();
    }
  });
  this._rowPool = [];
  this._ensureRowPool();
};

RankingViewController.prototype.render = function (entries) {
  var safeEntries = Array.isArray(entries) ? entries.slice() : [];
  this._entries = safeEntries;

  var content = this._nodes.content;
  var emptyLabel = this._nodes.emptyLabel;
  var scrollNode = this._nodes.scrollView ? this._nodes.scrollView.node : null;
  if (!content || !content.isValid) {
    return;
  }

  if (emptyLabel) {
    emptyLabel.active = safeEntries.length === 0;
  }
  if (scrollNode) {
    scrollNode.active = safeEntries.length > 0;
  }
  if (safeEntries.length === 0) {
    this._rowPool.forEach(function (rowNode) {
      rowNode.active = false;
    });
    SpriteProxyLayerHelper.clearRecords(this._rowProxyRecords);
    this._rebuildStaticRenderProxies();
    return;
  }

  this._rebuildStaticRenderProxies();
  var contentHeight = Math.max(LIST_HEIGHT, (safeEntries.length * ROW_STRIDE) - ROW_GAP);
  content.setContentSize(LIST_WIDTH, contentHeight);
  content.setPosition(0, Math.min(0, (LIST_HEIGHT - contentHeight) * 0.5));
  this.ensureRankingItemPrefab().then(function () {
    this._ensureRowPool();
    if (this._nodes.scrollView && typeof this._nodes.scrollView.scrollToTop === "function") {
      this._nodes.scrollView.scrollToTop(0);
    }
    this._updateVirtualRows();
  }.bind(this));
};

RankingViewController.prototype._ensureRowPool = function () {
  var content = this._nodes.content;
  if (!content || !content.isValid || !this._rankingItemPrefab) {
    return;
  }

  var visibleCount = Math.ceil(LIST_HEIGHT / ROW_STRIDE) + ROW_POOL_BUFFER;
  var targetCount = Math.max(MIN_ROW_POOL_SIZE, Math.min(this._entries.length, visibleCount));
  while (this._rowPool.length < targetCount) {
    var row = this._createRankRow(content);
    if (!row) {
      return;
    }
    this._rowPool.push(row);
  }
};

RankingViewController.prototype._createRankRow = function (parentNode) {
  if (!this._rankingItemPrefab) {
    return null;
  }

  var prefabRow = cc.instantiate(this._rankingItemPrefab);
  prefabRow.parent = parentNode;
  prefabRow.setContentSize(ROW_WIDTH, ROW_HEIGHT);
  prefabRow.__rankingRow = this._cachePrefabRankRowRefs(prefabRow);
  return prefabRow;
};

RankingViewController.prototype._cachePrefabRankRowRefs = function (row) {
  var rankingNode = findNodeByNameRecursive(row, "ranking");
  var rankingNumNode = findNodeByNameRecursive(row, "ranking_num");
  var avatarNode = findNodeByNameRecursive(row, "avatar");
  var avatarFrameNode = findNodeByNameRecursive(row, "avatar_frame");
  var nameNode = findNodeByNameRecursive(row, "nick_name");
  var scoreNode = findNodeByNameRecursive(row, "score");
  var levelNode = findNodeByNameRecursive(row, "level");
  if (!rankingNode || !rankingNumNode || !avatarNode || !avatarFrameNode || !nameNode || !scoreNode || !levelNode) {
    Logger.warn("RankingItem prefab structure is incomplete.");
  }
  var avatarSprite = avatarNode ? avatarNode.getComponent(cc.Sprite) : null;
  if (avatarSprite && !avatarSprite.spriteFrame) {
    throw new Error("RankingItem avatar requires a default SpriteFrame.");
  }

  return {
    bgSprite: row.getComponent(cc.Sprite),
    badgeNode: rankingNode,
    badgeSprite: rankingNode ? rankingNode.getComponent(cc.Sprite) : null,
    avatarSprite: avatarSprite,
    defaultAvatarSpriteFrame: avatarSprite ? avatarSprite.spriteFrame : null,
    avatarFrameNode: avatarFrameNode,
    avatarFrameSprite: avatarFrameNode ? avatarFrameNode.getComponent(cc.Sprite) : null,
    rankingNumNode: rankingNumNode,
    rankingNumLabel: rankingNumNode ? rankingNumNode.getComponent(cc.Label) : null,
    nameLabel: nameNode ? nameNode.getComponent(cc.Label) : null,
    scoreLabel: scoreNode ? scoreNode.getComponent(cc.Label) : null,
    levelLabel: levelNode ? levelNode.getComponent(cc.Label) : null
  };
};

RankingViewController.prototype._updateVirtualRows = function () {
  if (!this._nodes || !this._nodes.content || !this._nodes.content.isValid) {
    return;
  }

  if (!this._entries.length) {
    return;
  }

  this._ensureRowPool();

  var scrollOffsetY = getScrollOffsetY(this._nodes.scrollView);
  var firstIndex = Math.floor(scrollOffsetY / ROW_STRIDE);
  var maxFirstIndex = Math.max(0, this._entries.length - this._rowPool.length);
  firstIndex = Math.max(0, Math.min(firstIndex, maxFirstIndex));

  for (var poolIndex = 0; poolIndex < this._rowPool.length; poolIndex += 1) {
    var entryIndex = firstIndex + poolIndex;
    var row = this._rowPool[poolIndex];
    if (entryIndex >= this._entries.length) {
      row.active = false;
      continue;
    }

    row.active = true;
    row.setPosition(0, (this._nodes.content.height * 0.5) - (ROW_HEIGHT * 0.5) - (entryIndex * ROW_STRIDE));
    this._renderRankRow(row, this._entries[entryIndex], entryIndex);
  }
  this._rebuildRowRenderProxies();
};

RankingViewController.prototype._renderRankRow = function (row, entry, index) {
  var refs = row.__rankingRow;
  if (!refs) {
    return;
  }

  var rank = Math.max(1, Math.floor(Number(entry && entry.rank) || (index + 1)));
  var score = Math.max(0, Math.floor(Number(entry && entry.score) || 0));
  var completedLevels = Math.max(0, Math.floor(Number(entry && entry.completedLevels) || 0));
  var nickname = String((entry && entry.nickname) || "");
  var avatarUrl = entry && typeof entry.avatarUrl === "string" ? entry.avatarUrl : "";
  var isSelf = !!(entry && entry.isSelf);
  var badgeKey = resolveRankBadgeKey(rank);
  var bgKey = resolveRowBgKey(rank);

  row.name = "RankRow" + rank;
  row.opacity = isSelf ? 255 : 245;
  row.color = isSelf ? cc.color(255, 255, 255, 255) : cc.color(245, 238, 255, 255);

  if (this._spriteFrames) {
    setSpriteFrame(refs.bgSprite, this._spriteFrames[bgKey]);
    setSpriteFrame(refs.badgeSprite, badgeKey ? this._spriteFrames[badgeKey] : null);
  }
  if (avatarUrl) {
    setSpriteRemoteImage(refs.avatarSprite, avatarUrl);
  } else {
    setDefaultAvatarSpriteFrame(refs.avatarSprite, refs.defaultAvatarSpriteFrame);
  }

  if (refs.badgeNode) {
    refs.badgeNode.active = !!badgeKey;
  }
  if (refs.rankingNumNode) {
    refs.rankingNumNode.active = !badgeKey;
  }
  if (refs.rankingNumLabel) {
    refs.rankingNumLabel.string = String(rank);
  }
  if (refs.nameLabel) {
    refs.nameLabel.string = nickname || "\u5fae\u4fe1\u7528\u6237";
    refs.nameLabel.node.color = cc.color(41, 18, 102);
  }
  if (refs.scoreLabel) {
    refs.scoreLabel.string = score + TEXT.scoreSuffix;
  }
  if (refs.levelLabel) {
    refs.levelLabel.string = "(" + completedLevels + TEXT.levelSuffix + ")";
  }
};

module.exports = RankingViewController;
