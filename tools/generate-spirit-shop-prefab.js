"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var SPIRIT_ROOT = path.join(PROJECT_ROOT, "assets", "spirit_system");
var PREFAB_PATH = path.join(SPIRIT_ROOT, "prefabs", "SpiritShopView.prefab");
var PREFAB_META_PATH = PREFAB_PATH + ".meta";
var PREFAB_UUID = "62cfdec6-456c-4912-973a-3009499a94ed";
var TAB_BAR_PREFAB_META_PATH = path.join(
  SPIRIT_ROOT,
  "prefabs",
  "SpiritSystemTabBar.prefab.meta"
);
var TAB_BAR_PREFAB_UUID = "2ac46b30-6e50-4a7d-9c55-658b89eaf421";
var TAB_BAR_MOUNT_SCRIPT_PATH = path.join(SPIRIT_ROOT, "SpiritSystemTabBarMount.js");
var TAB_BAR_MOUNT_SCRIPT_META_PATH = TAB_BAR_MOUNT_SCRIPT_PATH + ".meta";
var TAB_BAR_MOUNT_SCRIPT_UUID = "775bfbbb-22fb-4e78-b5d3-60f4ea26a973";
var SCREEN_ADAPTER_SCRIPT_PATH = path.join(SPIRIT_ROOT, "SpiritShopScreenAdapter.js");
var SCREEN_ADAPTER_SCRIPT_META_PATH = SCREEN_ADAPTER_SCRIPT_PATH + ".meta";
var SCREEN_ADAPTER_SCRIPT_UUID = "e1880e29-b519-4a73-9f98-d06c6b234c87";
var DEFAULT_MATERIAL_UUID = "eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432";
var DESIGN_WIDTH = 720;
var DESIGN_HEIGHT = 1280;
var CATEGORY_PANEL_GAP = 10;

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

function loadSpriteFrame(relativePath, expectedWidth, expectedHeight) {
  assertFinitePositive(expectedWidth, relativePath + " expected width");
  assertFinitePositive(expectedHeight, relativePath + " expected height");
  var assetPath = path.join(SPIRIT_ROOT, relativePath);
  var metaPath = assetPath + ".meta";
  if (!fs.existsSync(assetPath)) {
    fail("Required spirit shop image is missing: " + path.relative(PROJECT_ROOT, assetPath));
  }
  if (!fs.existsSync(metaPath)) {
    fail("Required spirit shop image meta is missing: " + path.relative(PROJECT_ROOT, metaPath));
  }
  var meta = readJson(metaPath);
  if (meta.importer !== "texture" || meta.type !== "sprite") {
    fail(relativePath + " must be imported as a sprite texture.");
  }
  if (meta.width !== expectedWidth || meta.height !== expectedHeight) {
    fail(
      relativePath + " must be " + expectedWidth + "x" + expectedHeight +
      ", received " + meta.width + "x" + meta.height + "."
    );
  }
  var subMetaNames = Object.keys(meta.subMetas);
  if (subMetaNames.length !== 1) {
    fail(relativePath + " must expose exactly one SpriteFrame subMeta.");
  }
  var subMeta = meta.subMetas[subMetaNames[0]];
  if (!subMeta || typeof subMeta.uuid !== "string" || subMeta.uuid.length === 0) {
    fail(relativePath + " SpriteFrame UUID is missing.");
  }
  if (
    subMeta.rawWidth !== expectedWidth ||
    subMeta.rawHeight !== expectedHeight ||
    subMeta.width !== expectedWidth ||
    subMeta.height !== expectedHeight
  ) {
    fail(relativePath + " must preserve its original untrimmed dimensions.");
  }
  return {
    path: relativePath.replace(/\\/g, "/"),
    uuid: subMeta.uuid,
    width: expectedWidth,
    height: expectedHeight
  };
}

