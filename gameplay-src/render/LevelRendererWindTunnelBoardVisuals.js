"use strict";

function createLevelRendererWindTunnelBoardVisuals(deps) {
  var timing = deps.SpecialAnimationTiming.windTunnel;
  if (!timing || !Number.isFinite(timing.entranceIdleRotationDuration) || timing.entranceIdleRotationDuration <= 0) {
    throw new Error("Wind tunnel entrance rotation timing is invalid.");
  }

  function isWormholeEntity(entity) {
    return !!(
      entity &&
      entity.entityCategory === "reactive_ball" &&
      entity.entityType === "wormhole"
    );
  }

  function isWindTunnelEntranceEntity(entity) {
    return !!(
      entity &&
      entity.entityCategory === "reactive_ball" &&
      entity.entityType === "wind_tunnel_entrance"
    );
  }

  function isWindTunnelExitEntity(entity) {
    return !!(
      entity &&
      entity.entityCategory === "reactive_ball" &&
      entity.entityType === "wind_tunnel_exit"
    );
  }

  function resolveBoardEntityRenderSize(entity) {
    if (isWormholeEntity(entity)) {
      return deps.WORMHOLE_RENDER_SIZE;
    }
    if (isWindTunnelExitEntity(entity)) {
      return deps.WIND_TUNNEL_EXIT_RENDER_SIZE;
    }
    if (isWindTunnelEntranceEntity(entity)) {
      if (entity.closing === true) {
        if (!Number.isInteger(entity.closingFrameIndex) || !deps.WIND_TUNNEL_DISAPPEAR_FRAME_SIZES[entity.closingFrameIndex]) {
          throw new Error("Wind tunnel closing entrance requires a valid frame size.");
        }
        return deps.WIND_TUNNEL_DISAPPEAR_FRAME_SIZES[entity.closingFrameIndex];
      }
      return deps.WIND_TUNNEL_ENTRANCE_RENDER_SIZE;
    }
    return entity.entityType === "black_hole" ? deps.BLACK_HOLE_RENDER_SIZE : deps.BOARD_BUBBLE_SIZE;
  }

  function syncWindTunnelEntranceRotation(node, entity) {
    if (!isWindTunnelEntranceEntity(entity) || entity.closing === true) {
      if (node.__windTunnelEntranceRotationActive === true) {
        node.stopAllActions();
        node.angle = 0;
      }
      node.__windTunnelEntranceRotationActive = false;
      return;
    }
    if (node.__windTunnelEntranceRotationActive === true) {
      return;
    }
    if (typeof cc.rotateBy !== "function" || typeof cc.repeatForever !== "function") {
      throw new Error("Wind tunnel entrance rotation requires Cocos action APIs.");
    }
    node.stopAllActions();
    node.angle = 0;
    node.runAction(cc.repeatForever(cc.rotateBy(timing.entranceIdleRotationDuration, 360)));
    node.__windTunnelEntranceRotationActive = true;
  }

  function resetWindTunnelEntranceRotation(node) {
    node.stopAllActions();
    node.angle = 0;
    node.__windTunnelEntranceRotationActive = false;
  }

  function collectBoardRenderEntities(boardSnapshot) {
    if (!boardSnapshot || !Array.isArray(boardSnapshot.cells) || !Array.isArray(boardSnapshot.specialEntities)) {
      throw new Error("Board rendering requires cells and specialEntities arrays.");
    }
    var nonCellEntities = boardSnapshot.specialEntities.filter(function (entity) {
      return isWormholeEntity(entity) || isWindTunnelEntranceEntity(entity);
    });
    nonCellEntities.forEach(function (entity) {
      if (!entity.position) {
        throw new Error("Non-cell board entity rendering requires position.");
      }
    });
    return nonCellEntities.concat(boardSnapshot.cells);
  }

  return {
    collectBoardRenderEntities: collectBoardRenderEntities,
    isWindTunnelEntranceEntity: isWindTunnelEntranceEntity,
    isWormholeEntity: isWormholeEntity,
    resetWindTunnelEntranceRotation: resetWindTunnelEntranceRotation,
    resolveBoardEntityRenderSize: resolveBoardEntityRenderSize,
    syncWindTunnelEntranceRotation: syncWindTunnelEntranceRotation
  };
}

module.exports = createLevelRendererWindTunnelBoardVisuals;
