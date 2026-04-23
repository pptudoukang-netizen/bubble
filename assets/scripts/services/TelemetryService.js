"use strict";

function buildSessionId() {
  var now = Date.now().toString(36);
  var randomPart = Math.floor(Math.random() * 1679616).toString(36);
  return "sess_" + now + "_" + randomPart;
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function TelemetryService(options) {
  options = options || {};
  this.logger = options.logger || null;
  this.sessionId = options.sessionId || buildSessionId();
  this.context = {};
  this.eventSequence = 0;
}

TelemetryService.prototype.getSessionId = function () {
  return this.sessionId;
};

TelemetryService.prototype.setContext = function (contextPatch) {
  if (!contextPatch || typeof contextPatch !== "object") {
    return clone(this.context);
  }

  Object.keys(contextPatch).forEach(function (key) {
    var value = contextPatch[key];
    if (value === undefined || value === null || value === "") {
      delete this.context[key];
      return;
    }
    this.context[key] = value;
  }, this);

  return clone(this.context);
};

TelemetryService.prototype.clearContext = function () {
  this.context = {};
};

TelemetryService.prototype.track = function (eventName, payload) {
  if (typeof eventName !== "string" || !eventName) {
    return null;
  }

  this.eventSequence += 1;
  var data = {
    event_id: this.eventSequence,
    event_name: eventName,
    event_time_ms: Date.now(),
    session_id: this.sessionId
  };
  var context = this.context || {};
  Object.keys(context).forEach(function (key) {
    data[key] = context[key];
  });

  var safePayload = payload && typeof payload === "object" ? payload : {};
  Object.keys(safePayload).forEach(function (key) {
    if (safePayload[key] === undefined) {
      return;
    }
    data[key] = safePayload[key];
  });

  if (this.logger && typeof this.logger.info === "function") {
    this.logger.info("[Telemetry]", eventName, data);
  }
  return data;
};

module.exports = TelemetryService;
