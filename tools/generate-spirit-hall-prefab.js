"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var SPIRIT_ROOT = path.join(PROJECT_ROOT, "assets", "spirit_system");
var PREFAB_PATH = path.join(SPIRIT_ROOT, "prefabs", "SpiritHallView.prefab");
var PREFAB_META_PATH = PREFAB_PATH + ".meta";
var PREFAB_UUID = "8c588f20-4bf3-49cf-a8a2-aec9fb770eea";
var TAB_BAR_PREFAB_PATH = path.join(SPIRIT_ROOT, "prefabs", "SpiritSystemTabBar.prefab");
var TAB_BAR_PREFAB_META_PATH = TAB_BAR_PREFAB_PATH + ".meta";
var TAB_BAR_PREFAB_UUID = "2ac46b30-6e50-4a7d-9c55-658b89eaf421";
var SCREEN_ADAPTER_SCRIPT_PATH = path.join(SPIRIT_ROOT, "SpiritHallScreenAdapter.js");
var SCREEN_ADAPTER_META_PATH = SCREEN_ADAPTER_SCRIPT_PATH + ".meta";
var SCREEN_ADAPTER_SCRIPT_UUID = "a3171b68-b238-4a3a-99aa-cee90f4d1b8d";
var DEFAULT_MATERIAL_UUID = "eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432";
var DESIGN_WIDTH = 720;
var DESIGN_HEIGHT = 1280;
var UPGRADE_FRAGMENT_ICON_X = -175;
var UPGRADE_FRAGMENT_ICON_Y = -500;
var UPGRADE_FRAGMENT_ICON_SCALE = 0.6;

function fail(message) {
  throw new Error(message);
}

function readJson(absolutePath) {
  var source = fs.readFileSync(absolutePath, "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    fail("Invalid JSON in " + path.relative(PROJECT_ROOT, absolutePath) + ": " + error.message);
  }
}

function assertFinitePositive(value, description) {
  if (!Number.isFinite(value) || value <= 0) {
    fail(description + " must be a positive finite number.");
  }
}

function loadSpriteFrame(relativePngPath, expectedWidth, expectedHeight) {
  assertFinitePositive(expectedWidth, relativePngPath + " expected width");
  assertFinitePositive(expectedHeight, relativePngPath + " expected height");
  var pngPath = path.join(SPIRIT_ROOT, relativePngPath);
  var metaPath = pngPath + ".meta";
  if (!fs.existsSync(pngPath)) {
    fail("Required spirit hall image is missing: " + path.relative(PROJECT_ROOT, pngPath));
  }
  if (!fs.existsSync(metaPath)) {
    fail("Required spirit hall image meta is missing: " + path.relative(PROJECT_ROOT, metaPath));
  }
  var meta = readJson(metaPath);
  if (meta.importer !== "texture" || meta.type !== "sprite") {
    fail(relativePngPath + " must be imported as a sprite texture.");
  }
  if (meta.width !== expectedWidth || meta.height !== expectedHeight) {
    fail(
      relativePngPath + " must be " + expectedWidth + "x" + expectedHeight +
      ", received " + meta.width + "x" + meta.height + "."
    );
  }
  var subMetaNames = Object.keys(meta.subMetas);
  if (subMetaNames.length !== 1) {
    fail(relativePngPath + " must expose exactly one SpriteFrame subMeta.");
  }
  var subMeta = meta.subMetas[subMetaNames[0]];
  if (!subMeta || typeof subMeta.uuid !== "string" || subMeta.uuid.length === 0) {
    fail(relativePngPath + " SpriteFrame UUID is missing.");
  }
  return {
    path: relativePngPath.replace(/\\/g, "/"),
    uuid: subMeta.uuid,
    width: expectedWidth,
    height: expectedHeight
  };
}

var frames = {
  background: loadSpriteFrame("bg.jpg", 720, 1560),
  miluRole: loadSpriteFrame("image/role/milu.png", 344, 387),
  backButton: loadSpriteFrame("image/ui/back_button.png", 71, 71),
  blueIceFrame: loadSpriteFrame("image/ui/blue_ice_frame.png", 89, 95),
  blueLeafShieldIcon: loadSpriteFrame("image/ui/blue_leaf_shield_icon.png", 47, 46),
  blueProgressBar: loadSpriteFrame("image/ui/blue_progress_bar.png", 163, 18),
  blueUpgradeButton: loadSpriteFrame("image/ui/blue_upgrade_button.png", 204, 89),
  coinIcon: loadSpriteFrame("image/ui/coin_icon.png", 40, 41),
  crystalTabIcon: loadSpriteFrame("image/ui/crystal_tab_icon.png", 100, 96),
  darkNameplate: loadSpriteFrame("image/ui/dark_nameplate.png", 149, 37),
  darkProgressBar: loadSpriteFrame("image/ui/dark_progress_bar.png", 163, 18),
  elfHallTitle: loadSpriteFrame("image/ui/elf_hall_title.png", 284, 86),
  fireIcon: loadSpriteFrame("image/ui/fire_icon.png", 50, 49),
  floraAvatar: loadSpriteFrame("image/ui/flora_avatar.png", 97, 96),
  gemIcon: loadSpriteFrame("image/ui/gem_icon.png", 42, 40),
  greenBattleButton: loadSpriteFrame("image/ui/green_battle_button.png", 207, 88),
  greenDoubleLeafIcon: loadSpriteFrame("image/ui/green_double_leaf_icon.png", 47, 46),
  greenLeafFrame: loadSpriteFrame("image/ui/green_leaf_frame.png", 97, 96),
  greenProgressBar: loadSpriteFrame("image/ui/green_progress_bar.png", 164, 18),
  keluAvatar: loadSpriteFrame("image/ui/kelu_avatar.png", 100, 99),
  largeGlowingLeafBall: loadSpriteFrame("image/ui/large_glowing_leaf_ball.png", 89, 89),
  leftArrowButton: loadSpriteFrame("image/ui/left_arrow_button.png", 34, 52),
  lightningIcon: loadSpriteFrame("image/ui/lightning_icon.png", 50, 49),
  light: loadSpriteFrame("image/ui/light.png", 332, 375),
  locoAvatar: loadSpriteFrame("image/ui/loco_avatar.png", 100, 99),
  lumiAvatar: loadSpriteFrame("image/ui/lumi_avatar.png", 99, 99),
  magicCircle: loadSpriteFrame("image/ui/magic_circle.png", 367, 375),
  miluAvatar: loadSpriteFrame("image/ui/milu_avatar_large.png", 97, 96),
  miluFragments: loadSpriteFrame("image/tabbar/milu_fragments.png", 106, 115),
  narrowDarkPanel: loadSpriteFrame("image/ui/narrow_dark_panel.png", 279, 80),
  orangeFireFrame: loadSpriteFrame("image/ui/orange_fire_frame.png", 92, 96),
  purpleMagicIcon: loadSpriteFrame("image/ui/purple_magic_icon.png", 47, 46),
  purpleProgressBar: loadSpriteFrame("image/ui/purple_progress_bar.png", 163, 17),
  purpleStarFrame: loadSpriteFrame("image/ui/purple_star_frame.png", 92, 90),
  redNotificationDot: loadSpriteFrame("image/ui/red_notification_dot.png", 21, 20),
  redCrossedSwordsIcon: loadSpriteFrame("image/ui/red_crossed_swords_icon.png", 47, 46),
  redProgressBar: loadSpriteFrame("image/ui/red_progress_bar.png", 163, 17),
  rightArrowButton: loadSpriteFrame("image/ui/right_arrow_button.png", 38, 55),
  squareDarkPanel: loadSpriteFrame("image/ui/square_dark_panel.png", 217, 243),
  starIcon: loadSpriteFrame("image/ui/star_icon.png", 50, 49),
  transferPanel: loadSpriteFrame("image/ui/transfer_panel.png", 441, 237),
  windAvatar: loadSpriteFrame("image/ui/wind_elf_avatar.png", 100, 99),
  windIcon: loadSpriteFrame("image/ui/wind_icon.png", 50, 49),
  yellowLightningFrame: loadSpriteFrame("image/ui/yellow_lightning_frame.png", 92, 91),
  yellowSunFrame: loadSpriteFrame("image/ui/yellow_sun_frame.png", 108, 111),
  yumiAvatar: loadSpriteFrame("image/ui/yumi_avatar.png", 99, 99)
};

