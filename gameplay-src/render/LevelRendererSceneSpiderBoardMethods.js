"use strict";

var SPIDER_ENTRANCE_DURATION_SECONDS = 2;
var SPIDER_ENTRANCE_OUTSIDE_MARGIN = 1;
var SPIDER_RENDER_SIZE = Object.freeze({ width: 66, height: 65 });

function requireFiniteNumber(value, description) {
  if (typeof value !== "number" || !isFinite(value)) {
    throw new Error(description + " must be a finite number.");
  }
  return value;
}

function resolveNearestScreenBoundaryStart(hostPosition, screenBounds, spiderSize) {
  if (!hostPosition || !screenBounds || !spiderSize) {
    throw new Error("Spider entrance boundary resolution requires host position, screen bounds and spider size.");
  }
  var hostX = requireFiniteNumber(hostPosition.x, "Spider entrance host x");
  var hostY = requireFiniteNumber(hostPosition.y, "Spider entrance host y");
  var left = requireFiniteNumber(screenBounds.left, "Spider entrance screen left");
  var right = requireFiniteNumber(screenBounds.right, "Spider entrance screen right");
  var bottom = requireFiniteNumber(screenBounds.bottom, "Spider entrance screen bottom");
  var top = requireFiniteNumber(screenBounds.top, "Spider entrance screen top");
  var width = requireFiniteNumber(spiderSize.width, "Spider entrance sprite width");
  var height = requireFiniteNumber(spiderSize.height, "Spider entrance sprite height");
  if (right <= left || top <= bottom || width <= 0 || height <= 0) {
    throw new Error("Spider entrance screen bounds and sprite size must be positive.");
  }
  if (hostX < left || hostX > right || hostY < bottom || hostY > top) {
    throw new Error("Spider entrance host must be inside the screen bounds.");
  }

  var candidates = [
    {
      edge: "left",
      distance: hostX - left,
      position: { x: left - width * 0.5 - SPIDER_ENTRANCE_OUTSIDE_MARGIN, y: hostY }
    },
    {
      edge: "right",
      distance: right - hostX,
      position: { x: right + width * 0.5 + SPIDER_ENTRANCE_OUTSIDE_MARGIN, y: hostY }
    },
    {
      edge: "bottom",
      distance: hostY - bottom,
      position: { x: hostX, y: bottom - height * 0.5 - SPIDER_ENTRANCE_OUTSIDE_MARGIN }
    },
    {
      edge: "top",
      distance: top - hostY,
      position: { x: hostX, y: top + height * 0.5 + SPIDER_ENTRANCE_OUTSIDE_MARGIN }
    }
  ];
  var nearest = candidates[0];
  candidates.slice(1).forEach(function (candidate) {
    if (candidate.distance < nearest.distance) {
      nearest = candidate;
    }
  });
  return nearest;
}