var frames = {
  background: loadSpriteFrame("image/shop/bg.jpg", 720, 1280),
  backButton: loadSpriteFrame("image/tabbar/back_button.png", 71, 71),
  beigeItemCard: loadSpriteFrame("image/shop/beige_item_card.png", 142, 100),
  fragmentBag: loadSpriteFrame("image/shop/blue_potion_bag_item.png", 85, 103),
  blueShopPanel: loadSpriteFrame("image/shop/blue_shop_panel.png", 227, 358),
  crystalShopItem: loadSpriteFrame("image/shop/crystal_shop_item.png", 89, 92),
  elfShopTitle: loadSpriteFrame("image/shop/elf_shop_title.png", 348, 130),
  fireItemSlot: loadSpriteFrame("image/shop/fire_item_slot.png", 99, 121),
  floraFragments: loadSpriteFrame("image/tabbar/flora_fragments.png", 111, 115),
  fruitBasket: loadSpriteFrame("image/shop/fruit_basket_item.png", 84, 100),
  goldSack: loadSpriteFrame("image/shop/gold_sack_item.png", 87, 102),
  greenButton: loadSpriteFrame("image/shop/green_button.png", 157, 45),
  greenShopPanel: loadSpriteFrame("image/shop/green_shop_panel.png", 227, 358),
  iceItemSlot: loadSpriteFrame("image/shop/ice_item_slot.png", 98, 121),
  iceTower: loadSpriteFrame("image/shop/ice_tower_item.png", 85, 104),
  keluFragments: loadSpriteFrame("image/tabbar/kelu_fragments.png", 118, 110),
  leafItemSlot: loadSpriteFrame("image/shop/leaf_item_slot.png", 98, 121),
  lightningItemSlot: loadSpriteFrame("image/shop/lightning_item_slot.png", 98, 121),
  locoFragments: loadSpriteFrame("image/tabbar/loco_fragments.png", 106, 110),
  lumiFragments: loadSpriteFrame("image/tabbar/lumi_fragments.png", 118, 115),
  miluFragments: loadSpriteFrame("image/tabbar/milu_fragments.png", 106, 115),
  mushroomHouse: loadSpriteFrame("image/shop/mushroom_house_item.png", 86, 103),
  noyaFragments: loadSpriteFrame("image/tabbar/noya_fragments.png", 111, 110),
  redShopPanel: loadSpriteFrame("image/shop/red_shop_panel.png", 224, 358),
  royalEgg: loadSpriteFrame("image/shop/royal_egg_item.png", 85, 102),
  starItemSlot: loadSpriteFrame("image/shop/star_item_slot.png", 97, 121),
  windItemSlot: loadSpriteFrame("image/shop/wind_item_slot.png", 97, 121),
  yellowButton: loadSpriteFrame("image/shop/yellow_button.png", 123, 43),
  yumiFragments: loadSpriteFrame("image/tabbar/yumi_fragments.png", 118, 106),
  coinIcon: loadSpriteFrame("image/tabbar/coin_icon.png", 40, 41),
  gemIcon: loadSpriteFrame("image/tabbar/gem_icon.png", 42, 40),
  narrowDarkPanel: loadSpriteFrame("image/shop/narrow_dark_panel.png", 279, 80)
};

function validateSharedTabBar() {
  var prefabPath = path.join(SPIRIT_ROOT, "prefabs", "SpiritSystemTabBar.prefab");
  if (!fs.existsSync(prefabPath)) {
    fail("SpiritSystemTabBar.prefab is missing.");
  }
  if (!fs.existsSync(TAB_BAR_PREFAB_META_PATH)) {
    fail("SpiritSystemTabBar.prefab.meta is missing.");
  }
  var meta = readJson(TAB_BAR_PREFAB_META_PATH);
  if (meta.importer !== "prefab" || meta.uuid !== TAB_BAR_PREFAB_UUID) {
    fail("SpiritSystemTabBar.prefab.meta importer or UUID is invalid.");
  }
  if (!fs.existsSync(TAB_BAR_MOUNT_SCRIPT_PATH) || !fs.existsSync(TAB_BAR_MOUNT_SCRIPT_META_PATH)) {
    fail("SpiritSystemTabBarMount script or meta is missing.");
  }
  var mountMeta = readJson(TAB_BAR_MOUNT_SCRIPT_META_PATH);
  if (mountMeta.importer !== "javascript" || mountMeta.uuid !== TAB_BAR_MOUNT_SCRIPT_UUID) {
    fail("SpiritSystemTabBarMount.js.meta importer or UUID is invalid.");
  }
}

