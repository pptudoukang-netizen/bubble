"use strict";

function createGameManagerShotDropMethods(context) {
  var EliminationSequenceBuilder = context.EliminationSequenceBuilder;
  var FLOATING_ICE_DROP_DELAY = context.FLOATING_ICE_DROP_DELAY;
  var clone = context.clone;
  var createGameManagerShotDropMethods = context.createGameManagerShotDropMethods;
  var isIceBall = context.isIceBall;
  var isKeyBall = context.isKeyBall;
  var isSkillBall = context.isSkillBall;
  var listCollectionRewardObjectives = context.listCollectionRewardObjectives;
  var requireFinitePoint = context.requireFinitePoint;
  var resolveIceInnerColor = context.resolveIceInnerColor;

  return {
    _injectCollectedSkillBalls: function (collectedDrops) {
      var skillCells = (collectedDrops || []).filter(function (cell) {
        return isSkillBall(cell) && (cell.entityType === "rainbow" || cell.entityType === "blast");
      });
      if (!skillCells.length) {
        return 0;
      }

      var resolution = this.lastResolution;
      if (!resolution || !Array.isArray(resolution.injectedSkills)) {
        return 0;
      }

      skillCells.sort(function (a, b) {
        var leftJar = typeof a.jarIndex === "number" ? a.jarIndex : -1;
        var rightJar = typeof b.jarIndex === "number" ? b.jarIndex : -1;
        if (leftJar !== rightJar) {
          return leftJar - rightJar;
        }

        return String(a.id || "").localeCompare(String(b.id || ""));
      });

      var injectedCount = 0;
      skillCells.forEach(function (cell) {
        var receiveResult = this.systems.shooterController.addSkillInventory(cell.entityType, 1);
        if (receiveResult && receiveResult.accepted) {
          resolution.injectedSkills.push({
            id: cell.id,
            entityType: cell.entityType,
            status: "stored",
            total: receiveResult.total,
            jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1
          });
          if (typeof this._pushRuntimeEvent === "function") {
            this._pushRuntimeEvent("skill_powerup_collected", {
              entityType: cell.entityType,
              sourceId: cell.id,
              total: receiveResult.total,
              jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1
            });
          }
          injectedCount += 1;
        }
      }, this);

      return injectedCount;
    },

    _appendUniqueCells: function (target, cells) {
      var seen = {};
      (target || []).forEach(function (cell) {
        if (cell) {
          seen[cell.row + ":" + cell.col + ":" + cell.id] = true;
        }
      });
      (cells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }
        var key = cell.row + ":" + cell.col + ":" + cell.id;
        if (seen[key]) {
          return;
        }
        seen[key] = true;
        target.push(cell);
      });
      return target;
    },

    _findMatchedBallCollectionObjective: function () {
      if (typeof listCollectionRewardObjectives !== "function") {
        throw new Error("Matched objective collection requires listCollectionRewardObjectives.");
      }
      var objectives = listCollectionRewardObjectives(this.currentLevel);
      for (var index = 0; index < objectives.length; index += 1) {
        var objective = objectives[index];
        if (objective && (objective.type === "collect_any" || objective.type === "collect_color")) {
          return objective;
        }
      }
      return null;
    },

    _buildMatchedObjectiveCollectionEntries: function (collectedCells, eliminationSequence, grid) {
      if (!Array.isArray(collectedCells)) {
        throw new Error("Matched objective collection entries require collected cells array.");
      }
      if (!Array.isArray(eliminationSequence)) {
        throw new Error("Matched objective collection entries require eliminationSequence array.");
      }
      if (grid !== undefined && (!grid || typeof grid.getCellPosition !== "function")) {
        throw new Error("Matched objective collection entries require grid.getCellPosition when grid is provided.");
      }

      var sequenceByCellId = {};
      eliminationSequence.forEach(function (entry) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error("Matched objective collection sequence entry must be an object.");
        }
        if (typeof entry.cellId !== "string" && typeof entry.cellId !== "number") {
          throw new Error("Matched objective collection sequence entry requires cellId.");
        }
        sequenceByCellId[String(entry.cellId)] = entry;
      });

      return collectedCells.map(function (cell) {
        if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
          throw new Error("Matched objective collected cell requires id.");
        }
        var sequenceEntry = sequenceByCellId[String(cell.id)];
        if (!sequenceEntry) {
          if (!grid) {
            throw new Error("Matched objective collected cell missing elimination sequence: " + cell.id);
          }
          var cellPosition = requireFinitePoint(
            grid.getCellPosition(cell.row, cell.col),
            "Matched objective collected cell"
          );
          return {
            id: cell.id,
            color: cell.color,
            row: cell.row,
            col: cell.col,
            worldPosition: {
              x: cellPosition.x,
              y: cellPosition.y
            },
            delayMs: 0
          };
        }
        if (
          !sequenceEntry.worldPosition ||
          typeof sequenceEntry.worldPosition.x !== "number" ||
          typeof sequenceEntry.worldPosition.y !== "number" ||
          !isFinite(sequenceEntry.worldPosition.x) ||
          !isFinite(sequenceEntry.worldPosition.y)
        ) {
          throw new Error("Matched objective collection requires sequence worldPosition: " + cell.id);
        }

        return {
          id: cell.id,
          color: cell.color,
          row: cell.row,
          col: cell.col,
          worldPosition: {
            x: sequenceEntry.worldPosition.x,
            y: sequenceEntry.worldPosition.y
          },
          delayMs: sequenceEntry.delayMs
        };
      });
    },

    _registerMatchedObjectiveCollection: function (matchedCells, eliminationSequence, resolution, grid) {
      if (!resolution) {
        throw new Error("Matched objective collection requires resolution.");
      }
      if (!Array.isArray(matchedCells)) {
        throw new Error("Matched objective collection requires matched cells array.");
      }
      if (!Array.isArray(resolution.matchedObjectiveCollected)) {
        throw new Error("Resolution requires matchedObjectiveCollected array.");
      }

      var objective = this._findMatchedBallCollectionObjective();
      if (!objective) {
        return [];
      }
      var jarCollectorSystem = this.systems.jarCollectorSystem;
      if (!jarCollectorSystem || typeof jarCollectorSystem.collectEliminatedObjectiveCells !== "function") {
        throw new Error("Matched objective collection requires JarCollectorSystem.collectEliminatedObjectiveCells.");
      }

      var alreadyCollected = {};
      resolution.matchedObjectiveCollected.forEach(function (entry) {
        if (!entry || (typeof entry.id !== "string" && typeof entry.id !== "number")) {
          throw new Error("Resolution matchedObjectiveCollected entry requires id.");
        }
        alreadyCollected[String(entry.id)] = true;
      });
      var pendingCells = matchedCells.filter(function (cell) {
        if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
          throw new Error("Matched objective collection matched cell requires id.");
        }
        return alreadyCollected[String(cell.id)] !== true;
      });
      if (!pendingCells.length) {
        return [];
      }

      var collectedCells = jarCollectorSystem.collectEliminatedObjectiveCells(pendingCells, objective);
      if (!collectedCells.length) {
        return [];
      }

      var eventEntries = this._buildMatchedObjectiveCollectionEntries(collectedCells, eliminationSequence, grid);
      resolution.matchedObjectiveCollected = resolution.matchedObjectiveCollected.concat(eventEntries);
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("matched_objective_collect", {
          objectiveType: objective.type,
          objectiveColor: objective.type === "collect_color" ? objective.color : null,
          count: eventEntries.length,
          entries: eventEntries
        });
      }
      return eventEntries;
    },

    _splitMolotovDropCandidates: function (cells) {
      if (!Array.isArray(cells)) {
        throw new Error("Molotov drop candidate split requires cells array.");
      }
      var immediate = [];
      for (var index = 0; index < cells.length; index += 1) {
        var cell = cells[index];
        if (!cell) {
          throw new Error("Molotov drop candidate cell is required.");
        }
        if (isKeyBall(cell)) {
          continue;
        }
        immediate.push(cell);
      }
      return {
        immediate: immediate
      };
    },

    _buildThawedFloatingIceDropCell: function (cell) {
      if (!isIceBall(cell)) {
        throw new Error("Thawed floating ice drop requires ice obstacle cell.");
      }
      var innerColor = resolveIceInnerColor(cell);
      if (typeof innerColor !== "string" || !innerColor) {
        throw new Error("Thawed floating ice drop requires innerColor.");
      }

      var thawedDropCell = clone(cell);
      thawedDropCell.entityCategory = "normal_ball";
      thawedDropCell.entityType = null;
      thawedDropCell.color = innerColor;
      thawedDropCell.iceSnowballAlreadyCollected = true;
      return thawedDropCell;
    },

    _prepareResolutionDropCells: function (cells, resolution) {
      if (!Array.isArray(cells)) {
        throw new Error("Resolution drop preparation requires cells array.");
      }

      var immediateCells = [];
      var delayedIceDropCells = [];

      cells.forEach(function (cell) {
        if (!cell) {
          throw new Error("Resolution drop preparation requires cell.");
        }
        if (!isIceBall(cell)) {
          immediateCells.push(cell);
          return;
        }
        if (!resolution) {
          throw new Error("Resolution drop preparation requires resolution when ice cells are present.");
        }
        if (typeof this._registerIceCollection !== "function") {
          throw new Error("Resolution drop preparation requires _registerIceCollection for ice cells.");
        }

        var innerColor = resolveIceInnerColor(cell);
        if (typeof innerColor !== "string" || !innerColor) {
          throw new Error("Floating ice drop requires innerColor.");
        }

        resolution.iceCollected += this._registerIceCollection([cell]);
        if (!Array.isArray(resolution.thawed)) {
          resolution.thawed = [];
        }
        resolution.thawed.push({
          id: cell.id,
          row: cell.row,
          col: cell.col,
          color: innerColor
        });
        delayedIceDropCells.push(this._buildThawedFloatingIceDropCell(cell));
      }, this);

      return {
        immediate: immediateCells,
        delayedIce: delayedIceDropCells
      };
    },

    _buildResolutionDropRegisterOptions: function (resolution, dropOptions, timingOptions) {
      if (
        dropOptions !== undefined &&
        (
          !dropOptions ||
          typeof dropOptions !== "object" ||
          Array.isArray(dropOptions)
        )
      ) {
        throw new Error("Resolution drop registration dropOptions must be an object when provided.");
      }
      if (
        timingOptions !== undefined &&
        (
          !timingOptions ||
          typeof timingOptions !== "object" ||
          Array.isArray(timingOptions)
        )
      ) {
        throw new Error("Resolution drop registration timingOptions must be an object when provided.");
      }
      if (
        timingOptions &&
        Object.prototype.hasOwnProperty.call(timingOptions, "skipAssistSpiritSkillCharge") &&
        typeof timingOptions.skipAssistSpiritSkillCharge !== "boolean"
      ) {
        throw new Error("Resolution drop registration timingOptions.skipAssistSpiritSkillCharge must be boolean.");
      }

      var matchedCellsForDelay = timingOptions && timingOptions.matchedCellsForDelay;
      if (
        matchedCellsForDelay !== undefined &&
        (!Array.isArray(matchedCellsForDelay) || !matchedCellsForDelay.length)
      ) {
        throw new Error("Resolution drop registration matchedCellsForDelay must be a non-empty array when provided.");
      }

      var skipEliminationPresentationHold = !!(
        timingOptions &&
        Object.prototype.hasOwnProperty.call(timingOptions, "skipEliminationPresentationHold")
      );
      if (skipEliminationPresentationHold && timingOptions.skipEliminationPresentationHold !== true) {
        throw new Error("Resolution drop registration skipEliminationPresentationHold must be true when provided.");
      }

      var requiresEliminationHold = skipEliminationPresentationHold
        ? false
        : EliminationSequenceBuilder.resolveRequiresEliminationPresentationHold(
          resolution,
          matchedCellsForDelay
        );
      var baseDelay = 0;
      if (dropOptions && Object.prototype.hasOwnProperty.call(dropOptions, "startDelay")) {
        if (
          typeof dropOptions.startDelay !== "number" ||
          !Number.isFinite(dropOptions.startDelay) ||
          dropOptions.startDelay < 0
        ) {
          throw new Error("Resolution drop registration dropOptions.startDelay must be a non-negative number.");
        }
        baseDelay = dropOptions.startDelay;
      }

      var registerOptions = dropOptions ? Object.assign({}, dropOptions) : {};
      registerOptions.startDelay = baseDelay;
      if (requiresEliminationHold) {
        registerOptions.holdUntilEliminationPresentationComplete = true;
      }
      return registerOptions;
    },

    _registerResolutionDrops: function (cells, grid, resolution, dropOptions, timingOptions) {
      if (!Array.isArray(cells)) {
        throw new Error("Resolution drop registration requires cells array.");
      }
      if (
        dropOptions !== undefined &&
        (
          !dropOptions ||
          typeof dropOptions !== "object" ||
          Array.isArray(dropOptions)
        )
      ) {
        throw new Error("Resolution drop registration dropOptions must be an object when provided.");
      }
      if (
        timingOptions !== undefined &&
        (
          !timingOptions ||
          typeof timingOptions !== "object" ||
          Array.isArray(timingOptions)
        )
      ) {
        throw new Error("Resolution drop registration timingOptions must be an object when provided.");
      }

      var pendingCells = cells.filter(function (cell) {
        if (!cell) {
          throw new Error("Resolution drop registration requires cell.");
        }
        return cell.__resolutionDropRegistered !== true;
      });
      if (!pendingCells.length) {
        return;
      }

      if (!timingOptions || timingOptions.skipAssistSpiritSkillCharge !== true) {
        this._collectAssistSpiritSkillCharge(pendingCells, "floating_drop");
      }

      var prepared = this._prepareResolutionDropCells(pendingCells, resolution);
      var registerOptions = this._buildResolutionDropRegisterOptions(resolution, dropOptions, timingOptions);
      var immediateCandidates = this._splitMolotovDropCandidates(prepared.immediate);
      if (immediateCandidates.immediate.length) {
        this.systems.fallingMarbleSystem.registerDrops(
          immediateCandidates.immediate,
          grid,
          registerOptions
        );
        immediateCandidates.immediate.forEach(function (cell) {
          cell.__resolutionDropRegistered = true;
        });
      }

      if (prepared.delayedIce.length) {
        var delayedCandidates = this._splitMolotovDropCandidates(prepared.delayedIce);
        if (delayedCandidates.immediate.length) {
          var delayedIceRegisterOptions = this._buildResolutionDropRegisterOptions(
            resolution,
            { startDelay: FLOATING_ICE_DROP_DELAY },
            timingOptions
          );
          this.systems.fallingMarbleSystem.registerDrops(
            delayedCandidates.immediate,
            grid,
            delayedIceRegisterOptions
          );
          delayedCandidates.immediate.forEach(function (cell) {
            cell.__resolutionDropRegistered = true;
          });
        }
      }
    },

    _resolveFairyAssistsAfterResolution: function (resolution) {
      if (!resolution || !Array.isArray(resolution.fairyAssistEvents)) {
        throw new Error("Fairy assist resolution requires resolution.fairyAssistEvents.");
      }
      if (resolution.fairyAssistResolved === true) {
        throw new Error("Fairy assist resolution cannot run twice for one shot.");
      }
      if (!this.systems || !this.systems.fairyAssistSystem) {
        throw new Error("Fairy assist resolution requires FairyAssistSystem.");
      }

      resolution.fairyAssistEvents = this.systems.fairyAssistSystem.resolveAfterShot(
        resolution,
        this.systems.bubbleGrid
      );
      this._pushFairyAssistDepartEvents(resolution.fairyAssistEvents);
      resolution.fairyAssistResolved = true;
    }
  };
}

module.exports = createGameManagerShotDropMethods;