function loadTabBarFrames() {
  frames.tabBarBottomNavigationBar = loadSpriteFrame("image/tabbar/bottom_navigation_bar.png", 720, 131);
  frames.tabBarCrystalTabIcon = loadSpriteFrame("image/tabbar/crystal_tab_icon.png", 100, 96);
  frames.tabBarRedNotificationDot = loadSpriteFrame("image/tabbar/red_notification_dot.png", 21, 20);
  frames.tabBarRockTabIcon = loadSpriteFrame("image/tabbar/rock_tab_icon.png", 70, 63);
  frames.tabBarScrollTabIcon = loadSpriteFrame("image/tabbar/scroll_tab_icon.png", 67, 51);
  frames.tabBarShopTabIcon = loadSpriteFrame("image/tabbar/shop_tab_icon.png", 66, 53);
  frames.tabBarTreeTabIcon = loadSpriteFrame("image/tabbar/tree_tab_icon.png", 67, 62);
}

function color(r, g, b, a) {
  return {
    "__type__": "cc.Color",
    r: r,
    g: g,
    b: b,
    a: a
  };
}

function size(width, height) {
  return {
    "__type__": "cc.Size",
    width: width,
    height: height
  };
}

function vec2(x, y) {
  return {
    "__type__": "cc.Vec2",
    x: x,
    y: y
  };
}

function typedTransform(x, y, scaleX, scaleY) {
  return {
    "__type__": "TypedArray",
    ctor: "Float64Array",
    array: [x, y, 0, 0, 0, 0, 1, scaleX, scaleY, 1]
  };
}

function stableFileId(scope, key) {
  return crypto.createHash("sha1").update(scope + "/" + key).digest("base64").replace(/[+/=]/g, "").slice(0, 22);
}

function compressUuid(uuid) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) {
    fail("Cannot compress invalid UUID: " + uuid);
  }
  var keys = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var hex = uuid.replace(/-/g, "");
  var compressed = hex.slice(0, 5);
  for (var index = 5; index < hex.length; index += 3) {
    var value = parseInt(hex.slice(index, index + 3), 16);
    compressed += keys[value >> 6] + keys[value & 63];
  }
  return compressed;
}

function validateScreenAdapterAsset() {
  if (!fs.existsSync(SCREEN_ADAPTER_SCRIPT_PATH)) {
    fail("SpiritHallScreenAdapter.js is missing.");
  }
  if (!fs.existsSync(SCREEN_ADAPTER_META_PATH)) {
    fail("SpiritHallScreenAdapter.js.meta is missing.");
  }
  var meta = readJson(SCREEN_ADAPTER_META_PATH);
  if (meta.importer !== "javascript" || meta.uuid !== SCREEN_ADAPTER_SCRIPT_UUID) {
    fail("SpiritHallScreenAdapter.js.meta importer or UUID is invalid.");
  }
}

function rootX(screenX) {
  return screenX - DESIGN_WIDTH / 2;
}

function rootY(screenY) {
  return DESIGN_HEIGHT / 2 - screenY;
}

function createBuilder(scope) {
  if (typeof scope !== "string" || scope.length === 0) {
    fail("Prefab builder scope is required.");
  }
  var objects = [];
  var nodesById = {};
  var prefab = {
    "__type__": "cc.Prefab",
    "_name": "",
    "_objFlags": 0,
    "_native": "",
    data: null,
    optimizationPolicy: 0,
    asyncLoadAssets: false,
    readonly: false
  };
  objects.push(prefab);

  function pushObject(value) {
    var id = objects.length;
    objects.push(value);
    return id;
  }

  function requireNode(nodeId, description) {
    var node = nodesById[nodeId];
    if (!node) {
      fail(description + " node is missing.");
    }
    return node;
  }

  function addNode(options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      fail("addNode options must be an object.");
    }
    if (typeof options.name !== "string" || options.name.length === 0) {
      fail("addNode options.name is required.");
    }
    assertFinitePositive(options.width, options.name + " width");
    assertFinitePositive(options.height, options.name + " height");
    if (!Number.isFinite(options.x) || !Number.isFinite(options.y)) {
      fail(options.name + " position must be finite.");
    }
    if (!Number.isFinite(options.scaleX) || !Number.isFinite(options.scaleY)) {
      fail(options.name + " scale must be finite.");
    }
    var parentReference = null;
    if (options.parentId !== null) {
      requireNode(options.parentId, options.name + " parent");
      parentReference = { "__id__": options.parentId };
    }
    var node = {
      "__type__": "cc.Node",
      "_name": options.name,
      "_objFlags": 0,
      "_parent": parentReference,
      "_children": [],
      "_active": options.active,
      "_components": [],
      "_prefab": null,
      "_opacity": options.opacity,
      "_color": color(options.color.r, options.color.g, options.color.b, options.color.a),
      "_contentSize": size(options.width, options.height),
      "_anchorPoint": vec2(options.anchorX, options.anchorY),
      "_trs": typedTransform(options.x, options.y, options.scaleX, options.scaleY),
      "_eulerAngles": {
        "__type__": "cc.Vec3",
        x: 0,
        y: 0,
        z: 0
      },
      "_skewX": 0,
      "_skewY": 0,
      "_is3DNode": false,
      "_groupIndex": 0,
      "groupIndex": 0,
      "_id": ""
    };
    var nodeId = pushObject(node);
    nodesById[nodeId] = node;
    if (options.parentId !== null) {
      nodesById[options.parentId]._children.push({ "__id__": nodeId });
    }
    return nodeId;
  }

  function addComponent(nodeId, component) {
    var node = requireNode(nodeId, "Component owner");
    var componentId = pushObject(component);
    node._components.push({ "__id__": componentId });
    return componentId;
  }

  function addPrefabInfo(nodeId, key) {
    var node = requireNode(nodeId, "PrefabInfo owner");
    var infoId = pushObject({
      "__type__": "cc.PrefabInfo",
      root: { "__id__": 1 },
      asset: { "__id__": 0 },
      fileId: stableFileId(scope, key),
      sync: false
    });
    node._prefab = { "__id__": infoId };
    return infoId;
  }

  function addSprite(nodeId, frame, enabled) {
    return addComponent(nodeId, {
      "__type__": "cc.Sprite",
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": enabled,
      "_materials": [
        { "__uuid__": DEFAULT_MATERIAL_UUID }
      ],
      "_srcBlendFactor": 770,
      "_dstBlendFactor": 771,
      "_spriteFrame": { "__uuid__": frame.uuid },
      "_type": 0,
      "_sizeMode": 0,
      "_fillType": 0,
      "_fillCenter": vec2(0, 0),
      "_fillStart": 0,
      "_fillRange": 0,
      "_isTrimmedMode": true,
      "_atlas": null,
      "_id": ""
    });
  }

  function addButton(nodeId, targetNodeId) {
    requireNode(targetNodeId, "Button target");
    return addComponent(nodeId, {
      "__type__": "cc.Button",
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      "_normalMaterial": null,
      "_grayMaterial": null,
      duration: 0.1,
      zoomScale: 1.06,
      clickEvents: [],
      "_N$interactable": true,
      "_N$enableAutoGrayEffect": false,
      "_N$transition": 3,
      transition: 3,
      "_N$normalColor": color(255, 255, 255, 255),
      "_N$pressedColor": color(220, 220, 220, 255),
      pressedColor: color(220, 220, 220, 255),
      "_N$hoverColor": color(255, 255, 255, 255),
      hoverColor: color(255, 255, 255, 255),
      "_N$disabledColor": color(124, 124, 124, 255),
      "_N$normalSprite": null,
      "_N$pressedSprite": null,
      pressedSprite: null,
      "_N$hoverSprite": null,
      hoverSprite: null,
      "_N$disabledSprite": null,
      "_N$target": { "__id__": targetNodeId },
      "_id": ""
    });
  }

  function addProgressBar(nodeId, barSpriteComponentId, totalLength, progress) {
    if (!Number.isInteger(barSpriteComponentId) || barSpriteComponentId <= 0) {
      fail("ProgressBar barSprite component id must be a positive integer.");
    }
    assertFinitePositive(totalLength, "ProgressBar totalLength");
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
      fail("ProgressBar progress must be between 0 and 1.");
    }
    return addComponent(nodeId, {
      "__type__": "cc.ProgressBar",
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      "_N$totalLength": totalLength,
      "_N$barSprite": { "__id__": barSpriteComponentId },
      "_N$mode": 0,
      "_N$progress": progress,
      "_N$reverse": false,
      "_id": ""
    });
  }

  function addLabel(nodeId, options) {
    if (typeof options.text !== "string") {
      fail("Label text must be a string.");
    }
    assertFinitePositive(options.fontSize, options.text + " font size");
    assertFinitePositive(options.lineHeight, options.text + " line height");
    addComponent(nodeId, {
      "__type__": "cc.Label",
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      "_materials": [
        { "__uuid__": DEFAULT_MATERIAL_UUID }
      ],
      "_srcBlendFactor": 770,
      "_dstBlendFactor": 771,
      "_string": options.text,
      "_N$string": options.text,
      "_fontSize": options.fontSize,
      "_lineHeight": options.lineHeight,
      "_enableWrapText": options.wrap,
      "_N$file": null,
      "_isSystemFontUsed": true,
      "_spacingX": 0,
      "_batchAsBitmap": false,
      "_styleFlags": options.bold ? 1 : 0,
      "_underlineHeight": 0,
      "_N$horizontalAlign": options.horizontalAlign,
      "_N$verticalAlign": 1,
      "_N$fontFamily": "Microsoft YaHei",
      "_N$overflow": options.overflow,
      "_N$cacheMode": 0,
      "_id": ""
    });
    if (options.outlineWidth > 0) {
      addComponent(nodeId, {
        "__type__": "cc.LabelOutline",
        "_name": "",
        "_objFlags": 0,
        node: { "__id__": nodeId },
        "_enabled": true,
        "_color": color(
          options.outlineColor.r,
          options.outlineColor.g,
          options.outlineColor.b,
          options.outlineColor.a
        ),
        "_width": options.outlineWidth,
        "_id": ""
      });
    }
  }

  function addWidget(nodeId) {
    addComponent(nodeId, {
      "__type__": "cc.Widget",
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      alignMode: 1,
      "_target": null,
      "_alignFlags": 45,
      "_left": 0,
      "_right": 0,
      "_top": 0,
      "_bottom": 0,
      "_verticalCenter": 0,
      "_horizontalCenter": 0,
      "_isAbsLeft": true,
      "_isAbsRight": true,
      "_isAbsTop": true,
      "_isAbsBottom": true,
      "_isAbsHorizontalCenter": true,
      "_isAbsVerticalCenter": true,
      "_originalWidth": DESIGN_WIDTH,
      "_originalHeight": DESIGN_HEIGHT,
      "_id": ""
    });
  }

  function addBlockInput(nodeId) {
    addComponent(nodeId, {
      "__type__": "cc.BlockInputEvents",
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      "_id": ""
    });
  }

  function addSafeArea(nodeId) {
    addComponent(nodeId, {
      "__type__": "cc.SafeArea",
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      "_id": ""
    });
  }

  function addScreenAdapter(nodeId) {
    addComponent(nodeId, {
      "__type__": compressUuid(SCREEN_ADAPTER_SCRIPT_UUID),
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      "_id": ""
    });
  }

  function finishRoot(rootId) {
    if (rootId !== 1) {
      fail(scope + " root must be object id 1.");
    }
    prefab.data = { "__id__": rootId };
  }

  return {
    objects: objects,
    addNode: addNode,
    addSprite: addSprite,
    addButton: addButton,
    addProgressBar: addProgressBar,
    addLabel: addLabel,
    addWidget: addWidget,
    addBlockInput: addBlockInput,
    addSafeArea: addSafeArea,
    addScreenAdapter: addScreenAdapter,
    addPrefabInfo: addPrefabInfo,
    finishRoot: finishRoot
  };
}

