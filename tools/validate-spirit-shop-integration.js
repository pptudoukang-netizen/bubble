"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error("[validate-spirit-shop-integration] " + message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readText(relativePath) {
  var absolutePath = path.join(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail("Missing file: " + relativePath);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    fail("Invalid JSON `" + relativePath + "`: " + error.message);
  }
}

function requireContains(text, needle, description) {
  if (text.indexOf(needle) < 0) {
    fail(description + " is missing: " + needle);
  }
}

function requireOccurrenceCount(text, needle, expectedCount, description) {
  var count = text.split(needle).length - 1;
  if (count !== expectedCount) {
    fail(description + " must occur exactly " + expectedCount + " times, received " + count + ".");
  }
}

function requireOrdered(text, needles, description) {
  var previousIndex = -1;
  needles.forEach(function (needle) {
    var currentIndex = text.indexOf(needle, previousIndex + 1);
    if (currentIndex < 0) {
      fail(description + " is missing ordered token: " + needle);
    }
    previousIndex = currentIndex;
  });
}

function getOnlySpriteFrameMeta(textureMeta, relativePath) {
  assert(textureMeta.importer === "texture", relativePath + " must use the texture importer.");
  assert(textureMeta.type === "sprite", relativePath + " must be a sprite texture.");
  var subMetaNames = Object.keys(textureMeta.subMetas);
  assert(subMetaNames.length === 1, relativePath + " must expose exactly one SpriteFrame.");
  var spriteFrameMeta = textureMeta.subMetas[subMetaNames[0]];
  assert(
    spriteFrameMeta.importer === "sprite-frame",
    relativePath + " must expose a sprite-frame subMeta."
  );
  return spriteFrameMeta;
}

function collectSpriteFrameUuids(relativeDirectory) {
  var absoluteDirectory = path.join(PROJECT_ROOT, relativeDirectory);
  var spriteFrameUuids = {};
  fs.readdirSync(absoluteDirectory).filter(function (fileName) {
    return /\.(png|jpg)\.meta$/i.test(fileName);
  }).forEach(function (metaFileName) {
    var relativeMetaPath = path.join(relativeDirectory, metaFileName).replace(/\\/g, "/");
    var textureMeta = readJson(relativeMetaPath);
    var spriteFrameMeta = getOnlySpriteFrameMeta(textureMeta, relativeMetaPath);
    assert(
      !Object.prototype.hasOwnProperty.call(spriteFrameUuids, spriteFrameMeta.uuid),
      relativeDirectory + " contains a duplicate SpriteFrame UUID: " + spriteFrameMeta.uuid
    );
    spriteFrameUuids[spriteFrameMeta.uuid] = true;
  });
  return spriteFrameUuids;
}