function validateScreenAdapter() {
  if (!fs.existsSync(SCREEN_ADAPTER_SCRIPT_PATH) || !fs.existsSync(SCREEN_ADAPTER_SCRIPT_META_PATH)) {
    fail("SpiritShopScreenAdapter script or meta is missing.");
  }
  var adapterMeta = readJson(SCREEN_ADAPTER_SCRIPT_META_PATH);
  if (adapterMeta.importer !== "javascript" || adapterMeta.uuid !== SCREEN_ADAPTER_SCRIPT_UUID) {
    fail("SpiritShopScreenAdapter.js.meta importer or UUID is invalid.");
  }
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

function typedTransform(x, y) {
  return {
    "__type__": "TypedArray",
    ctor: "Float64Array",
    array: [x, y, 0, 0, 0, 0, 1, 1, 1, 1]
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

function createBuilder() {
  var objects = [];
  var nodesById = {};
  var prefab = {
    "__type__": "cc.Prefab",
    "_name": "SpiritShopView",
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
      "_active": true,
      "_components": [],
      "_prefab": null,
      "_opacity": 255,
      "_color": color(255, 255, 255, 255),
      "_contentSize": size(options.width, options.height),
      "_anchorPoint": vec2(options.anchorX, options.anchorY),
      "_trs": typedTransform(options.x, options.y),
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
      fileId: stableFileId("SpiritShopView", key),
      sync: false
    });
    node._prefab = { "__id__": infoId };
  }

  function addSprite(nodeId, frame, enabled, spriteType) {
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
      "_type": spriteType,
      "_sizeMode": 0,
      "_fillType": 0,
      "_fillCenter": vec2(0, 0),
      "_fillStart": 0,
      "_fillRange": 0,
      "_isTrimmedMode": false,
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

  function addLabel(nodeId, options) {
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

  function addMask(nodeId) {
    return addComponent(nodeId, {
      "__type__": "cc.Mask",
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      "_materials": [
        { "__uuid__": DEFAULT_MATERIAL_UUID }
      ],
      "_spriteFrame": null,
      "_type": 0,
      "_segments": 64,
      "_N$alphaThreshold": 0,
      "_N$inverted": false,
      "_id": ""
    });
  }

  function addScrollView(nodeId, contentNodeId) {
    requireNode(contentNodeId, "ScrollView content");
    return addComponent(nodeId, {
      "__type__": "cc.ScrollView",
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      horizontal: true,
      vertical: false,
      inertia: true,
      brake: 0.75,
      elastic: true,
      bounceDuration: 0.23,
      scrollEvents: [],
      cancelInnerEvents: true,
      "_N$content": { "__id__": contentNodeId },
      content: { "__id__": contentNodeId },
      "_N$horizontalScrollBar": null,
      "_N$verticalScrollBar": null,
      "_id": ""
    });
  }

  function addTabBarMount(nodeId) {
    addComponent(nodeId, {
      "__type__": compressUuid(TAB_BAR_MOUNT_SCRIPT_UUID),
      "_name": "",
      "_objFlags": 0,
      node: { "__id__": nodeId },
      "_enabled": true,
      tabBarPrefab: { "__uuid__": TAB_BAR_PREFAB_UUID },
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
      fail("SpiritShopView root must be object id 1.");
    }
    prefab.data = { "__id__": rootId };
  }

  return {
    objects: objects,
    addNode: addNode,
    addSprite: addSprite,
    addButton: addButton,
    addLabel: addLabel,
    addWidget: addWidget,
    addBlockInput: addBlockInput,
    addSafeArea: addSafeArea,
    addMask: addMask,
    addScrollView: addScrollView,
    addTabBarMount: addTabBarMount,
    addScreenAdapter: addScreenAdapter,
    addPrefabInfo: addPrefabInfo,
    finishRoot: finishRoot
  };
}

function nodeOptions(name, parentId, x, y, width, height) {
  return {
    name: name,
    parentId: parentId,
    x: x,
    y: y,
    width: width,
    height: height,
    anchorX: 0.5,
    anchorY: 0.5
  };
}

function rootX(screenX) {
  return screenX - DESIGN_WIDTH / 2;
}

function rootY(screenY) {
  return DESIGN_HEIGHT / 2 - screenY;
}

var WHITE = { r: 255, g: 255, b: 255, a: 255 };
var CREAM = { r: 255, g: 246, b: 214, a: 255 };
var DARK_BROWN = { r: 76, g: 39, b: 20, a: 255 };
var GOLD = { r: 255, g: 225, b: 80, a: 255 };
var OUTLINE_BROWN = { r: 71, g: 31, b: 15, a: 255 };
var OUTLINE_BLUE = { r: 13, g: 48, b: 82, a: 255 };

function buildPrefab() {
  validateSharedTabBar();
  validateScreenAdapter();
  var builder = createBuilder();
  var root = builder.addNode(nodeOptions("SpiritShopView", null, 360, 640, DESIGN_WIDTH, DESIGN_HEIGHT));
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
  var spriteLayer = builder.addNode(
    nodeOptions("SpriteRenderLayer", designContent, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
  );
  builder.addPrefabInfo(spriteLayer, "SpriteRenderLayer");
  var textLayer = builder.addNode(
    nodeOptions("TextRenderLayer", designContent, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
  );
  builder.addPrefabInfo(textLayer, "TextRenderLayer");
  var logicLayer = builder.addNode(
    nodeOptions("LogicLayer", designContent, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
  );
  builder.addPrefabInfo(logicLayer, "LogicLayer");

  var sections = {
    BackgroundAnchors: backgroundAnchors
  };
  ["TopBar", "FragmentMarket", "CategoryMarket", "BottomNavigationMount"].forEach(function (name) {
    sections[name] = builder.addNode(nodeOptions(name, logicLayer, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT));
    builder.addPrefabInfo(sections[name], name);
  });
  builder.addTabBarMount(sections.BottomNavigationMount);
  var textSections = {};
  ["TopBar", "FragmentMarket", "CategoryMarket"].forEach(function (name) {
    var textSectionName = name + "Text";
    textSections[name] = builder.addNode(
      nodeOptions(textSectionName, textLayer, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
    );
    builder.addPrefabInfo(textSections[name], textSectionName);
  });

  var artIndex = 0;
  function addArt(sectionName, name, frame, screenX, screenY, width, height, clickable, spriteType) {
    assertFinitePositive(width, name + " width");
    assertFinitePositive(height, name + " height");
    var sourceNode = builder.addNode(
      nodeOptions(
        "source__" + name,
        sections[sectionName],
        rootX(screenX),
        rootY(screenY),
        width,
        height
      )
    );
    builder.addSprite(sourceNode, frame, false, spriteType);
    builder.addPrefabInfo(sourceNode, "source/" + artIndex + "/" + name);
    var renderParent = sectionName === "BackgroundAnchors" ? backgroundRenderLayer : spriteLayer;
    var proxyNode = builder.addNode(
      nodeOptions(
        "proxy__" + name,
        renderParent,
        rootX(screenX),
        rootY(screenY),
        width,
        height
      )
    );
    builder.addSprite(proxyNode, frame, true, spriteType);
    builder.addPrefabInfo(proxyNode, "proxy/" + artIndex + "/" + name);
    if (clickable) {
      builder.addButton(sourceNode, proxyNode);
    }
    artIndex += 1;
    return {
      sourceNode: sourceNode,
      proxyNode: proxyNode
    };
  }

  var textIndex = 0;
  function addText(sectionName, name, text, screenX, screenY, width, height, fontSize, textColor, options) {
    if (!Object.prototype.hasOwnProperty.call(textSections, sectionName)) {
      fail("Unknown SpiritShopView text section: " + sectionName + ".");
    }
    var labelOptions = nodeOptions(
      name,
      textSections[sectionName],
      rootX(screenX),
      rootY(screenY),
      width,
      height
    );
    labelOptions.anchorX = options.anchorX;
    var labelNode = builder.addNode(labelOptions);
    builder.objects[labelNode]._color = color(textColor.r, textColor.g, textColor.b, textColor.a);
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
  }

  function centeredTextOptions(lineHeight, outlineWidth, outlineColor) {
    return {
      anchorX: 0.5,
      lineHeight: lineHeight,
      wrap: false,
      bold: true,
      horizontalAlign: 1,
      overflow: 1,
      outlineWidth: outlineWidth,
      outlineColor: outlineColor
    };
  }

  function leftTextOptions(lineHeight, wrap, outlineWidth, outlineColor) {
    return {
      anchorX: 0,
      lineHeight: lineHeight,
      wrap: wrap,
      bold: true,
      horizontalAlign: 0,
      overflow: wrap ? 2 : 1,
      outlineWidth: outlineWidth,
      outlineColor: outlineColor
    };
  }

  addArt("BackgroundAnchors", "background", frames.background, 360, 640, 720, 1280, false, 0);

  addArt("TopBar", "shop_title", frames.elfShopTitle, 360, 78, 348, 130, false, 0);
  addArt("TopBar", "back_button", frames.backButton, 54, 68, 71, 71, true, 0);
  addArt("TopBar", "coin_panel", frames.narrowDarkPanel, 607, 51, 196, 54, false, 0);
  addArt("TopBar", "gem_panel", frames.narrowDarkPanel, 607, 107, 196, 54, false, 0);
  addArt("TopBar", "coin_icon", frames.coinIcon, 532, 51, 40, 41, false, 0);
  addArt("TopBar", "gem_icon", frames.gemIcon, 532, 107, 42, 40, false, 0);
  addText(
    "TopBar",
    "coin_value",
    "128.6万",
    612,
    51,
    118,
    40,
    27,
    WHITE,
    centeredTextOptions(30, 2, OUTLINE_BLUE)
  );
  addText(
    "TopBar",
    "gem_value",
    "4568",
    612,
    107,
    118,
    40,
    28,
    WHITE,
    centeredTextOptions(30, 2, OUTLINE_BLUE)
  );

  addArt(
    "FragmentMarket",
    "fragment_market_panel",
    frames.beigeItemCard,
    360,
    601,
    680,
    332,
    false,
    1
  );
  addText(
    "FragmentMarket",
    "fragment_market_title",
    "◆  精灵碎片  ◆",
    360,
    458,
    280,
    38,
    28,
    DARK_BROWN,
    centeredTextOptions(32, 1, CREAM)
  );

  var FRAGMENT_LIST_SCREEN_X = 360;
  var FRAGMENT_LIST_SCREEN_Y = 598;
  var FRAGMENT_LIST_WIDTH = 670;
  var FRAGMENT_LIST_HEIGHT = 214;
  var FRAGMENT_LIST_CONTENT_WIDTH = 780;
  var FRAGMENT_LIST_LEFT_SCROLL_OFFSET = (FRAGMENT_LIST_CONTENT_WIDTH - FRAGMENT_LIST_WIDTH) / 2;
  var fragmentOfferScrollViewport = builder.addNode(
    nodeOptions(
      "fragment_offer_scroll_viewport",
      sections.FragmentMarket,
      rootX(FRAGMENT_LIST_SCREEN_X),
      rootY(FRAGMENT_LIST_SCREEN_Y),
      FRAGMENT_LIST_WIDTH,
      FRAGMENT_LIST_HEIGHT
    )
  );
  builder.addPrefabInfo(fragmentOfferScrollViewport, "fragment_offer_scroll_viewport");
  var fragmentOfferScrollView = builder.addNode(
    nodeOptions("fragment_offer_scroll_view", fragmentOfferScrollViewport, 0, 0, FRAGMENT_LIST_WIDTH, FRAGMENT_LIST_HEIGHT)
  );
  builder.addMask(fragmentOfferScrollView);
  builder.addPrefabInfo(fragmentOfferScrollView, "fragment_offer_scroll_view");
  var fragmentOfferScrollContent = builder.addNode(
    nodeOptions("fragment_offer_scroll_content", fragmentOfferScrollView, 0, 0, FRAGMENT_LIST_CONTENT_WIDTH, FRAGMENT_LIST_HEIGHT)
  );
  builder.addPrefabInfo(fragmentOfferScrollContent, "fragment_offer_scroll_content");
  builder.addScrollView(fragmentOfferScrollViewport, fragmentOfferScrollContent);

  var fragmentOfferProxyViewport = builder.addNode(
    nodeOptions(
      "fragment_offer_proxy_viewport",
      spriteLayer,
      rootX(FRAGMENT_LIST_SCREEN_X),
      rootY(FRAGMENT_LIST_SCREEN_Y),
      FRAGMENT_LIST_WIDTH,
      FRAGMENT_LIST_HEIGHT
    )
  );
  builder.addMask(fragmentOfferProxyViewport);
  builder.addPrefabInfo(fragmentOfferProxyViewport, "fragment_offer_proxy_viewport");
  var fragmentOfferProxyContent = builder.addNode(
    nodeOptions("fragment_offer_proxy_content", fragmentOfferProxyViewport, 0, 0, FRAGMENT_LIST_CONTENT_WIDTH, FRAGMENT_LIST_HEIGHT)
  );
  builder.addPrefabInfo(fragmentOfferProxyContent, "fragment_offer_proxy_content");

  var fragmentOfferTextViewport = builder.addNode(
    nodeOptions(
      "fragment_offer_text_viewport",
      textSections.FragmentMarket,
      rootX(FRAGMENT_LIST_SCREEN_X),
      rootY(FRAGMENT_LIST_SCREEN_Y),
      FRAGMENT_LIST_WIDTH,
      FRAGMENT_LIST_HEIGHT
    )
  );
  builder.addMask(fragmentOfferTextViewport);
  builder.addPrefabInfo(fragmentOfferTextViewport, "fragment_offer_text_viewport");
  var fragmentOfferTextContent = builder.addNode(
    nodeOptions("fragment_offer_text_content", fragmentOfferTextViewport, 0, 0, FRAGMENT_LIST_CONTENT_WIDTH, FRAGMENT_LIST_HEIGHT)
  );
  builder.addPrefabInfo(fragmentOfferTextContent, "fragment_offer_text_content");

  function addFragmentArt(name, frame, screenX, screenY, width, height, clickable) {
    var localX = rootX(screenX) - rootX(FRAGMENT_LIST_SCREEN_X) - FRAGMENT_LIST_LEFT_SCROLL_OFFSET;
    var localY = rootY(screenY) - rootY(FRAGMENT_LIST_SCREEN_Y);
    var sourceNode = builder.addNode(
      nodeOptions("source__" + name, fragmentOfferScrollContent, localX, localY, width, height)
    );
    builder.addSprite(sourceNode, frame, false, 0);
    builder.addPrefabInfo(sourceNode, "fragment-source/" + artIndex + "/" + name);
    var proxyNode = builder.addNode(
      nodeOptions("proxy__" + name, fragmentOfferProxyContent, localX, localY, width, height)
    );
    builder.addSprite(proxyNode, frame, true, 0);
    builder.addPrefabInfo(proxyNode, "fragment-proxy/" + artIndex + "/" + name);
    if (clickable) {
      builder.addButton(sourceNode, proxyNode);
    }
    artIndex += 1;
  }

  function addFragmentText(name, text, screenX, screenY, width, height, fontSize, textColor, options) {
    var labelOptions = nodeOptions(
      name,
      fragmentOfferTextContent,
      rootX(screenX) - rootX(FRAGMENT_LIST_SCREEN_X) - FRAGMENT_LIST_LEFT_SCROLL_OFFSET,
      rootY(screenY) - rootY(FRAGMENT_LIST_SCREEN_Y),
      width,
      height
    );
    labelOptions.anchorX = options.anchorX;
    var labelNode = builder.addNode(labelOptions);
    builder.objects[labelNode]._color = color(textColor.r, textColor.g, textColor.b, textColor.a);
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
    builder.addPrefabInfo(labelNode, "fragment-text/" + textIndex + "/" + name);
    textIndex += 1;
  }

  [
    { key: "milu", name: "米露碎片", frame: frames.starItemSlot, fragment: frames.miluFragments, fragmentWidth: 74, fragmentHeight: 73, x: 82, nameColor: { r: 84, g: 39, b: 128, a: 255 } },
    { key: "lumi", name: "露米碎片", frame: frames.fireItemSlot, fragment: frames.lumiFragments, fragmentWidth: 76, fragmentHeight: 74, x: 193, nameColor: { r: 139, g: 36, b: 25, a: 255 } },
    { key: "noya", name: "诺亚碎片", frame: frames.windItemSlot, fragment: frames.noyaFragments, fragmentWidth: 74, fragmentHeight: 73, x: 304, nameColor: { r: 39, g: 111, b: 51, a: 255 } },
    { key: "flora", name: "芙洛碎片", frame: frames.leafItemSlot, fragment: frames.floraFragments, fragmentWidth: 72, fragmentHeight: 75, x: 415, nameColor: { r: 44, g: 105, b: 37, a: 255 } },
    { key: "loco", name: "洛可碎片", frame: frames.iceItemSlot, fragment: frames.locoFragments, fragmentWidth: 72, fragmentHeight: 75, x: 526, nameColor: { r: 24, g: 82, b: 135, a: 255 } },
    { key: "kelu", name: "可露碎片", frame: frames.lightningItemSlot, fragment: frames.keluFragments, fragmentWidth: 72, fragmentHeight: 72, x: 637, nameColor: { r: 116, g: 86, b: 14, a: 255 } },
    { key: "yumi", name: "悠米碎片", frame: frames.starItemSlot, fragment: frames.yumiFragments, fragmentWidth: 74, fragmentHeight: 69, x: 748, nameColor: { r: 84, g: 39, b: 128, a: 255 } }
  ].forEach(function (item, itemIndex) {
    var offerKey = "fragment_offer_" + (itemIndex + 1);
    addFragmentText(offerKey + "_name", item.name, item.x, 508, 104, 30, 17, item.nameColor, centeredTextOptions(22, 1, CREAM));
    addFragmentArt(offerKey + "_slot", item.frame, item.x, 574, item.frame.width, item.frame.height, false);
    addFragmentArt(offerKey + "_art", item.fragment, item.x, 574, item.fragmentWidth, item.fragmentHeight, false);
    addFragmentText(offerKey + "_quantity", "x10", item.x + 29, 612, 48, 24, 17, WHITE, centeredTextOptions(20, 2, OUTLINE_BROWN));
    addFragmentArt(offerKey + "_buy_button", frames.yellowButton, item.x, 687, 99, 39, true);
    addFragmentArt(offerKey + "_price_gem", frames.gemIcon, item.x - 24, 687, 24, 23, false);
    addFragmentText(offerKey + "_price", "60", item.x + 16, 687, 52, 28, 21, DARK_BROWN, centeredTextOptions(24, 1, CREAM));
  });

  addText(
    "FragmentMarket",
    "fragment_refresh_hint",
    "每日5点自动刷新",
    285,
    742,
    180,
    30,
    17,
    DARK_BROWN,
    centeredTextOptions(22, 0, OUTLINE_BROWN)
  );
  addArt(
    "FragmentMarket",
    "fragment_refresh_button",
    frames.greenButton,
    610,
    742,
    157,
    45,
    true,
    0
  );
  addArt(
    "FragmentMarket",
    "fragment_refresh_gem",
    frames.gemIcon,
    565,
    742,
    26,
    25,
    false,
    0
  );
  addText(
    "FragmentMarket",
    "fragment_refresh_cost",
    "20",
    592,
    742,
    42,
    28,
    20,
    WHITE,
    centeredTextOptions(24, 2, OUTLINE_BROWN)
  );
  addText(
    "FragmentMarket",
    "fragment_refresh_label",
    "刷新",
    642,
    742,
    68,
    30,
    22,
    WHITE,
    centeredTextOptions(26, 2, OUTLINE_BROWN)
  );

  var columns = [
    {
      key: "favor",
      panel: frames.redShopPanel,
      title: "好感礼物",
      titleColor: { r: 124, g: 34, b: 27, a: 255 },
      items: [
        {
          key: "royal_egg",
          art: frames.royalEgg,
          artWidth: 73,
          artHeight: 87,
          title: "星光糖果",
          description: "提升精灵好感度50点",
          price: "20"
        },
        {
          key: "fruit_basket",
          art: frames.fruitBasket,
          artWidth: 71,
          artHeight: 85,
          title: "魔法果篮",
          description: "提升精灵好感度200点",
          price: "60"
        }
      ]
    },
    {
      key: "house",
      panel: frames.greenShopPanel,
      title: "小屋装饰",
      titleColor: { r: 48, g: 91, b: 31, a: 255 },
      items: [
        {
          key: "ice_tower",
          art: frames.iceTower,
          artWidth: 70,
          artHeight: 86,
          title: "精灵喷泉",
          description: "装饰小屋喷泉",
          price: "120"
        },
        {
          key: "mushroom_house",
          art: frames.mushroomHouse,
          artWidth: 70,
          artHeight: 84,
          title: "蘑菇小屋",
          description: "装饰小屋建筑",
          price: "180"
        }
      ]
    },
    {
      key: "resource",
      panel: frames.blueShopPanel,
      title: "资源道具",
      titleColor: { r: 31, g: 63, b: 111, a: 255 },
      items: [
        {
          key: "gold_sack",
          art: frames.goldSack,
          artWidth: 72,
          artHeight: 84,
          title: "金币袋",
          description: "获得10000金币",
          price: "25"
        },
        {
          key: "fragment_bag",
          art: frames.fragmentBag,
          artWidth: 70,
          artHeight: 85,
          title: "碎片袋",
          description: "随机获得一名精灵的5～10片碎片",
          price: "30"
        }
      ]
    }
  ];

  var categoryPanelsWidth = columns.reduce(function (totalWidth, column) {
    return totalWidth + column.panel.width;
  }, CATEGORY_PANEL_GAP * (columns.length - 1));
  var categoryPanelLeft = (DESIGN_WIDTH - categoryPanelsWidth) / 2;
  columns.forEach(function (column) {
    column.x = categoryPanelLeft + column.panel.width / 2;
    categoryPanelLeft += column.panel.width + CATEGORY_PANEL_GAP;
  });

  columns.forEach(function (column) {
    addArt(
      "CategoryMarket",
      column.key + "_panel",
      column.panel,
      column.x,
      953,
      column.panel.width,
      column.panel.height,
      false,
      0
    );
    addText(
      "CategoryMarket",
      column.key + "_panel_title",
      column.title,
      column.x,
      804,
      154,
      34,
      24,
      column.titleColor,
      centeredTextOptions(28, 2, CREAM)
    );
    column.items.forEach(function (item, itemIndex) {
      var centerY = itemIndex === 0 ? 899 : 1037;
      addArt(
        "CategoryMarket",
        item.key + "_card",
        frames.beigeItemCard,
        column.x,
        centerY,
        196,
        122,
        true,
        1
      );
      addArt(
        "CategoryMarket",
        item.key + "_art",
        item.art,
        column.x - 59,
        centerY + 5,
        item.artWidth,
        item.artHeight,
        false,
        0
      );
      addText(
        "CategoryMarket",
        item.key + "_title",
        item.title,
        column.x - 13,
        centerY - 35,
        110,
        28,
        20,
        DARK_BROWN,
        leftTextOptions(24, false, 1, CREAM)
      );
      addText(
        "CategoryMarket",
        item.key + "_description",
        item.description,
        column.x - 13,
        centerY - 5,
        105,
        36,
        13,
        DARK_BROWN,
        leftTextOptions(18, true, 0, OUTLINE_BROWN)
      );
      addArt(
        "CategoryMarket",
        item.key + "_price_gem",
        frames.gemIcon,
        column.x + 7,
        centerY + 38,
        23,
        22,
        false,
        0
      );
      addText(
        "CategoryMarket",
        item.key + "_price",
        item.price,
        column.x + 39,
        centerY + 38,
        48,
        26,
        18,
        DARK_BROWN,
        centeredTextOptions(22, 1, CREAM)
      );
    });
  });

  return builder.objects;
}

function walkIds(value, visitor) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (
    Object.prototype.hasOwnProperty.call(value, "__id__") &&
    Object.keys(value).length === 1
  ) {
    visitor(value.__id__);
    return;
  }
  Object.keys(value).forEach(function (key) {
    walkIds(value[key], visitor);
  });
}

function validatePrefabObjects(objects) {
  if (!Array.isArray(objects) || objects.length < 2) {
    fail("SpiritShopView prefab must contain serialized objects.");
  }
  objects.forEach(function (object, objectIndex) {
    walkIds(object, function (referencedId) {
      if (!Number.isInteger(referencedId) || referencedId < 0 || referencedId >= objects.length) {
        fail("SpiritShopView object " + objectIndex + " references invalid __id__ " + referencedId + ".");
      }
    });
  });

  var nodesByName = {};
  var sourceSpriteCount = 0;
  var proxySpriteCount = 0;
  var buttonCount = 0;
  var safeAreaCount = 0;
  var tabBarMountCount = 0;
  var screenAdapterCount = 0;
  var allowedSpriteFrameUuids = {};
  Object.keys(frames).forEach(function (frameKey) {
    var frame = frames[frameKey];
    if (
      frame.path.indexOf("image/shop/") !== 0 &&
      frame.path.indexOf("image/tabbar/") !== 0
    ) {
      fail(
        "SpiritShopView frame must belong to image/shop or image/tabbar: " +
        frame.path + "."
      );
    }
    allowedSpriteFrameUuids[frame.uuid] = true;
  });
  objects.forEach(function (object) {
    if (object.__type__ === "cc.Button") {
      buttonCount += 1;
    }
    if (object.__type__ === "cc.SafeArea") {
      safeAreaCount += 1;
    }
    if (object.__type__ === compressUuid(TAB_BAR_MOUNT_SCRIPT_UUID)) {
      tabBarMountCount += 1;
      if (
        !object.tabBarPrefab ||
        object.tabBarPrefab.__uuid__ !== TAB_BAR_PREFAB_UUID
      ) {
        fail("SpiritSystemTabBarMount must reference the shared SpiritSystemTabBar prefab.");
      }
    }
    if (object.__type__ === compressUuid(SCREEN_ADAPTER_SCRIPT_UUID)) {
      screenAdapterCount += 1;
    }
    if (
      object.__type__ === "cc.Sprite" &&
      (
        !object._spriteFrame ||
        !allowedSpriteFrameUuids[object._spriteFrame.__uuid__]
      )
    ) {
      fail("SpiritShopView SpriteFrame must belong to image/shop or image/tabbar.");
    }
    if (object.__type__ !== "cc.Node") {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(nodesByName, object._name)) {
      fail("SpiritShopView node names must be globally unique: " + object._name + ".");
    }
    nodesByName[object._name] = object;
    var sprite = object._components.map(function (componentReference) {
      return objects[componentReference.__id__];
    }).find(function (component) {
      return component && component.__type__ === "cc.Sprite";
    });
    if (object._name.indexOf("source__") === 0) {
      if (!sprite || sprite._enabled !== false) {
        fail(object._name + " must contain one disabled source cc.Sprite.");
      }
      sourceSpriteCount += 1;
    }
    if (object._name.indexOf("proxy__") === 0) {
      if (!sprite || sprite._enabled !== true) {
        fail(object._name + " must contain one enabled proxy cc.Sprite.");
      }
      proxySpriteCount += 1;
    }
  });

  [
    "SpiritShopView",
    "FullBleedBackgroundLayer",
    "SafeAreaRoot",
    "DesignContent",
    "SpriteRenderLayer",
    "TextRenderLayer",
    "TopBarText",
    "FragmentMarketText",
    "CategoryMarketText",
    "LogicLayer",
    "TopBar",
    "FragmentMarket",
    "CategoryMarket",
    "BottomNavigationMount",
    "source__background",
    "proxy__background",
    "source__fragment_market_panel",
    "proxy__fragment_market_panel"
  ].forEach(function (nodeName) {
    if (!Object.prototype.hasOwnProperty.call(nodesByName, nodeName)) {
      fail("SpiritShopView requires node: " + nodeName + ".");
    }
  });

  [
    "SpiritSystemTabBar",
    "SpiritSystemTabBarSpriteLayer",
    "SpiritSystemTabBarLogicLayer",
    "source__bottom_navigation_bar",
    "proxy__bottom_navigation_bar"
  ].forEach(function (nodeName) {
    if (Object.prototype.hasOwnProperty.call(nodesByName, nodeName)) {
      fail("SpiritShopView must not inline shared tab bar node: " + nodeName + ".");
    }
  });

  Object.keys(nodesByName).forEach(function (nodeName) {
    if (nodeName.indexOf("source__") !== 0) {
      return;
    }
    var proxyName = "proxy__" + nodeName.slice("source__".length);
    var sourceNode = nodesByName[nodeName];
    var proxyNode = nodesByName[proxyName];
    if (!proxyNode) {
      fail("SpiritShopView proxy node is missing: " + proxyName + ".");
    }
    var sourceSprite = objects[sourceNode._components[0].__id__];
    var proxySprite = objects[proxyNode._components[0].__id__];
    if (
      sourceSprite._spriteFrame.__uuid__ !== proxySprite._spriteFrame.__uuid__ ||
      sourceSprite._type !== proxySprite._type
    ) {
      fail(proxyName + " must use the same SpriteFrame and Sprite type as " + nodeName + ".");
    }
  });

  if (sourceSpriteCount === 0 || sourceSpriteCount !== proxySpriteCount) {
    fail(
      "SpiritShopView proxy/source Sprite counts must match and be non-zero, received " +
      sourceSpriteCount + "/" + proxySpriteCount + "."
    );
  }
  if (buttonCount !== 15) {
    fail("SpiritShopView requires exactly 15 authored Button components, received " + buttonCount + ".");
  }
  if (safeAreaCount !== 1) {
    fail("SpiritShopView requires exactly one cc.SafeArea component.");
  }
  if (tabBarMountCount !== 1) {
    fail("SpiritShopView requires exactly one SpiritSystemTabBarMount component.");
  }
  if (screenAdapterCount !== 1) {
    fail("SpiritShopView requires exactly one SpiritShopScreenAdapter component.");
  }
  var root = nodesByName.SpiritShopView;
  if (root._contentSize.width !== DESIGN_WIDTH || root._contentSize.height !== DESIGN_HEIGHT) {
    fail("SpiritShopView root must be 720x1280.");
  }
  var mount = nodesByName.BottomNavigationMount;
  if (!Array.isArray(mount._children) || mount._children.length !== 0) {
    fail("SpiritShopView BottomNavigationMount must remain empty before runtime TabBar instantiation.");
  }
  [
    "source__coin_add_button",
    "proxy__coin_add_button",
    "source__gem_add_button",
    "proxy__gem_add_button"
  ].forEach(function (nodeName) {
    if (nodesByName[nodeName]) {
      fail("SpiritShopView must not contain resource add button node: " + nodeName + ".");
    }
  });
  [
    nodesByName.source__favor_panel,
    nodesByName.source__house_panel,
    nodesByName.source__resource_panel
  ].forEach(function (panelNode, panelIndex, panelNodes) {
    if (!panelNode) {
      fail("SpiritShopView category panel node is missing at index " + panelIndex + ".");
    }
    if (panelIndex === 0) {
      return;
    }
    var previousPanelNode = panelNodes[panelIndex - 1];
    var previousRight = previousPanelNode._trs.array[0] + previousPanelNode._contentSize.width / 2;
    var currentLeft = panelNode._trs.array[0] - panelNode._contentSize.width / 2;
    if (currentLeft - previousRight !== CATEGORY_PANEL_GAP) {
      fail(
        "SpiritShopView category panel gap must be " + CATEGORY_PANEL_GAP +
        ", received " + (currentLeft - previousRight) + "."
      );
    }
  });
}

function serializePrefab() {
  var objects = buildPrefab();
  validatePrefabObjects(objects);
  return JSON.stringify(objects, null, 2) + "\n";
}

function serializePrefabMeta() {
  return JSON.stringify({
    ver: "1.3.2",
    uuid: PREFAB_UUID,
    importer: "prefab",
    optimizationPolicy: "AUTO",
    asyncLoadAssets: false,
    readonly: false,
    subMetas: {}
  }, null, 2) + "\n";
}

function main() {
  var prefabSource = serializePrefab();
  var prefabMetaSource = serializePrefabMeta();
  if (process.argv.indexOf("--check") >= 0) {
    if (!fs.existsSync(PREFAB_PATH) || !fs.existsSync(PREFAB_META_PATH)) {
      fail("SpiritShopView generated prefab or meta is missing.");
    }
    if (fs.readFileSync(PREFAB_PATH, "utf8") !== prefabSource) {
      fail("SpiritShopView.prefab is stale. Run node tools/generate-spirit-shop-prefab.js.");
    }
    if (fs.readFileSync(PREFAB_META_PATH, "utf8") !== prefabMetaSource) {
      fail("SpiritShopView.prefab.meta is stale. Run node tools/generate-spirit-shop-prefab.js.");
    }
    console.log("SpiritShopView prefab validation passed.");
    return;
  }
  fs.writeFileSync(PREFAB_PATH, prefabSource, "utf8");
  fs.writeFileSync(PREFAB_META_PATH, prefabMetaSource, "utf8");
  console.log("Generated " + path.relative(PROJECT_ROOT, PREFAB_PATH) + ".");
}

main();