var WHITE = { r: 255, g: 255, b: 255, a: 255 };
var OUTLINE_BLUE = { r: 8, g: 49, b: 77, a: 255 };
var OUTLINE_GREEN = { r: 18, g: 70, b: 46, a: 255 };
var GOLD = { r: 255, g: 236, b: 83, a: 255 };
var LIME = { r: 190, g: 255, b: 61, a: 255 };

function nodeOptions(name, parentId, x, y, width, height) {
  return {
    name: name,
    parentId: parentId,
    x: x,
    y: y,
    width: width,
    height: height,
    anchorX: 0.5,
    anchorY: 0.5,
    scaleX: 1,
    scaleY: 1,
    opacity: 255,
    color: WHITE,
    active: true
  };
}

function buildPrefab() {
  validateScreenAdapterAsset();
  var builder = createBuilder("SpiritHallView");
  var root = builder.addNode(nodeOptions("SpiritHallView", null, 360, 640, DESIGN_WIDTH, DESIGN_HEIGHT));
  builder.addBlockInput(root);
  builder.addWidget(root);
  builder.addScreenAdapter(root);
  builder.addPrefabInfo(root, "root");
  builder.finishRoot(root);

  var backgroundRenderLayer = builder.addNode(
    nodeOptions("FullBleedBackgroundLayer", root, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
  );
  builder.addPrefabInfo(backgroundRenderLayer, "FullBleedBackgroundLayer");
  var backgroundAnchors = builder.addNode(
    nodeOptions("BackgroundSourceAnchors", root, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
  );
  builder.addPrefabInfo(backgroundAnchors, "BackgroundSourceAnchors");

  var safeAreaRoot = builder.addNode(nodeOptions("SafeAreaRoot", root, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT));
  builder.addWidget(safeAreaRoot);
  builder.addSafeArea(safeAreaRoot);
  builder.addPrefabInfo(safeAreaRoot, "SafeAreaRoot");
  var designContent = builder.addNode(
    nodeOptions("DesignContent", safeAreaRoot, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
  );
  builder.addPrefabInfo(designContent, "DesignContent");

  var renderLayer = builder.addNode(
    nodeOptions("SpriteRenderLayer", designContent, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
  );
  builder.addPrefabInfo(renderLayer, "SpriteRenderLayer");
  var roleRenderLayer = builder.addNode(nodeOptions("RoleRenderLayer", renderLayer, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT));
  builder.addPrefabInfo(roleRenderLayer, "RoleRenderLayer");
  var uiRenderLayer = builder.addNode(nodeOptions("UiRenderLayer", renderLayer, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT));
  builder.addPrefabInfo(uiRenderLayer, "UiRenderLayer");

  var logicLayer = builder.addNode(nodeOptions("LogicLayer", designContent, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT));
  builder.addPrefabInfo(logicLayer, "LogicLayer");

  var sections = {};
  [
    "TopBar",
    "CurrentSpiritCard",
    "HeroShowcase",
    "AbilityDetails",
    "SpiritRoster",
    "GrowthActions"
  ].forEach(function (name) {
    sections[name] = builder.addNode(nodeOptions(name, logicLayer, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT));
    builder.addPrefabInfo(sections[name], name);
  });
  sections.BottomNavigationMount = builder.addNode(
    nodeOptions("BottomNavigationMount", logicLayer, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
  );
  builder.addPrefabInfo(sections.BottomNavigationMount, "BottomNavigationMount");
  sections.BackgroundAnchors = backgroundAnchors;

  var artIndex = 0;
  function addArt(sectionName, renderParentId, name, frame, screenX, screenY, width, height, clickable) {
    assertFinitePositive(width, name + " width");
    assertFinitePositive(height, name + " height");
    var sourceName = "source__" + name;
    var proxyName = "proxy__" + name;
    var sourceNode = builder.addNode(
      nodeOptions(sourceName, sections[sectionName], rootX(screenX), rootY(screenY), width, height)
    );
    var sourceSpriteComponentId = builder.addSprite(sourceNode, frame, false);
    builder.addPrefabInfo(sourceNode, "source/" + artIndex + "/" + name);
    var proxyNode = builder.addNode(
      nodeOptions(proxyName, renderParentId, rootX(screenX), rootY(screenY), width, height)
    );
    var proxySpriteComponentId = builder.addSprite(proxyNode, frame, true);
    builder.addPrefabInfo(proxyNode, "proxy/" + artIndex + "/" + name);
    if (clickable) {
      builder.addButton(sourceNode, proxyNode);
    }
    artIndex += 1;
    return {
      sourceNode: sourceNode,
      proxyNode: proxyNode,
      sourceSpriteComponentId: sourceSpriteComponentId,
      proxySpriteComponentId: proxySpriteComponentId
    };
  }

  function addProgressBar(sectionName, name, fillFrame, screenX, screenY, totalWidth, height, progress) {
    assertFinitePositive(totalWidth, name + " total width");
    assertFinitePositive(height, name + " height");
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
      fail(name + " progress must be between 0 and 1.");
    }

    var baseArt = addArt(
      sectionName,
      uiRenderLayer,
      name + "_bar_base",
      frames.darkProgressBar,
      screenX,
      screenY,
      totalWidth,
      height,
      false
    );
    var initialFillWidth = totalWidth * progress;
    assertFinitePositive(initialFillWidth, name + " initial fill width");

    var sourceFillOptions = nodeOptions(
      "source__" + name + "_bar_fill",
      baseArt.sourceNode,
      -totalWidth / 2,
      0,
      initialFillWidth,
      height
    );
    sourceFillOptions.anchorX = 0;
    var sourceFillNode = builder.addNode(sourceFillOptions);
    builder.addSprite(sourceFillNode, fillFrame, false);
    builder.addPrefabInfo(sourceFillNode, "source/" + artIndex + "/" + name + "_bar_fill");

    var proxyFillOptions = nodeOptions(
      "proxy__" + name + "_bar_fill",
      baseArt.proxyNode,
      -totalWidth / 2,
      0,
      initialFillWidth,
      height
    );
    proxyFillOptions.anchorX = 0;
    var proxyFillNode = builder.addNode(proxyFillOptions);
    var proxyFillSpriteComponentId = builder.addSprite(proxyFillNode, fillFrame, true);
    builder.addPrefabInfo(proxyFillNode, "proxy/" + artIndex + "/" + name + "_bar_fill");
    builder.addProgressBar(
      baseArt.proxyNode,
      proxyFillSpriteComponentId,
      totalWidth,
      progress
    );
    artIndex += 1;
  }

  var textIndex = 0;
  function addText(sectionName, name, text, screenX, screenY, width, height, fontSize, textColor, options) {
    var labelNodeOptions = nodeOptions(
      name,
      sections[sectionName],
      rootX(screenX),
      rootY(screenY),
      width,
      height
    );
    labelNodeOptions.anchorX = options.anchorX;
    var labelNode = builder.addNode(labelNodeOptions);
    var labelNodeObject = builder.objects[labelNode];
    labelNodeObject._color = color(textColor.r, textColor.g, textColor.b, textColor.a);
    builder.addLabel(labelNode, {
      text: text,
      fontSize: fontSize,
      lineHeight: options.lineHeight,
      wrap: options.wrap,
      bold: options.bold,
      horizontalAlign: options.horizontalAlign,
      overflow: options.overflow,
      outlineWidth: options.outlineWidth,
      outlineColor: options.outlineColor
    });
    builder.addPrefabInfo(labelNode, "text/" + textIndex + "/" + name);
    textIndex += 1;
    return labelNode;
  }

  function headlineOptions() {
    return {
      lineHeight: 32,
      wrap: false,
      bold: true,
      horizontalAlign: 1,
      overflow: 1,
      outlineWidth: 0,
      anchorX: 0.5
    };
  }

  function actionButtonTextOptions() {
    var options = headlineOptions();
    options.outlineWidth = 2;
    options.outlineColor = OUTLINE_BLUE;
    return options;
  }

  function bodyOptions(horizontalAlign) {
    return {
      lineHeight: 24,
      wrap: true,
      bold: false,
      horizontalAlign: horizontalAlign,
      overflow: 2,
      outlineWidth: 0,
      anchorX: 0
    };
  }

  addArt("BackgroundAnchors", backgroundRenderLayer, "background", frames.background, 360, 600, 720, 1560, false);
  var upgradeMagicCircleArt = addArt(
    "HeroShowcase",
    roleRenderLayer,
    "upgrade_magic_circle",
    frames.magicCircle,
    360,
    383,
    frames.magicCircle.width,
    frames.magicCircle.height,
    false
  );
  var initialRoleArt = addArt(
    "HeroShowcase",
    roleRenderLayer,
    "selected_role",
    frames.miluRole,
    360,
    383,
    frames.miluRole.width,
    frames.miluRole.height,
    false
  );
  var upgradeLightArt = addArt(
    "HeroShowcase",
    roleRenderLayer,
    "upgrade_light",
    frames.light,
    360,
    383,
    frames.light.width,
    frames.light.height,
    false
  );
  [
    upgradeMagicCircleArt.sourceNode,
    upgradeMagicCircleArt.proxyNode,
    upgradeLightArt.sourceNode,
    upgradeLightArt.proxyNode
  ].forEach(function (nodeId) {
    builder.objects[nodeId]._active = false;
    builder.objects[nodeId]._opacity = 0;
  });
  [
    initialRoleArt.sourceSpriteComponentId,
    initialRoleArt.proxySpriteComponentId
  ].forEach(function (spriteComponentId) {
    builder.objects[spriteComponentId]._sizeMode = 2;
    builder.objects[spriteComponentId]._isTrimmedMode = false;
  });

  addArt("TopBar", uiRenderLayer, "back_button", frames.backButton, 48, 48, 71, 71, true);
  addArt("TopBar", uiRenderLayer, "elf_hall_title", frames.elfHallTitle, 360, 64, 284, 86, false);

  [
    { key: "coin", y: 34, icon: frames.coinIcon, iconWidth: 29, iconHeight: 30, value: "68.7万" },
    { key: "crystal", y: 76, icon: frames.gemIcon, iconWidth: 30, iconHeight: 29, value: "12,450" }
  ].forEach(function (resource) {
    addArt("TopBar", uiRenderLayer, resource.key + "_bar", frames.narrowDarkPanel, 618, resource.y, 164, 40, false);
    addArt("TopBar", uiRenderLayer, resource.key + "_icon", resource.icon, 548, resource.y, resource.iconWidth, resource.iconHeight, false);
    addText("TopBar", resource.key + "_value", resource.value, 619, resource.y, 105, 34, 23, WHITE, headlineOptions());
  });

  addArt("CurrentSpiritCard", uiRenderLayer, "current_card_panel", frames.squareDarkPanel, 73, 266, 132, 208, false);
  addText("CurrentSpiritCard", "current_card_title", "当前出战", 73, 184, 120, 28, 21, WHITE, headlineOptions());
  addArt("CurrentSpiritCard", uiRenderLayer, "current_card_avatar_frame", frames.greenLeafFrame, 73, 244, 76, 76, false);
  addArt("CurrentSpiritCard", uiRenderLayer, "current_card_avatar", frames.miluAvatar, 73, 244, 66, 66, false);
  addText("CurrentSpiritCard", "current_card_name", "米露 Lv.1", 73, 314, 120, 26, 18, WHITE, headlineOptions());

  addArt("HeroShowcase", uiRenderLayer, "hero_left_arrow", frames.leftArrowButton, 118, 552, 34, 52, true);
  addArt("HeroShowcase", uiRenderLayer, "hero_right_arrow", frames.rightArrowButton, 602, 552, 38, 55, true);
  addArt("HeroShowcase", uiRenderLayer, "hero_nameplate", frames.narrowDarkPanel, 360, 599, 330, 72, false);
  addArt("HeroShowcase", uiRenderLayer, "hero_element_icon", frames.greenDoubleLeafIcon, 248, 586, 38, 37, false);
  addText("HeroShowcase", "hero_name", "芙洛·森林精灵", 374, 585, 190, 34, 27, WHITE, headlineOptions());
  addText("HeroShowcase", "hero_level", "Lv.1", 483, 585, 70, 30, 20, WHITE, headlineOptions());

  addArt("AbilityDetails", uiRenderLayer, "ability_stats_panel", frames.squareDarkPanel, 126, 791, 217, 243, false);
  addArt("AbilityDetails", uiRenderLayer, "ability_transfer_panel", frames.transferPanel, 468, 791, 441, 237, false);

  var statRows = [
    {
      key: "ability_kind",
      y: 716,
      icon: frames.greenDoubleLeafIcon,
      fill: frames.greenProgressBar,
      label: "能力类型",
      value: "全局",
      progress: 56 / 104
    },
    {
      key: "current_probability",
      y: 766,
      icon: frames.blueLeafShieldIcon,
      fill: frames.blueProgressBar,
      label: "当前效果",
      value: "普通递球",
      valueNodeName: "current_probability_stat_value",
      progress: 64 / 104
    },
    {
      key: "next_probability",
      y: 816,
      icon: frames.redCrossedSwordsIcon,
      fill: frames.redProgressBar,
      label: "下级效果",
      value: "普通递球",
      valueNodeName: "next_probability_stat_value",
      progress: 72 / 104
    },
    {
      key: "fragment_count",
      y: 866,
      icon: frames.purpleMagicIcon,
      fill: frames.purpleProgressBar,
      label: "拥有碎片",
      value: "0",
      progress: 80 / 104
    }
  ];
  statRows.forEach(function (row) {
    addArt("AbilityDetails", uiRenderLayer, row.key + "_icon", row.icon, 57, row.y, 35, 35, false);
    addText("AbilityDetails", row.key + "_label", row.label, 82, row.y - 8, 105, 24, 16, WHITE, bodyOptions(0));
    addProgressBar(
      "AbilityDetails",
      row.key,
      row.fill,
      148,
      row.y + 13,
      104,
      11,
      row.progress
    );
    addText(
      "AbilityDetails",
      row.valueNodeName || (row.key + "_value"),
      row.value,
      195,
      row.y,
      58,
      26,
      17,
      WHITE,
      headlineOptions()
    );
  });

  addArt("AbilityDetails", uiRenderLayer, "ability_icon", frames.largeGlowingLeafBall, 302, 740, 82, 82, false);
  addText("AbilityDetails", "ability_name", "解除束缚", 442, 715, 180, 36, 28, GOLD, headlineOptions());
  addText("AbilityDetails", "ability_kind_tag", "全局技能", 590, 715, 88, 28, 17, LIME, headlineOptions());
  addText(
    "AbilityDetails",
    "ability_description",
    "当前等级的技能效果将在此展示。",
    352,
    765,
    324,
    58,
    19,
    WHITE,
    bodyOptions(0)
  );
  addText("AbilityDetails", "current_probability_title", "Lv.1 当前效果", 354, 823, 150, 26, 17, GOLD, headlineOptions());
  addText("AbilityDetails", "current_probability_value", "普通递球\n无特殊技能", 354, 858, 190, 54, 20, LIME, headlineOptions());
  addText("AbilityDetails", "next_probability_title", "Lv.2 下级效果", 582, 823, 150, 26, 17, GOLD, headlineOptions());
  addText("AbilityDetails", "next_probability_value", "普通递球\n无特殊技能", 582, 858, 190, 54, 20, LIME, headlineOptions());

  addArt("SpiritRoster", uiRenderLayer, "roster_left_arrow", frames.leftArrowButton, 17, 982, 27, 42, true);
  addArt("SpiritRoster", uiRenderLayer, "roster_right_arrow", frames.rightArrowButton, 703, 982, 29, 43, true);

  var roster = [
    { key: "milu", name: "米露", avatar: frames.miluAvatar, frame: frames.greenLeafFrame, x: 62, selected: true },
    { key: "lumi", name: "露米", avatar: frames.lumiAvatar, frame: frames.orangeFireFrame, x: 160, selected: false },
    { key: "noya", name: "诺亚", avatar: frames.windAvatar, frame: frames.blueIceFrame, x: 258, selected: false },
    { key: "flora", name: "芙洛", avatar: frames.floraAvatar, frame: frames.yellowSunFrame, x: 356, selected: false },
    { key: "loco", name: "洛可", avatar: frames.locoAvatar, frame: frames.blueIceFrame, x: 454, selected: false },
    { key: "kelu", name: "可露", avatar: frames.keluAvatar, frame: frames.yellowLightningFrame, x: 552, selected: false },
    { key: "yumi", name: "悠米", avatar: frames.yumiAvatar, frame: frames.purpleStarFrame, x: 650, selected: false }
  ];
  roster.forEach(function (spirit) {
    var frameSize = spirit.selected ? 82 : 72;
    var avatarSize = spirit.selected ? 68 : 62;
    addArt("SpiritRoster", uiRenderLayer, spirit.key + "_frame", spirit.frame, spirit.x, 978, frameSize, frameSize, true);
    addArt("SpiritRoster", uiRenderLayer, spirit.key + "_avatar", spirit.avatar, spirit.x, 978, avatarSize, avatarSize, false);
    addText(
      "SpiritRoster",
      spirit.key + "_name",
      spirit.name,
      spirit.x,
      1028,
      78,
      26,
      spirit.selected ? 18 : 17,
      spirit.selected ? GOLD : WHITE,
      headlineOptions()
    );
  });

  addArt("GrowthActions", uiRenderLayer, "upgrade_button", frames.blueUpgradeButton, 220, 1117, 204, 89, true);
  addArt("GrowthActions", uiRenderLayer, "battle_button", frames.greenBattleButton, 525, 1117, 207, 88, true);
  var upgradeFragmentIconArt = addArt(
    "GrowthActions",
    uiRenderLayer,
    "upgrade_fragment_icon",
    frames.miluFragments,
    150,
    1111,
    52,
    56,
    false
  );
  [
    upgradeFragmentIconArt.sourceNode,
    upgradeFragmentIconArt.proxyNode
  ].forEach(function (nodeId) {
    var transform = builder.objects[nodeId]._trs.array;
    transform[0] = UPGRADE_FRAGMENT_ICON_X;
    transform[1] = UPGRADE_FRAGMENT_ICON_Y;
    transform[7] = UPGRADE_FRAGMENT_ICON_SCALE;
    transform[8] = UPGRADE_FRAGMENT_ICON_SCALE;
  });
  addText("GrowthActions", "upgrade_text", "升级", 239, 1100, 110, 38, 30, WHITE, actionButtonTextOptions());
  addText("GrowthActions", "upgrade_cost", "0/10", 241, 1140, 102, 26, 18, WHITE, headlineOptions());
  addText("GrowthActions", "battle_text", "出战", 544, 1117, 120, 42, 31, WHITE, actionButtonTextOptions());

  roster.forEach(function (spirit) {
    var notificationArt = addArt(
      "SpiritRoster",
      uiRenderLayer,
      spirit.key + "_upgrade_notification",
      frames.redNotificationDot,
      spirit.x + 29,
      949,
      21,
      20,
      false
    );
    builder.objects[notificationArt.sourceNode]._active = false;
    builder.objects[notificationArt.proxyNode]._active = false;
  });

  return builder.objects;
}

function buildTabBarPrefab() {
  loadTabBarFrames();
  var builder = createBuilder("SpiritSystemTabBar");
  var root = builder.addNode(nodeOptions("SpiritSystemTabBar", null, 0, 0, DESIGN_WIDTH, 90));
  builder.addBlockInput(root);
  builder.addPrefabInfo(root, "root");
  builder.finishRoot(root);

  var renderLayer = builder.addNode(
    nodeOptions("SpiritSystemTabBarSpriteLayer", root, 0, 0, DESIGN_WIDTH, 90)
  );
  builder.addPrefabInfo(renderLayer, "SpiritSystemTabBarSpriteLayer");
  var logicLayer = builder.addNode(
    nodeOptions("SpiritSystemTabBarLogicLayer", root, 0, 0, DESIGN_WIDTH, 90)
  );
  builder.addPrefabInfo(logicLayer, "SpiritSystemTabBarLogicLayer");

  var artIndex = 0;
  function addTabArt(name, frame, x, y, width, height, clickable) {
    assertFinitePositive(width, name + " width");
    assertFinitePositive(height, name + " height");
    var sourceNode = builder.addNode(
      nodeOptions("source__" + name, logicLayer, x, y, width, height)
    );
    builder.addSprite(sourceNode, frame, false);
    builder.addPrefabInfo(sourceNode, "source/" + artIndex + "/" + name);
    var proxyNode = builder.addNode(
      nodeOptions("proxy__" + name, renderLayer, x, y, width, height)
    );
    builder.addSprite(proxyNode, frame, true);
    builder.addPrefabInfo(proxyNode, "proxy/" + artIndex + "/" + name);
    if (clickable) {
      builder.addButton(sourceNode, proxyNode);
    }
    artIndex += 1;
  }

  var textIndex = 0;
  function addTabLabel(name, text, x, y, fontSize, textColor) {
    var labelNodeId = builder.addNode(nodeOptions(name, logicLayer, x, y, 120, 28));
    builder.objects[labelNodeId]._color = color(textColor.r, textColor.g, textColor.b, textColor.a);
    builder.addLabel(labelNodeId, {
      text: text,
      fontSize: fontSize,
      lineHeight: 32,
      wrap: false,
      bold: true,
      horizontalAlign: 1,
      overflow: 1,
      outlineWidth: 0
    });
    builder.addPrefabInfo(labelNodeId, "text/" + textIndex + "/" + name);
    textIndex += 1;
  }

  addTabArt("bottom_navigation_bar", frames.tabBarBottomNavigationBar, 0, 0, 699, 90, false);
  [
    { key: "home", label: "精灵小屋", icon: frames.tabBarTreeTabIcon, x: 76, y: 1214, width: 51, height: 47, notify: false },
    { key: "bond", label: "精灵羁绊", icon: frames.tabBarRockTabIcon, x: 220, y: 1215, width: 53, height: 48, notify: false },
    { key: "hall", label: "精灵大厅", icon: frames.tabBarCrystalTabIcon, x: 360, y: 1205, width: 84, height: 81, notify: false },
    { key: "growth", label: "成长任务", icon: frames.tabBarScrollTabIcon, x: 502, y: 1216, width: 51, height: 39, notify: false },
    { key: "shop", label: "精灵商店", icon: frames.tabBarShopTabIcon, x: 644, y: 1216, width: 52, height: 42, notify: false }
  ].forEach(function (tab) {
    var localX = rootX(tab.x);
    addTabArt(
      tab.key + "_tab",
      tab.icon,
      localX,
      1235 - tab.y,
      tab.width,
      tab.height,
      true
    );
    addTabLabel(
      tab.key + "_tab_label",
      tab.label,
      localX,
      1235 - 1260,
      tab.key === "hall" ? 17 : 18,
      tab.key === "hall" ? GOLD : WHITE
    );
    if (tab.notify) {
      addTabArt(
        tab.key + "_notification",
        frames.tabBarRedNotificationDot,
        rootX(tab.x + 31),
        1235 - 1192,
        18,
        17,
        false
      );
    }
  });

  return builder.objects;
}

function walkIds(value, visitor) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(value, "__id__")) {
    visitor(value.__id__);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(function (item) {
      walkIds(item, visitor);
    });
    return;
  }
  Object.keys(value).forEach(function (key) {
    walkIds(value[key], visitor);
  });
}

function validatePrefabObjects(objects) {
  if (!Array.isArray(objects) || objects.length < 2) {
    fail("SpiritHallView prefab must contain serialized objects.");
  }
  objects.forEach(function (object, objectIndex) {
    walkIds(object, function (referencedId) {
      if (!Number.isInteger(referencedId) || referencedId < 0 || referencedId >= objects.length) {
        fail("Serialized object " + objectIndex + " references invalid __id__ " + referencedId + ".");
      }
    });
  });

  var sourceSprites = 0;
  var proxySprites = 0;
  var progressBarComponents = 0;
  var outlinedLabelCounts = {
    upgrade_text: 0,
    battle_text: 0
  };
  var nodeNameCounts = {};
  var gemIconSpriteNodes = 0;
  var requiredLeftAlignedLabels = {
    ability_kind_label: 0,
    current_probability_label: 0,
    next_probability_label: 0,
    fragment_count_label: 0,
    ability_description: 0
  };
  var safeAreaComponents = 0;
  var screenAdapterComponents = 0;
  var upgradeFragmentIconSpriteNodes = 0;
  var upgradeEffectSpriteNodes = 0;
  var upgradeEffectFrameUuids = {
    source__upgrade_magic_circle: frames.magicCircle.uuid,
    proxy__upgrade_magic_circle: frames.magicCircle.uuid,
    source__upgrade_light: frames.light.uuid,
    proxy__upgrade_light: frames.light.uuid
  };
  var requiredNodeCounts = {
    FullBleedBackgroundLayer: 0,
    SafeAreaRoot: 0,
    DesignContent: 0,
    BottomNavigationMount: 0,
    source__upgrade_fragment_icon: 0,
    proxy__upgrade_fragment_icon: 0,
    source__upgrade_magic_circle: 0,
    proxy__upgrade_magic_circle: 0,
    source__upgrade_light: 0,
    proxy__upgrade_light: 0,
    source__milu_upgrade_notification: 0,
    proxy__milu_upgrade_notification: 0,
    source__lumi_upgrade_notification: 0,
    proxy__lumi_upgrade_notification: 0,
    source__noya_upgrade_notification: 0,
    proxy__noya_upgrade_notification: 0,
    source__flora_upgrade_notification: 0,
    proxy__flora_upgrade_notification: 0,
    source__loco_upgrade_notification: 0,
    proxy__loco_upgrade_notification: 0,
    source__kelu_upgrade_notification: 0,
    proxy__kelu_upgrade_notification: 0,
    source__yumi_upgrade_notification: 0,
    proxy__yumi_upgrade_notification: 0
  };
  objects.forEach(function (object) {
    if (object.__type__ === "cc.LabelOutline") {
      var outlineNode = objects[object.node.__id__];
      if (
        !outlineNode ||
        !Object.prototype.hasOwnProperty.call(outlinedLabelCounts, outlineNode._name)
      ) {
        fail(
          "SpiritHallView system text must not use LabelOutline: " +
          (outlineNode ? outlineNode._name : "invalid node") +
          "."
        );
      }
      if (object._width !== 2) {
        fail(outlineNode._name + " must retain its 2px LabelOutline.");
      }
      outlinedLabelCounts[outlineNode._name] += 1;
    }
    if (object.__type__ === "cc.SafeArea") {
      safeAreaComponents += 1;
    }
    if (object.__type__ === "cc.ProgressBar") {
      progressBarComponents += 1;
      var barSprite = objects[object["_N$barSprite"].__id__];
      if (!barSprite || barSprite.__type__ !== "cc.Sprite" || barSprite._enabled !== true) {
        fail("SpiritHallView ProgressBar must reference an enabled proxy cc.Sprite.");
      }
      if (
        !Number.isFinite(object["_N$progress"]) ||
        object["_N$progress"] < 0 ||
        object["_N$progress"] > 1
      ) {
        fail("SpiritHallView ProgressBar progress must be between 0 and 1.");
      }
    }
    if (object.__type__ === compressUuid(SCREEN_ADAPTER_SCRIPT_UUID)) {
      screenAdapterComponents += 1;
    }
    if (object.__type__ !== "cc.Node") {
      return;
    }
    nodeNameCounts[object._name] = (nodeNameCounts[object._name] || 0) + 1;
    if (Object.prototype.hasOwnProperty.call(requiredLeftAlignedLabels, object._name)) {
      var labelComponents = object._components.map(function (componentReference) {
        return objects[componentReference.__id__];
      }).filter(function (component) {
        return component.__type__ === "cc.Label";
      });
      if (
        labelComponents.length !== 1 ||
        object._anchorPoint.x !== 0 ||
        labelComponents[0]["_N$horizontalAlign"] !== 0
      ) {
        fail(object._name + " must use anchorX=0 and left-aligned cc.Label.");
      }
      requiredLeftAlignedLabels[object._name] += 1;
    }
    if (Object.prototype.hasOwnProperty.call(requiredNodeCounts, object._name)) {
      requiredNodeCounts[object._name] += 1;
    }
    var spriteComponent = null;
    object._components.forEach(function (componentReference) {
      var component = objects[componentReference.__id__];
      if (component.__type__ === "cc.Sprite") {
        if (spriteComponent) {
          fail(object._name + " contains more than one cc.Sprite.");
        }
        spriteComponent = component;
      }
    });
    if (object._name.indexOf("source__") === 0) {
      if (!spriteComponent || spriteComponent._enabled !== false) {
        fail(object._name + " must contain one disabled source cc.Sprite.");
      }
      sourceSprites += 1;
    }
    if (object._name.indexOf("proxy__") === 0) {
      if (!spriteComponent || spriteComponent._enabled !== true) {
        fail(object._name + " must contain one enabled proxy cc.Sprite.");
      }
      proxySprites += 1;
    }
    if (object._name === "source__crystal_icon" || object._name === "proxy__crystal_icon") {
      if (
        !spriteComponent ||
        !spriteComponent._spriteFrame ||
        spriteComponent._spriteFrame.__uuid__ !== frames.gemIcon.uuid
      ) {
        fail(object._name + " must use image/ui/gem_icon.png.");
      }
      gemIconSpriteNodes += 1;
    }
    if (
      object._name === "source__upgrade_fragment_icon" ||
      object._name === "proxy__upgrade_fragment_icon"
    ) {
      if (
        !spriteComponent ||
        !spriteComponent._spriteFrame ||
        spriteComponent._spriteFrame.__uuid__ !== frames.miluFragments.uuid
      ) {
        fail(object._name + " must initially use image/tabbar/milu_fragments.png.");
      }
      if (
        object._trs.array[0] !== UPGRADE_FRAGMENT_ICON_X ||
        object._trs.array[1] !== UPGRADE_FRAGMENT_ICON_Y ||
        object._trs.array[7] !== UPGRADE_FRAGMENT_ICON_SCALE ||
        object._trs.array[8] !== UPGRADE_FRAGMENT_ICON_SCALE
      ) {
        fail(
          object._name +
          " must use X=" +
          UPGRADE_FRAGMENT_ICON_X +
          ", Y=" +
          UPGRADE_FRAGMENT_ICON_Y +
          " and scale=" +
          UPGRADE_FRAGMENT_ICON_SCALE +
          "."
        );
      }
      upgradeFragmentIconSpriteNodes += 1;
    }
    if (Object.prototype.hasOwnProperty.call(upgradeEffectFrameUuids, object._name)) {
      if (
        !spriteComponent ||
        !spriteComponent._spriteFrame ||
        spriteComponent._spriteFrame.__uuid__ !== upgradeEffectFrameUuids[object._name]
      ) {
        fail(object._name + " must use its authored spirit upgrade effect SpriteFrame.");
      }
      if (object._active !== false || object._opacity !== 0) {
        fail(object._name + " must be initially inactive and transparent.");
      }
      upgradeEffectSpriteNodes += 1;
    }
    if (/^(?:source__|proxy__)[a-z]+_upgrade_notification$/.test(object._name)) {
      if (
        !spriteComponent ||
        !spriteComponent._spriteFrame ||
        spriteComponent._spriteFrame.__uuid__ !== frames.redNotificationDot.uuid ||
        object._active !== false
      ) {
        fail(object._name + " must use the inactive Spirit Hall upgrade notification SpriteFrame.");
      }
    }
  });
  if (sourceSprites === 0 || proxySprites === 0 || sourceSprites !== proxySprites) {
    fail(
      "SpiritHallView proxy/source Sprite counts must match and be non-zero, received " +
      sourceSprites + "/" + proxySprites + "."
    );
  }
  if (safeAreaComponents !== 1 || screenAdapterComponents !== 1) {
    fail(
      "SpiritHallView requires exactly one SafeArea and one SpiritHallScreenAdapter, received " +
      safeAreaComponents + "/" + screenAdapterComponents + "."
    );
  }
  if (progressBarComponents !== 4) {
    fail("SpiritHallView requires exactly four cc.ProgressBar components.");
  }
  if (gemIconSpriteNodes !== 2) {
    fail("SpiritHallView requires source/proxy crystal icons backed by image/ui/gem_icon.png.");
  }
  if (upgradeFragmentIconSpriteNodes !== 2) {
    fail("SpiritHallView requires source/proxy upgrade fragment icons backed by image/tabbar.");
  }
  if (upgradeEffectSpriteNodes !== 4) {
    fail("SpiritHallView requires two source/proxy spirit upgrade effect Sprite pairs.");
  }
  Object.keys(nodeNameCounts).forEach(function (nodeName) {
    if (/^(?:source__|proxy__)?guide_(?:frame|icon|notification|text)$/.test(nodeName)) {
      fail("SpiritHallView must not contain removed guide entry node: " + nodeName + ".");
    }
    if (nodeName.indexOf("shard_") >= 0) {
      fail("SpiritHallView must not contain shard resource nodes: " + nodeName + ".");
    }
    if (
      nodeName === "source__coin_add" ||
      nodeName === "proxy__coin_add" ||
      nodeName === "source__crystal_add" ||
      nodeName === "proxy__crystal_add"
    ) {
      fail("SpiritHallView must not contain resource add button node: " + nodeName + ".");
    }
    if (
      nodeName === "SpiritSystemTabBar" ||
      nodeName === "source__bottom_navigation_bar" ||
      /^(?:source__|proxy__)(?:home|bond|hall|growth|shop)_tab$/.test(nodeName)
    ) {
      fail("SpiritHallView must not inline shared tab bar node: " + nodeName + ".");
    }
  });
  Object.keys(nodeNameCounts).forEach(function (nodeName) {
    if (nodeNameCounts[nodeName] !== 1) {
      fail("SpiritHallView node names must be globally unique: " + nodeName + ".");
    }
  });
  Object.keys(requiredNodeCounts).forEach(function (nodeName) {
    if (requiredNodeCounts[nodeName] !== 1) {
      fail("SpiritHallView requires exactly one " + nodeName + " node.");
    }
  });
  Object.keys(requiredLeftAlignedLabels).forEach(function (nodeName) {
    if (requiredLeftAlignedLabels[nodeName] !== 1) {
      fail("SpiritHallView requires exactly one left-aligned " + nodeName + " label.");
    }
  });
  Object.keys(outlinedLabelCounts).forEach(function (nodeName) {
    if (outlinedLabelCounts[nodeName] !== 1) {
      fail("SpiritHallView requires exactly one outlined " + nodeName + " label.");
    }
  });
}

function validateTabBarPrefabObjects(objects) {
  if (!Array.isArray(objects) || objects.length < 2) {
    fail("SpiritSystemTabBar prefab must contain serialized objects.");
  }
  objects.forEach(function (object, objectIndex) {
    walkIds(object, function (referencedId) {
      if (!Number.isInteger(referencedId) || referencedId < 0 || referencedId >= objects.length) {
        fail("SpiritSystemTabBar object " + objectIndex + " references invalid __id__ " + referencedId + ".");
      }
    });
  });

  var tabBarSpriteFrameUuids = {};
  [
    frames.tabBarBottomNavigationBar,
    frames.tabBarCrystalTabIcon,
    frames.tabBarRedNotificationDot,
    frames.tabBarRockTabIcon,
    frames.tabBarScrollTabIcon,
    frames.tabBarShopTabIcon,
    frames.tabBarTreeTabIcon
  ].forEach(function (frame) {
    if (frame.path.indexOf("image/tabbar/") !== 0) {
      fail("SpiritSystemTabBar frame must belong to image/tabbar: " + frame.path + ".");
    }
    tabBarSpriteFrameUuids[frame.uuid] = true;
  });

  var nodesByName = {};
  objects.forEach(function (object) {
    if (object.__type__ === "cc.LabelOutline") {
      fail("SpiritSystemTabBar system text must not use LabelOutline.");
    }
    if (
      object.__type__ === "cc.Sprite" &&
      (
        !object._spriteFrame ||
        !tabBarSpriteFrameUuids[object._spriteFrame.__uuid__]
      )
    ) {
      fail("SpiritSystemTabBar SpriteFrame must belong to image/tabbar.");
    }
    if (object.__type__ !== "cc.Node") {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(nodesByName, object._name)) {
      fail("SpiritSystemTabBar node names must be globally unique: " + object._name + ".");
    }
    nodesByName[object._name] = object;
  });
  [
    "SpiritSystemTabBar",
    "SpiritSystemTabBarSpriteLayer",
    "SpiritSystemTabBarLogicLayer",
    "source__bottom_navigation_bar",
    "proxy__bottom_navigation_bar",
    "source__home_tab",
    "source__bond_tab",
    "source__hall_tab",
    "source__growth_tab",
    "source__shop_tab"
  ].forEach(function (nodeName) {
    if (!Object.prototype.hasOwnProperty.call(nodesByName, nodeName)) {
      fail("SpiritSystemTabBar requires node: " + nodeName + ".");
    }
  });

  var root = nodesByName.SpiritSystemTabBar;
  if (root._contentSize.width !== DESIGN_WIDTH || root._contentSize.height !== 90) {
    fail("SpiritSystemTabBar root must be 720x90.");
  }
  [
    "source__home_notification",
    "proxy__home_notification",
    "source__growth_notification",
    "proxy__growth_notification"
  ].forEach(function (nodeName) {
    if (Object.prototype.hasOwnProperty.call(nodesByName, nodeName)) {
      fail("SpiritSystemTabBar must not contain unopened-tab notification node: " + nodeName + ".");
    }
  });

  var sourceSpriteCount = 0;
  var proxySpriteCount = 0;
  Object.keys(nodesByName).forEach(function (nodeName) {
    var node = nodesByName[nodeName];
    var sprite = node._components.map(function (componentReference) {
      return objects[componentReference.__id__];
    }).find(function (component) {
      return component && component.__type__ === "cc.Sprite";
    });
    if (nodeName.indexOf("source__") === 0) {
      if (!sprite || sprite._enabled !== false) {
        fail(nodeName + " must contain one disabled source cc.Sprite.");
      }
      var proxyName = "proxy__" + nodeName.slice("source__".length);
      var proxyNode = nodesByName[proxyName];
      if (!proxyNode) {
        fail("SpiritSystemTabBar proxy node is missing: " + proxyName + ".");
      }
      var proxySprite = proxyNode._components.map(function (componentReference) {
        return objects[componentReference.__id__];
      }).find(function (component) {
        return component && component.__type__ === "cc.Sprite";
      });
      if (
        !proxySprite ||
        proxySprite._enabled !== true ||
        proxySprite._spriteFrame.__uuid__ !== sprite._spriteFrame.__uuid__
      ) {
        fail(proxyName + " must contain the matching enabled proxy cc.Sprite.");
      }
      sourceSpriteCount += 1;
    }
    if (nodeName.indexOf("proxy__") === 0) {
      proxySpriteCount += 1;
    }
  });
  if (sourceSpriteCount === 0 || sourceSpriteCount !== proxySpriteCount) {
    fail(
      "SpiritSystemTabBar proxy/source Sprite counts must match and be non-zero, received " +
      sourceSpriteCount + "/" + proxySpriteCount + "."
    );
  }

  var buttons = objects.filter(function (object) {
    return object && object.__type__ === "cc.Button";
  });
  if (buttons.length !== 5) {
    fail("SpiritSystemTabBar requires exactly five tab Button components.");
  }
}

function serializePrefab() {
  var objects = buildPrefab();
  validatePrefabObjects(objects);
  return JSON.stringify(objects, null, 2) + "\n";
}

function serializeTabBarPrefab() {
  var objects = buildTabBarPrefab();
  validateTabBarPrefabObjects(objects);
  return JSON.stringify(objects, null, 2) + "\n";
}

function serializePrefabMeta(uuid) {
  return JSON.stringify({
    ver: "1.3.2",
    uuid: uuid,
    importer: "prefab",
    optimizationPolicy: "AUTO",
    asyncLoadAssets: false,
    readonly: false,
    subMetas: {}
  }, null, 2);
}

function main() {
  var prefabSource = serializePrefab();
  var prefabMetaSource = serializePrefabMeta(PREFAB_UUID);
  var hallOnly = process.argv.indexOf("--hall-only") >= 0;
  var tabBarPrefabSource = hallOnly ? null : serializeTabBarPrefab();
  var tabBarPrefabMetaSource = hallOnly ? null : serializePrefabMeta(TAB_BAR_PREFAB_UUID);
  if (process.argv.indexOf("--check") >= 0) {
    if (
      !fs.existsSync(PREFAB_PATH) ||
      !fs.existsSync(PREFAB_META_PATH) ||
      (!hallOnly && (!fs.existsSync(TAB_BAR_PREFAB_PATH) || !fs.existsSync(TAB_BAR_PREFAB_META_PATH)))
    ) {
      fail("SpiritHallView or SpiritSystemTabBar generated prefab/meta is missing.");
    }
    if (fs.readFileSync(PREFAB_PATH, "utf8") !== prefabSource) {
      fail("SpiritHallView.prefab is stale. Run node tools/generate-spirit-hall-prefab.js.");
    }
    if (fs.readFileSync(PREFAB_META_PATH, "utf8") !== prefabMetaSource) {
      fail("SpiritHallView.prefab.meta is stale. Run node tools/generate-spirit-hall-prefab.js.");
    }
    if (!hallOnly && fs.readFileSync(TAB_BAR_PREFAB_PATH, "utf8") !== tabBarPrefabSource) {
      fail("SpiritSystemTabBar.prefab is stale. Run node tools/generate-spirit-hall-prefab.js.");
    }
    if (!hallOnly && fs.readFileSync(TAB_BAR_PREFAB_META_PATH, "utf8") !== tabBarPrefabMetaSource) {
      fail("SpiritSystemTabBar.prefab.meta is stale. Run node tools/generate-spirit-hall-prefab.js.");
    }
    console.log(hallOnly ? "SpiritHallView prefab validation passed." : "SpiritHallView and SpiritSystemTabBar prefab validation passed.");
    return;
  }

  fs.writeFileSync(PREFAB_PATH, prefabSource, "utf8");
  fs.writeFileSync(PREFAB_META_PATH, prefabMetaSource, "utf8");
  if (!hallOnly) {
    fs.writeFileSync(TAB_BAR_PREFAB_PATH, tabBarPrefabSource, "utf8");
    fs.writeFileSync(TAB_BAR_PREFAB_META_PATH, tabBarPrefabMetaSource, "utf8");
  }
  console.log(hallOnly
    ? "Generated " + path.relative(PROJECT_ROOT, PREFAB_PATH) + "."
    : "Generated " + path.relative(PROJECT_ROOT, PREFAB_PATH) + " and " + path.relative(PROJECT_ROOT, TAB_BAR_PREFAB_PATH) + "."
  );
}

main();