function validateAtlasIsolation() {
  var groups = [
    {
      directory: "assets/spirit_system/image/shop",
      names: ["narrow_dark_panel"],
      standaloneNames: []
    },
    {
      directory: "assets/spirit_system/image/tabbar",
      names: [
        "add_button",
        "coin_icon",
        "tree_tab_icon",
        "red_notification_dot",
        "rock_tab_icon",
        "crystal_tab_icon",
        "scroll_tab_icon",
        "shop_tab_icon",
        "gem_icon"
      ],
      standaloneNames: ["bottom_navigation_bar"]
    }
  ];
  groups.forEach(function (group) {
    var atlasMeta = readJson(group.directory + "/AutoAtlas.pac.meta");
    assert(atlasMeta.importer === "auto-atlas", group.directory + " must contain an AutoAtlas.");
    assert(
      atlasMeta.maxWidth === 1024 && atlasMeta.maxHeight === 1024,
      group.directory + " AutoAtlas must remain 1024x1024."
    );
    var paddedArea = 0;
    var packableCount = 0;
    fs.readdirSync(path.join(PROJECT_ROOT, group.directory)).filter(function (fileName) {
      return /\.(png|jpg)\.meta$/i.test(fileName);
    }).forEach(function (metaFileName) {
      var textureMeta = readJson(group.directory + "/" + metaFileName);
      if (textureMeta.packable !== true) {
        return;
      }
      packableCount += 1;
      assert(
        textureMeta.width + atlasMeta.padding * 2 <= atlasMeta.maxWidth &&
        textureMeta.height + atlasMeta.padding * 2 <= atlasMeta.maxHeight,
        group.directory + "/" + metaFileName + " exceeds the AutoAtlas dimensions."
      );
      paddedArea +=
        (textureMeta.width + atlasMeta.padding * 2) *
        (textureMeta.height + atlasMeta.padding * 2);
    });
    assert(packableCount > 0, group.directory + " AutoAtlas must contain packable textures.");
    assert(
      paddedArea <= atlasMeta.maxWidth * atlasMeta.maxHeight,
      group.directory + " packable texture area exceeds one AutoAtlas page."
    );
    group.names.forEach(function (assetName) {
      var sourceRelativePath = "assets/spirit_system/image/ui/" + assetName + ".png";
      var targetRelativePath = group.directory + "/" + assetName + ".png";
      var sourceAbsolutePath = path.join(PROJECT_ROOT, sourceRelativePath);
      var targetAbsolutePath = path.join(PROJECT_ROOT, targetRelativePath);
      assert(fs.existsSync(sourceAbsolutePath), "Missing source UI asset: " + sourceRelativePath);
      assert(fs.existsSync(targetAbsolutePath), "Missing copied atlas asset: " + targetRelativePath);
      assert(
        fs.readFileSync(sourceAbsolutePath).equals(fs.readFileSync(targetAbsolutePath)),
        targetRelativePath + " must remain byte-identical to its UI source."
      );
      var sourceMeta = readJson(sourceRelativePath + ".meta");
      var targetMeta = readJson(targetRelativePath + ".meta");
      assert(sourceMeta.packable === true, sourceRelativePath + " must remain packable.");
      assert(targetMeta.packable === true, targetRelativePath + " must remain packable.");
      var sourceSpriteFrameMeta = getOnlySpriteFrameMeta(sourceMeta, sourceRelativePath + ".meta");
      var targetSpriteFrameMeta = getOnlySpriteFrameMeta(targetMeta, targetRelativePath + ".meta");
      assert(targetMeta.uuid !== sourceMeta.uuid, targetRelativePath + " requires a new texture UUID.");
      assert(
        targetSpriteFrameMeta.uuid !== sourceSpriteFrameMeta.uuid,
        targetRelativePath + " requires a new SpriteFrame UUID."
      );
      assert(
        targetSpriteFrameMeta.rawTextureUuid === targetMeta.uuid,
        targetRelativePath + " SpriteFrame must reference its copied texture UUID."
      );
    });
    group.standaloneNames.forEach(function (assetName) {
      var targetRelativePath = group.directory + "/" + assetName + ".png";
      assert(
        fs.existsSync(path.join(PROJECT_ROOT, targetRelativePath)),
        "Missing standalone atlas asset: " + targetRelativePath
      );
      var targetMeta = readJson(targetRelativePath + ".meta");
      assert(targetMeta.packable === true, targetRelativePath + " must remain packable.");
      var targetSpriteFrameMeta = getOnlySpriteFrameMeta(
        targetMeta,
        targetRelativePath + ".meta"
      );
      assert(
        targetSpriteFrameMeta.rawTextureUuid === targetMeta.uuid,
        targetRelativePath + " SpriteFrame must reference its texture UUID."
      );
    });
  });

  assert(
    readJson("assets/spirit_system/image/shop/bg.jpg.meta").packable === false,
    "Spirit shop full-screen JPG background must stay outside AutoAtlas."
  );

  var fragmentAssetNames = [
    "milu_fragments",
    "lumi_fragments",
    "noya_fragments",
    "flora_fragments",
    "loco_fragments",
    "kelu_fragments",
    "yumi_fragments"
  ];
  fragmentAssetNames.forEach(function (assetName) {
    assert(
      fs.existsSync(path.join(
        PROJECT_ROOT,
        "assets/spirit_system/image/tabbar/" + assetName + ".png"
      )),
      "Shared fragment icon is missing from image/tabbar: " + assetName
    );
    assert(
      !fs.existsSync(path.join(
        PROJECT_ROOT,
        "assets/spirit_system/image/shop/" + assetName + ".png"
      )),
      "Shared fragment icon must not remain in image/shop: " + assetName
    );
  });

  var shopSpriteFrameUuids = collectSpriteFrameUuids("assets/spirit_system/image/shop");
  var sharedShopSpriteFrameUuids = {};
  ["back_button", "coin_icon", "gem_icon"].concat(fragmentAssetNames)
    .forEach(function (assetName) {
      var relativeMetaPath =
        "assets/spirit_system/image/tabbar/" + assetName + ".png.meta";
      var meta = readJson(relativeMetaPath);
      var spriteFrameMeta = getOnlySpriteFrameMeta(meta, relativeMetaPath);
      sharedShopSpriteFrameUuids[spriteFrameMeta.uuid] = true;
    });
  var shopObjects = readJson("assets/spirit_system/prefabs/SpiritShopView.prefab");
  shopObjects.filter(function (object) {
    return object && object.__type__ === "cc.Sprite";
  }).forEach(function (sprite) {
    assert(
      sprite._spriteFrame &&
      (
        shopSpriteFrameUuids[sprite._spriteFrame.__uuid__] ||
        sharedShopSpriteFrameUuids[sprite._spriteFrame.__uuid__]
      ),
      "SpiritShopView contains a SpriteFrame outside image/shop and its allowed image/tabbar resources."
    );
  });

  var tabBarSpriteFrameUuids = collectSpriteFrameUuids("assets/spirit_system/image/tabbar");
  var tabBarObjects = readJson("assets/spirit_system/prefabs/SpiritSystemTabBar.prefab");
  tabBarObjects.filter(function (object) {
    return object && object.__type__ === "cc.Sprite";
  }).forEach(function (sprite) {
    assert(
      sprite._spriteFrame && tabBarSpriteFrameUuids[sprite._spriteFrame.__uuid__],
      "SpiritSystemTabBar contains a SpriteFrame outside image/tabbar."
    );
  });
}