function attachLevelRendererSceneSpiderBoardMethods(LevelRenderer, context) {
  var BALL_RESOURCES = context.BALL_RESOURCES;
  var ensureSprite = context.ensureSprite;

  LevelRenderer.prototype._getSpiderEntranceScreenBounds = function () {
    if (!this.layers || !this.layers.spiderLock || !this.layers.spiderLock.isValid) {
      throw new Error("Spider entrance screen bounds require SpiderLockLayer.");
    }
    var layer = this.layers.spiderLock;
    if (typeof layer.getContentSize !== "function") {
      throw new Error("SpiderLockLayer must expose getContentSize for entrance bounds.");
    }
    var size = layer.getContentSize();
    if (
      !size ||
      typeof size.width !== "number" ||
      !isFinite(size.width) ||
      size.width <= 0 ||
      typeof size.height !== "number" ||
      !isFinite(size.height) ||
      size.height <= 0
    ) {
      throw new Error("SpiderLockLayer entrance bounds require positive content size.");
    }
    requireFiniteNumber(layer.anchorX, "SpiderLockLayer anchorX");
    requireFiniteNumber(layer.anchorY, "SpiderLockLayer anchorY");
    return {
      left: -size.width * layer.anchorX,
      right: size.width * (1 - layer.anchorX),
      bottom: -size.height * layer.anchorY,
      top: size.height * (1 - layer.anchorY)
    };
  };

  LevelRenderer.prototype.hasPendingSpiderEntrance = function () {
    if (["none", "pending", "active", "complete"].indexOf(this.spiderEntranceState) < 0) {
      throw new Error("Spider entrance state is invalid: " + this.spiderEntranceState);
    }
    return this.spiderEntranceState === "pending";
  };

  LevelRenderer.prototype.playSpiderEntrance = function () {
    if (this.spiderEntranceState !== "pending") {
      throw new Error("Spider entrance can only start from pending state.");
    }
    if (!this.spiderEntranceTargets || typeof this.spiderEntranceTargets !== "object") {
      throw new Error("Spider entrance targets must be initialized.");
    }
    if (!this.spiderNodes || typeof this.spiderNodes !== "object") {
      throw new Error("Spider entrance nodes must be initialized.");
    }
    if (
      typeof cc.sequence !== "function" ||
      typeof cc.moveTo !== "function" ||
      typeof cc.callFunc !== "function"
    ) {
      throw new Error("Spider entrance requires Cocos action APIs.");
    }

    var spiderIds = Object.keys(this.spiderEntranceTargets);
    if (!spiderIds.length) {
      throw new Error("Pending spider entrance requires at least one target.");
    }
    spiderIds.forEach(function (spiderId) {
      var node = this.spiderNodes[spiderId];
      if (!node || !node.isValid) {
        throw new Error("Spider entrance node is missing: " + spiderId + ".");
      }
      var target = this.spiderEntranceTargets[spiderId];
      requireFiniteNumber(target.x, "Spider entrance target x");
      requireFiniteNumber(target.y, "Spider entrance target y");
    }, this);

    this.spiderEntranceState = "active";
    var self = this;
    var remaining = spiderIds.length;
    return new Promise(function (resolve) {
      spiderIds.forEach(function (spiderId) {
        var node = self.spiderNodes[spiderId];
        var target = self.spiderEntranceTargets[spiderId];
        node.stopAllActions();
        node.runAction(cc.sequence(
          cc.moveTo(SPIDER_ENTRANCE_DURATION_SECONDS, target.x, target.y),
          cc.callFunc(function () {
            remaining -= 1;
            if (remaining === 0) {
              self.spiderEntranceState = "complete";
              resolve({
                durationSeconds: SPIDER_ENTRANCE_DURATION_SECONDS,
                spiderIds: spiderIds.slice()
              });
            }
          })
        ));
      });
    });
  };

  LevelRenderer.prototype._renderSpiderLocks = function (boardSnapshot) {
    if (!boardSnapshot || !Array.isArray(boardSnapshot.spiderRows)) {
      throw new Error("Spider lock rendering requires boardSnapshot.spiderRows.");
    }
    if (!this.layers || !this.layers.spiderLock || !this.layers.spiderLock.isValid) {
      throw new Error("Spider lock rendering requires SpiderLockLayer.");
    }
    if (!this.spiderWebNodes || typeof this.spiderWebNodes !== "object" ||
        !this.spiderNodes || typeof this.spiderNodes !== "object" ||
        !this.spiderEntranceTargets || typeof this.spiderEntranceTargets !== "object") {
      throw new Error("Spider lock render node maps must be initialized.");
    }
    if (["none", "pending", "active", "complete"].indexOf(this.spiderEntranceState) < 0) {
      throw new Error("Spider lock render received invalid entrance state: " + this.spiderEntranceState);
    }
    var webFrame = this.spriteFrameCache[BALL_RESOURCES.COBWEB];
    var spiderFrame = this.spriteFrameCache[BALL_RESOURCES.SPIDER];
    if (boardSnapshot.spiderRows.length && (!webFrame || !spiderFrame)) {
      throw new Error("Spider and cobweb sprites must be preloaded before board rendering.");
    }
    this.spiderLockRenderTick += 1;
    var renderTick = this.spiderLockRenderTick;
    var entranceBounds = this.spiderEntranceState === "pending"
      ? this._getSpiderEntranceScreenBounds()
      : null;
    var nextEntranceTargets = {};

    boardSnapshot.spiderRows.forEach(function (spiderRow, rowIndex) {
      if (
        !spiderRow ||
        typeof spiderRow.lockRowId !== "string" ||
        !spiderRow.lockRowId ||
        !Number.isInteger(spiderRow.row) ||
        !spiderRow.position ||
        typeof spiderRow.position.y !== "number" ||
        !isFinite(spiderRow.position.y) ||
        !Array.isArray(spiderRow.spiders) ||
        !spiderRow.spiders.length
      ) {
        throw new Error("Spider row snapshot is invalid at index " + rowIndex + ".");
      }
      var webNode = this.spiderWebNodes[spiderRow.lockRowId];
      if (!webNode || !webNode.isValid) {
        webNode = new cc.Node("Cobweb_" + spiderRow.lockRowId);
        webNode.parent = this.layers.spiderLock;
        this.spiderWebNodes[spiderRow.lockRowId] = webNode;
      }
      var webSprite = ensureSprite(webNode);
      webSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      webSprite.spriteFrame = webFrame;
      webNode.setContentSize(720, 102);
      webNode.setPosition(0, spiderRow.position.y);
      webNode.zIndex = 0;
      webNode.active = true;
      webNode.__spiderLockTick = renderTick;

      spiderRow.spiders.forEach(function (spider, spiderIndex) {
        if (
          !spider ||
          typeof spider.id !== "string" ||
          !spider.id ||
          spider.lockRowId !== spiderRow.lockRowId ||
          spider.row !== spiderRow.row ||
          !spider.position ||
          typeof spider.position.x !== "number" ||
          !isFinite(spider.position.x) ||
          typeof spider.position.y !== "number" ||
          !isFinite(spider.position.y)
        ) {
          throw new Error("Spider snapshot is invalid at row " + rowIndex + ", index " + spiderIndex + ".");
        }
        var spiderNode = this.spiderNodes[spider.id];
        if (!spiderNode || !spiderNode.isValid) {
          if (this.spiderEntranceState === "active") {
            throw new Error("Cannot create a spider node while its entrance is active: " + spider.id + ".");
          }
          spiderNode = new cc.Node("Spider_" + spider.id);
          spiderNode.parent = this.layers.spiderLock;
          this.spiderNodes[spider.id] = spiderNode;
        }
        var spiderSprite = ensureSprite(spiderNode);
        spiderSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        spiderSprite.spriteFrame = spiderFrame;
        spiderNode.setContentSize(SPIDER_RENDER_SIZE.width, SPIDER_RENDER_SIZE.height);
        nextEntranceTargets[spider.id] = {
          x: spider.position.x,
          y: spider.position.y
        };
        if (this.spiderEntranceState === "pending") {
          var entranceStart = resolveNearestScreenBoundaryStart(
            spider.position,
            entranceBounds,
            SPIDER_RENDER_SIZE
          );
          spiderNode.stopAllActions();
          spiderNode.setPosition(entranceStart.position.x, entranceStart.position.y);
          spiderNode.__spiderEntranceEdge = entranceStart.edge;
        } else if (this.spiderEntranceState !== "active") {
          spiderNode.setPosition(spider.position.x, spider.position.y);
        }
        spiderNode.zIndex = 1;
        spiderNode.active = true;
        spiderNode.__spiderLockTick = renderTick;
      }, this);
    }, this);

    Object.keys(this.spiderWebNodes).forEach(function (lockRowId) {
      var node = this.spiderWebNodes[lockRowId];
      if (!node || !node.isValid || node.__spiderLockTick !== renderTick) {
        if (node && node.isValid) {
          node.destroy();
        }
        delete this.spiderWebNodes[lockRowId];
      }
    }, this);
    Object.keys(this.spiderNodes).forEach(function (spiderId) {
      var node = this.spiderNodes[spiderId];
      if (!node || !node.isValid || node.__spiderLockTick !== renderTick) {
        if (node && node.isValid) {
          node.destroy();
        }
        delete this.spiderNodes[spiderId];
      }
    }, this);
    this.spiderEntranceTargets = nextEntranceTargets;
  };

  var renderBoardWithoutSpiderLocks = LevelRenderer.prototype._renderBoard;
  if (typeof renderBoardWithoutSpiderLocks !== "function") {
    throw new Error("Spider board methods require LevelRenderer._renderBoard.");
  }
  LevelRenderer.prototype._renderBoard = function (boardSnapshot) {
    renderBoardWithoutSpiderLocks.call(this, boardSnapshot);
    this._renderSpiderLocks(boardSnapshot);
  };
}

attachLevelRendererSceneSpiderBoardMethods.SPIDER_ENTRANCE_DURATION_SECONDS = SPIDER_ENTRANCE_DURATION_SECONDS;
attachLevelRendererSceneSpiderBoardMethods.SPIDER_ENTRANCE_OUTSIDE_MARGIN = SPIDER_ENTRANCE_OUTSIDE_MARGIN;
attachLevelRendererSceneSpiderBoardMethods.SPIDER_RENDER_SIZE = SPIDER_RENDER_SIZE;
attachLevelRendererSceneSpiderBoardMethods.resolveNearestScreenBoundaryStart = resolveNearestScreenBoundaryStart;

module.exports = attachLevelRendererSceneSpiderBoardMethods;