function createMemoryStorage() {
  var values = {};
  return {
    get length() {
      return Object.keys(values).length;
    },
    key: function (index) {
      var keys = Object.keys(values);
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem: function (key, value) {
      values[key] = String(value);
    },
    removeItem: function (key) {
      delete values[key];
    },
    clear: function () {
      values = {};
    }
  };
}

function createSequenceRandom(values) {
  var index = 0;
  return function () {
    if (index >= values.length) {
      fail("Spirit shop random sequence was exhausted.");
    }
    var value = values[index];
    index += 1;
    return value;
  };
}

function validateRuntimeStateAndPurchases() {
  var storage = createMemoryStorage();
  global.cc = {
    sys: {
      localStorage: storage
    }
  };
  var PlayerResourceStore = require(path.join(
    PROJECT_ROOT,
    "assets/scripts/utils/PlayerResourceStore"
  ));
  var AssistSpiritStore = require(path.join(
    PROJECT_ROOT,
    "assets/scripts/utils/AssistSpiritStore"
  ));
  var SpiritShopStore = require(path.join(
    PROJECT_ROOT,
    "assets/scripts/utils/SpiritShopStore"
  ));
  var SpiritShopService = require(path.join(
    PROJECT_ROOT,
    "assets/scripts/services/SpiritShopService"
  ));
  var AssistSpiritConfig = require(path.join(
    PROJECT_ROOT,
    "assets/scripts/config/AssistSpiritConfig"
  ));
  var SpiritShopConfig = require(path.join(
    PROJECT_ROOT,
    "assets/scripts/config/SpiritShopConfig"
  ));
  var resourceStore = new PlayerResourceStore({
    dailyStamina: 20
  });
  var assistStore = new AssistSpiritStore();
  var shopStore = new SpiritShopStore();
  var service = new SpiritShopService({
    shopStore: shopStore,
    playerResourceStore: resourceStore,
    assistSpiritStore: assistStore,
    random: createSequenceRandom([0, 0.49, 0.99, 0.96])
  });
  var fragmentBagDistribution = SpiritShopConfig.getFragmentBagQuantityDistribution();
  assert(
    JSON.stringify(fragmentBagDistribution) === JSON.stringify([
      { quantity: 5, chancePercent: 50 },
      { quantity: 6, chancePercent: 30 },
      { quantity: 8, chancePercent: 15 },
      { quantity: 10, chancePercent: 5 }
    ]),
    "Fragment bag quantity distribution must remain 5/6/8/10 at 50/30/15/5 percent."
  );
  assert(SpiritShopConfig.resolveFragmentBagQuantity(0) === 5, "Fragment bag lower boundary must grant 5.");
  assert(SpiritShopConfig.resolveFragmentBagQuantity(0.5) === 6, "Fragment bag 50 percent boundary must grant 6.");
  assert(SpiritShopConfig.resolveFragmentBagQuantity(0.8) === 8, "Fragment bag 80 percent boundary must grant 8.");
  assert(SpiritShopConfig.resolveFragmentBagQuantity(0.95) === 10, "Fragment bag 95 percent boundary must grant 10.");
  assert(
    fragmentBagDistribution.reduce(function (total, entry) {
      return total + (entry.quantity * entry.chancePercent / 100);
    }, 0) === 6,
    "Fragment bag expected quantity must be exactly 6."
  );
  var fragmentBagProduct = SpiritShopConfig.getProduct("fragment_bag");
  assert(
    fragmentBagProduct.displayName === "碎片袋" &&
    fragmentBagProduct.kind === "random_fragments" &&
    fragmentBagProduct.price === 30 &&
    fragmentBagProduct.dailyLimit === 1,
    "Fragment bag product contract is invalid."
  );
  var firstDate = new Date(2026, 6, 29, 6, 0, 0);
  var initial = service.getSnapshot(firstDate);
  assert(initial.resources.version === 2, "Player resources must migrate to version 2.");
  assert(initial.resources.gems === 200, "New player must receive the configured 200 starter gems.");
  assert(initial.fragmentOffers.length === 7, "Spirit shop must expose seven fragment offers.");
  assert(
    new Set(initial.fragmentOffers.map(function (offer) {
      return offer.spiritId;
    })).size === 7,
    "Spirit shop fragment offers must be unique."
  );
  assert(
    initial.fragmentOffers.some(function (offer) {
      return offer.spiritId === "lumi";
    }),
    "Spirit shop fragment offers must include lumi."
  );
  assert(
    JSON.stringify(initial.fragmentOffers.map(function (offer) {
      return offer.spiritId;
    })) === JSON.stringify(["milu", "lumi", "noya", "flora", "loco", "kelu", "yumi"]),
    "Spirit shop fragment offers must start from milu and keep catalog order."
  );
  assert(
    initial.products.find(function (product) {
      return product.skuId === "fragment_bag";
    }).availability === "available",
    "Fragment bag must be available while at least one spirit is below max level."
  );

  var firstSpiritId = initial.fragmentOffers[0].spiritId;
  var fragmentPurchase = service.purchaseFragment(0, firstDate);
  assert(fragmentPurchase.accepted === true, "Fragment purchase must succeed with enough gems.");
  assert(fragmentPurchase.gemAfter === 140, "Fragment purchase must deduct exactly 60 gems.");
  assert(
    assistStore.load().spirits[firstSpiritId].fragments === 10,
    "Fragment purchase must persist 10 fragments to AssistSpiritStore."
  );
  assert(
    service.getSnapshot(firstDate).fragmentOffers[0].ownedFragments === 10,
    "A fresh spirit shop snapshot must expose the purchased fragment count immediately."
  );
  var repeatedFragmentPurchase = service.purchaseFragment(0, firstDate);
  assert(
    repeatedFragmentPurchase.accepted === false &&
    repeatedFragmentPurchase.reason === "FRAGMENT_OFFER_SOLD_OUT",
    "Purchased fragment offer must stay sold out until refresh."
  );

  var beforeRefreshOffers = shopStore.load(firstDate).fragmentOfferSpiritIds;
  var refresh = service.manualRefresh(firstDate);
  assert(refresh.accepted === true, "Manual refresh must succeed with enough gems.");
  assert(refresh.gemAfter === 120, "Manual refresh must deduct exactly 20 gems.");
  assert(
    JSON.stringify(refresh.fragmentOfferSpiritIds) === JSON.stringify(beforeRefreshOffers),
    "Manual refresh must preserve the stable fragment offer order."
  );
  assert(
    shopStore.load(firstDate).purchasedFragmentSlots.length === 0,
    "Manual refresh must reset fragment sold-out slots."
  );

  var goldPurchase = service.purchaseProduct("gold_sack", firstDate);
  assert(goldPurchase.accepted === true, "Gold sack purchase must succeed.");
  assert(goldPurchase.gemAfter === 95, "Gold sack must cost 25 gems.");
  assert(resourceStore.load(firstDate).coins === 10000, "Gold sack must grant 10000 coins.");

  var fragmentsBeforeBag = assistStore.load().spirits.milu.fragments;
  var fragmentBagPurchase = service.purchaseProduct("fragment_bag", firstDate);
  assert(fragmentBagPurchase.accepted === true, "Daily fragment bag purchase must succeed.");
  assert(fragmentBagPurchase.gemAfter === 65, "Fragment bag must spend exactly 30 gems.");
  assert(
    fragmentBagPurchase.spiritId === "milu" && fragmentBagPurchase.quantity === 5,
    "Fragment bag must resolve the injected spirit and 5-fragment roll."
  );
  assert(
    assistStore.load().spirits.milu.fragments === fragmentsBeforeBag + 5,
    "Fragment bag must persist its fragments to AssistSpiritStore."
  );
  var repeatedFragmentBagPurchase = service.purchaseProduct("fragment_bag", firstDate);
  assert(
    repeatedFragmentBagPurchase.accepted === false &&
    repeatedFragmentBagPurchase.reason === "PRODUCT_DAILY_LIMIT_REACHED",
    "Fragment bag must obey its daily purchase limit."
  );

  var giftPurchase = service.purchaseProduct("royal_egg", firstDate);
  assert(giftPurchase.accepted === true, "Favor gift purchase must succeed.");
  assert(
    shopStore.load(firstDate).inventory.royal_egg === 10,
    "Favor gift purchase must persist the configured inventory quantity."
  );

  var nextDate = new Date(2026, 6, 30, 6, 0, 0);
  var nextDayState = shopStore.load(nextDate);
  assert(nextDayState.dailySkuCounts.fragment_bag === 0, "Daily reset must clear fragment bag limit.");
  assert(nextDayState.inventory.royal_egg === 10, "Daily reset must preserve permanent inventory.");
  assert(nextDayState.purchasedFragmentSlots.length === 0, "Daily reset must clear fragment sold-out slots.");

  var singleEligibleState = assistStore.load();
  Object.keys(singleEligibleState.spirits).forEach(function (spiritId) {
    if (spiritId !== "yumi") {
      singleEligibleState.spirits[spiritId].level = AssistSpiritConfig.MAX_LEVEL;
    }
  });
  assistStore.save(singleEligibleState);
  var yumiFragmentsBeforeBag = singleEligibleState.spirits.yumi.fragments;
  var singleEligiblePurchase = service.purchaseProduct("fragment_bag", nextDate);
  assert(
    singleEligiblePurchase.accepted === true &&
    singleEligiblePurchase.spiritId === "yumi" &&
    singleEligiblePurchase.quantity === 10,
    "Fragment bag must exclude max-level spirits and grant the only eligible spirit."
  );
  assert(
    assistStore.load().spirits.yumi.fragments === yumiFragmentsBeforeBag + 10,
    "Single-eligible fragment bag grant must persist."
  );

  var allMaxState = assistStore.load();
  allMaxState.spirits.yumi.level = AssistSpiritConfig.MAX_LEVEL;
  assistStore.save(allMaxState);
  var thirdDate = new Date(2026, 6, 31, 6, 0, 0);
  var allMaxSnapshot = service.getSnapshot(thirdDate);
  assert(
    allMaxSnapshot.products.find(function (product) {
      return product.skuId === "fragment_bag";
    }).availability === "all_spirits_max_level",
    "Fragment bag must be unavailable when every spirit is max level."
  );
  var gemsBeforeAllMaxPurchase = resourceStore.load(thirdDate).gems;
  var allMaxPurchase = service.purchaseProduct("fragment_bag", thirdDate);
  assert(
    allMaxPurchase.accepted === false && allMaxPurchase.reason === "ALL_SPIRITS_MAX_LEVEL",
    "All-max fragment bag purchase must be rejected before charging gems."
  );
  assert(
    resourceStore.load(thirdDate).gems === gemsBeforeAllMaxPurchase,
    "Rejected all-max fragment bag purchase must not charge gems."
  );

  storage.clear();
  var legacyShopState = SpiritShopStore.createInitialState(firstDate);
  legacyShopState.version = 1;
  legacyShopState.fragmentOfferSpiritIds = legacyShopState.fragmentOfferSpiritIds.slice(0, 6);
  legacyShopState.dailySkuCounts.blue_potion_bag = 1;
  delete legacyShopState.dailySkuCounts.fragment_bag;
  storage.setItem(SpiritShopStore.STORAGE_KEY, JSON.stringify(legacyShopState));
  var migratedShopState = shopStore.load(firstDate);
  assert(
    migratedShopState.version === 4 && migratedShopState.dailySkuCounts.fragment_bag === 1,
    "SpiritShopStore v1 must migrate blue_potion_bag count and seven stable fragment offers."
  );
  assert(
    !Object.prototype.hasOwnProperty.call(migratedShopState.dailySkuCounts, "blue_potion_bag"),
    "SpiritShopStore v2 must remove the legacy blue_potion_bag key."
  );
  assert(
    JSON.parse(storage.getItem(SpiritShopStore.STORAGE_KEY)).version === 4,
    "SpiritShopStore migration must persist version 4."
  );

  storage.clear();
  storage.setItem("bubble_player_resources_v1", JSON.stringify({
    version: 1,
    stamina: 7,
    coins: 345,
    lastDailyResetDate: "2026-07-29"
  }));
  var migrated = resourceStore.load(firstDate);
  assert(migrated.version === 2, "PlayerResourceStore v1 save must migrate to v2.");
  assert(migrated.gems === 200, "PlayerResourceStore v1 migration must grant starter gems.");
  assert(
    JSON.parse(storage.getItem("bubble_player_resources_v1")).version === 2,
    "PlayerResourceStore migration must persist the version 2 state."
  );
}

function validatePrefabAndControllerContract() {
  var objects = readJson("assets/spirit_system/prefabs/SpiritShopView.prefab");
  var nodes = objects.filter(function (object) {
    return object && object.__type__ === "cc.Node";
  });
  var nodeNames = {};
  nodes.forEach(function (node) {
    if (nodeNames[node._name]) {
      fail("SpiritShopView node name must be unique: " + node._name);
    }
    nodeNames[node._name] = true;
  });
  for (var slot = 1; slot <= 7; slot += 1) {
    [
      "source__fragment_offer_" + slot + "_slot",
      "proxy__fragment_offer_" + slot + "_slot",
      "source__fragment_offer_" + slot + "_art",
      "proxy__fragment_offer_" + slot + "_art",
      "source__fragment_offer_" + slot + "_buy_button",
      "fragment_offer_" + slot + "_name",
      "fragment_offer_" + slot + "_quantity",
      "fragment_offer_" + slot + "_price"
    ].forEach(function (nodeName) {
      assert(nodeNames[nodeName] === true, "SpiritShopView requires node: " + nodeName);
    });
  }
  [
    "fragment_offer_scroll_viewport",
    "fragment_offer_scroll_view",
    "fragment_offer_scroll_content",
    "fragment_offer_proxy_viewport",
    "fragment_offer_proxy_content",
    "fragment_offer_text_viewport",
    "fragment_offer_text_content"
  ].forEach(function (nodeName) {
    assert(nodeNames[nodeName] === true, "SpiritShopView fragment scroll requires node: " + nodeName);
  });
  var fragmentScrollViews = objects.filter(function (object) {
    return object && object.__type__ === "cc.ScrollView";
  });
  assert(fragmentScrollViews.length === 1, "SpiritShopView requires exactly one fragment cc.ScrollView.");
  var fragmentScrollView = fragmentScrollViews[0];
  assert(
    fragmentScrollView.horizontal === true && fragmentScrollView.vertical === false,
    "SpiritShopView fragment ScrollView must be horizontal only."
  );
  assert(
    objects[fragmentScrollView.node.__id__]._name === "fragment_offer_scroll_viewport" &&
      objects[fragmentScrollView.content.__id__]._name === "fragment_offer_scroll_content",
    "SpiritShopView fragment ScrollView node/content contract is invalid."
  );
  var fragmentScrollViewportNode = objects[fragmentScrollView.node.__id__];
  var fragmentScrollContentNode = objects[fragmentScrollView.content.__id__];
  var fragmentScrollOffset = (
    fragmentScrollContentNode._contentSize.width - fragmentScrollViewportNode._contentSize.width
  ) / 2;
  var firstFragmentSlotNode = nodes.find(function (node) {
    return node._name === "source__fragment_offer_1_slot";
  });
  var lastFragmentSlotNode = nodes.find(function (node) {
    return node._name === "source__fragment_offer_7_slot";
  });
  assert(
    firstFragmentSlotNode._trs.array[0] + fragmentScrollOffset - firstFragmentSlotNode._contentSize.width / 2 >=
      -fragmentScrollViewportNode._contentSize.width / 2,
    "SpiritShopView fragment list must begin at the left viewport edge."
  );
  assert(
    lastFragmentSlotNode._trs.array[0] - fragmentScrollOffset + lastFragmentSlotNode._contentSize.width / 2 <=
      fragmentScrollViewportNode._contentSize.width / 2,
    "SpiritShopView fragment list must end inside the right viewport edge."
  );
  [
    "source__fragment_bag_card",
    "proxy__fragment_bag_art",
    "fragment_bag_title",
    "fragment_bag_description",
    "fragment_bag_price"
  ].forEach(function (nodeName) {
    assert(nodeNames[nodeName] === true, "SpiritShopView fragment bag requires node: " + nodeName);
  });
  [
    "source__blue_potion_bag_card",
    "proxy__blue_potion_bag_art",
    "blue_potion_bag_title",
    "blue_potion_bag_description",
    "blue_potion_bag_price"
  ].forEach(function (nodeName) {
    assert(!nodeNames[nodeName], "SpiritShopView must not retain legacy crystal bag node: " + nodeName);
  });
  var serialized = JSON.stringify(objects);
  requireContains(serialized, "碎片袋", "Spirit shop fragment bag title");
  requireContains(serialized, "随机获得一名精灵的5～10片碎片", "Spirit shop fragment bag description");
  requireContains(
    serialized,
    "2ac46b30-6e50-4a7d-9c55-658b89eaf421",
    "SpiritShopView shared SpiritSystemTabBar reference"
  );
  if (serialized.indexOf("48967408-28c8-40f5-b9ae-b8a9a14afd45") >= 0) {
    fail("SpiritShopView must not serialize the reference image shop.png.");
  }
  [
    "source__coin_add_button",
    "proxy__coin_add_button",
    "source__gem_add_button",
    "proxy__gem_add_button"
  ].forEach(function (nodeName) {
    assert(!nodeNames[nodeName], "SpiritShopView must not retain resource add button node: " + nodeName);
  });
  assert(
    objects.filter(function (object) {
      return object && object.__type__ === "cc.Button";
    }).length === 15,
    "SpiritShopView must retain exactly 15 authored interaction Buttons."
  );

  var controller = readText("assets/scripts/ui/SpiritShopViewController.js");
  requireContains(controller, "source__hall_tab", "Spirit shop Hall tab binding");
  requireContains(controller, "source__shop_tab", "Spirit shop Shop tab binding");
  [
    "source__home_tab",
    "source__bond_tab",
    "source__growth_tab"
  ].forEach(function (nodeName) {
    requireContains(controller, nodeName, "Spirit shop unavailable Tab binding");
  });
  requireContains(
    controller,
    "this.onUnavailableTab = requireCallback(options, \"onUnavailableTab\")",
    "Spirit shop unavailable Tab callback contract"
  );
  requireContains(
    controller,
    "this.onUnavailableTab();",
    "Spirit shop unavailable Tab click route"
  );
  requireContains(controller, "onBuyFragment(capturedSlotIndex)", "Spirit fragment purchase binding");
  requireContains(controller, "_bindFragmentOfferScroll", "Spirit fragment horizontal-scroll binding");
  requireContains(controller, "_syncFragmentOfferScrollRender", "Spirit fragment proxy/text scroll synchronization");
  requireContains(controller, "onBuyProduct(product.skuId)", "Spirit product purchase binding");
  requireContains(controller, "all_spirits_max_level", "Spirit fragment bag max-level disabled rendering");
  requireContains(controller, "daily_limit_reached", "Spirit fragment bag daily-limit rendering");
  requireContains(controller, "cc.Sprite.SizeMode.RAW", "Spirit fragment RAW Sprite sizing");
  requireContains(controller, "sprite.trim = false", "Spirit fragment trim disable");
  assert(
    controller.indexOf("onQuickBuyCoins") < 0 &&
    controller.indexOf("onQuickBuyGems") < 0,
    "SpiritShopViewController must not retain removed resource add button callbacks."
  );

  var SpiritShopConfig = require(path.join(
    PROJECT_ROOT,
    "assets/scripts/config/SpiritShopConfig"
  ));
  ["milu", "lumi", "noya", "flora", "loco", "kelu", "yumi"].forEach(function (spiritId) {
    assert(
      SpiritShopConfig.getFragmentPresentation(spiritId).fragmentPath ===
        "spirit_system/image/tabbar/" + spiritId + "_fragments",
      "Spirit shop fragment path must use image/tabbar: " + spiritId
    );
  });
}

function validateBootstrapAndCloudContract() {
  var registry = readText("assets/scripts/bootstrap/GameBootstrapLazyRegistry.js");
  var lazyModule = readText("assets/scripts/bootstrap/GameBootstrapLazyModule.js");
  var bootstrap = readText("assets/scripts/bootstrap/GameBootstrap.js");
  var hallMethods = readText("assets/scripts/bootstrap/GameBootstrapSpiritHallMethods.js");
  var shopMethods = readText("assets/scripts/bootstrap/GameBootstrapSpiritShopMethods.js");
  var uiFlowShared = readText("assets/scripts/bootstrap/GameBootstrapUiFlowShared.js");
  var lifecycleMethods = readText("assets/scripts/bootstrap/GameBootstrapLifecycleMethods.js");
  var compositionMethods = readText("assets/scripts/bootstrap/GameBootstrapCompositionMethods.js");
  var shopService = readText("assets/scripts/services/SpiritShopService.js");
  var shopStore = readText("assets/scripts/utils/SpiritShopStore.js");
  requireContains(registry, "SPIRIT_SHOP_METHODS", "Spirit shop lazy registry");
  requireContains(lazyModule, "./GameBootstrapSpiritShopMethods", "Spirit shop static lazy loader");
  requireContains(bootstrap, "lazySpiritShopMethods._showSpiritShopView", "Spirit shop bootstrap method");
  requireContains(hallMethods, "onOpenShop: this._showSpiritShopView.bind(this)", "Hall to shop tab route");
  requireContains(shopMethods, "onOpenHall: this._showSpiritHallView.bind(this)", "Shop to Hall tab route");
  requireContains(
    shopMethods,
    "SPIRIT_SYSTEM_UNAVAILABLE_TAB_TIP = \"系统开发中，敬请期待\"",
    "Spirit shop unavailable Tab tip copy"
  );
  requireContains(
    shopMethods,
    "this.tipsPresenter.showText(SPIRIT_SYSTEM_UNAVAILABLE_TAB_TIP)",
    "Spirit shop unavailable Tab TipsPresenter route"
  );
  assert(
    shopMethods.indexOf("onQuickBuyCoins") < 0 &&
    shopMethods.indexOf("onQuickBuyGems") < 0,
    "Spirit shop bootstrap must not retain removed resource add button callbacks."
  );
  requireContains(
    shopMethods,
    "this.assistSpiritState = this.assistSpiritStore.load();",
    "Fragment purchase refreshes the shared assist-spirit state immediately"
  );
  requireContains(
    shopMethods,
    "ALL_SPIRITS_MAX_LEVEL",
    "Fragment bag all-max rejection message"
  );
  requireContains(shopMethods, "钻石不足", "Spirit shop gem-insufficient copy");
  requireContains(
    shopMethods,
    "result.spiritDisplayName + \"碎片x\" + result.quantity",
    "Fragment bag purchase result copy"
  );
  requireOccurrenceCount(
    shopMethods,
    "this._setStatusWithTip(\"spirit_shop_purchase_success\", null, message);",
    2,
    "Spirit shop successful purchase tip route"
  );
  requireContains(
    shopMethods,
    "showSpiritShopAward(this, buildSpiritFragmentAwardItem(result.spiritId, result.quantity));",
    "Spirit fragment purchase congratulation popup route"
  );
  requireContains(
    shopMethods,
    "showSpiritShopAward(this, buildSpiritShopProductAwardItem(result));",
    "Spirit product purchase congratulation popup route"
  );
  requireContains(
    shopMethods,
    "Spirit shop purchase requires AwardView renderer.",
    "Spirit shop purchase must fail fast when AwardView is unavailable"
  );
  [
    "royal_egg: \"spirit_system/image/shop/royal_egg_item\"",
    "fruit_basket: \"spirit_system/image/shop/fruit_basket_item\"",
    "ice_tower: \"spirit_system/image/shop/ice_tower_item\"",
    "mushroom_house: \"spirit_system/image/shop/mushroom_house_item\"",
    "milu_fragments: \"ui/image/props/milu_fragments\"",
    "lumi_fragments: \"ui/image/props/lumi_fragments\"",
    "noya_fragments: \"ui/image/props/noya_fragments\"",
    "flora_fragments: \"ui/image/props/flora_fragments\"",
    "loco_fragments: \"ui/image/props/loco_fragments\"",
    "kelu_fragments: \"ui/image/props/kelu_fragments\"",
    "yumi_fragments: \"ui/image/props/yumi_fragments\""
  ].forEach(function (awardItemPath) {
    requireContains(uiFlowShared, awardItemPath, "Spirit shop AwardView item icon contract: " + awardItemPath);
  });
  requireContains(compositionMethods, "random: Math.random", "Spirit shop explicit production random source");
  requireOrdered(
    compositionMethods,
    [
      "this.spiritShopStore = new SpiritShopStore();",
      "this.spiritShopStore.load(new Date());",
      "this.spiritShopService = new SpiritShopService({"
    ],
    "Startup initializes SpiritShopStore before cloud-profile collection"
  );
  requireContains(shopService, "resolveFragmentBagQuantity", "Spirit shop fragment bag quantity resolution");
  requireContains(shopService, "getEligibleFragmentBagSpiritIds", "Spirit shop max-star exclusion");
  assert(shopService.indexOf("addGems") < 0, "Spirit shop must not retain crystal bag gem grants.");
  requireContains(shopStore, "migrateVersion1State", "Spirit shop v1 to v2 migration");
  requireContains(shopMethods, "UiModalReleaseHelper.releaseCachedModal", "Spirit shop modal release");
  requireContains(shopMethods, "BundleLoader.releaseNamedBundle", "Spirit shop Bundle release");
  requireContains(
    shopMethods,
    "hasHallViewResources && !switchingFromHall",
    "Shop switch keeps the visible Hall during async loading"
  );
  requireContains(
    hallMethods,
    "hasShopViewResources && !switchingFromShop",
    "Hall switch keeps the visible Shop during async loading"
  );
  requireOrdered(
    shopMethods,
    [
      "this._renderSpiritShopView();",
      "if (switchingFromHall)",
      "this._hideSpiritHallView({",
      "releaseBundle: false"
    ],
    "Hall to Shop atomic handoff"
  );
  requireOrdered(
    hallMethods,
    [
      "this._renderSpiritHallView();",
      "if (switchingFromShop)",
      "this._hideSpiritShopView({",
      "releaseBundle: false"
    ],
    "Shop to Hall atomic handoff"
  );
  requireContains(
    shopMethods,
    "releaseBundle: !switchingFromHall",
    "Failed Shop switch preserves the visible Hall Bundle"
  );
  requireContains(
    hallMethods,
    "releaseBundle: !switchingFromShop",
    "Failed Hall switch preserves the visible Shop Bundle"
  );
  requireContains(
    shopMethods,
    "if (hideOptions.releaseBundle)",
    "Shop hide explicitly controls shared Bundle release"
  );
  requireContains(
    hallMethods,
    "if (hideOptions.releaseBundle)",
    "Hall hide explicitly controls shared Bundle release"
  );
  requireContains(
    shopMethods,
    "this._ensureSpiritSystemTabBarPrefab()",
    "Shop retains the shared SpiritSystemTabBar prefab"
  );
  requireOrdered(
    hallMethods,
    [
      "if (hideOptions.releaseBundle)",
      "releaseRetainedPrefabAsset(this._spiritSystemTabBarPrefab, \"SpiritSystemTabBar\")",
      "this._spiritSystemTabBarPrefab = null;",
      "BundleLoader.releaseNamedBundle(SPIRIT_SYSTEM_BUNDLE_NAME)"
    ],
    "Hall releases the shared TabBar only with the final Bundle release"
  );
  requireOrdered(
    shopMethods,
    [
      "if (hideOptions.releaseBundle)",
      "releaseRetainedPrefabAsset(this._spiritSystemTabBarPrefab, \"SpiritSystemTabBar\")",
      "this._spiritSystemTabBarPrefab = null;",
      "BundleLoader.releaseNamedBundle(SPIRIT_SYSTEM_BUNDLE_NAME)"
    ],
    "Shop releases the shared TabBar only with the final Bundle release"
  );
  requireContains(
    lifecycleMethods,
    "releaseBundle: !hasSpiritShopViewResources",
    "Lifecycle keeps the shared TabBar until both spirit views are destroyed"
  );
  requireContains(
    hallMethods,
    "this._spiritSystemTabBarPrefab = retainPrefabAsset(prefab, \"SpiritSystemTabBar\")",
    "Shared TabBar owns an explicit addRef lease"
  );
  requireContains(
    shopMethods,
    "!cc.isValid(tabBarPrefab)",
    "Shop rejects an invalid shared TabBar lease"
  );

  var clientCloud = readText("assets/scripts/services/PlayerCloudProfileService.js");
  var serverCloud = readText("cloudfunctions/playerProfile/index.js");
  var templateCloud = readText("build-templates/wechatgame/cloudfunctions/playerProfile/index.js");
  assert(
    templateCloud === serverCloud,
    "WeChat playerProfile cloud-function template must match the deployment source."
  );
  requireContains(clientCloud, "SpiritShopStore.STORAGE_KEY", "Client cloud spirit shop storage key");
  requireContains(serverCloud, "bubble_spirit_shop_state_v1", "Server cloud spirit shop storage key");
  requireContains(serverCloud, "fragment_bag: 0", "Server cloud fragment bag initial daily count");
  var marker = "playerProfile_v20260814_profile_size_caps_v6";
  requireContains(clientCloud, marker, "Client cloud deployment marker");
  requireContains(serverCloud, marker, "Server cloud deployment marker");
}

validateRuntimeStateAndPurchases();
validateAtlasIsolation();
validatePrefabAndControllerContract();
validateBootstrapAndCloudContract();
console.log(
  "Spirit shop integration validation passed: migration, offers, purchases, inventory, prefab, tabs and cloud contract."
);
