"use strict";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function distancePoints(a, b) {
  var dx = (b.x || 0) - (a.x || 0);
  var dy = (b.y || 0) - (a.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function createEmptyState() {
  return {
    enabled: false,
    isDrawing: false,
    dirty: false,
    levelId: 0,
    levelCode: "",
    routeSequence: 1,
    activeRouteId: null,
    routes: []
  };
}

function createStateForLevel(levelId, levelCode, routes) {
  var safeRoutes = Array.isArray(routes) ? routes : [];
  return {
    enabled: false,
    isDrawing: false,
    dirty: false,
    levelId: Math.max(0, Math.floor(Number(levelId) || 0)),
    levelCode: typeof levelCode === "string" ? levelCode : "",
    routeSequence: Math.max(1, safeRoutes.length + 1),
    activeRouteId: safeRoutes.length > 0 ? safeRoutes[0].id : null,
    routes: safeRoutes
  };
}

function getActiveRoute(state) {
  if (!state || !Array.isArray(state.routes)) {
    return null;
  }

  for (var index = 0; index < state.routes.length; index += 1) {
    var route = state.routes[index];
    if (route && route.id === state.activeRouteId) {
      return route;
    }
  }

  return null;
}

function createRoute(state) {
  if (!state) {
    return null;
  }

  var sequence = Math.max(1, Math.floor(Number(state.routeSequence) || 1));
  state.routeSequence = sequence + 1;
  return {
    id: "route_" + sequence,
    name: "Route " + sequence,
    points: []
  };
}

function ensureActiveRoute(state, autoCreate) {
  var route = getActiveRoute(state);
  if (route || !autoCreate || !state) {
    return route;
  }

  route = createRoute(state);
  if (!route) {
    return null;
  }

  state.routes.push(route);
  state.activeRouteId = route.id;
  state.dirty = true;
  return route;
}

function appendPoint(state, route, point, minDistance, force) {
  if (!state || !route || !point) {
    return false;
  }

  var normalizedPoint = {
    x: Math.round(Number(point.x) || 0),
    y: Math.round(Number(point.y) || 0)
  };
  var lastPoint = route.points.length > 0 ? route.points[route.points.length - 1] : null;
  var minGap = Math.max(4, Number(minDistance) || 18);
  if (lastPoint && distancePoints(lastPoint, normalizedPoint) < (force ? 1 : minGap)) {
    return false;
  }

  route.points.push(normalizedPoint);
  state.dirty = true;
  return true;
}

function collectRoutesForSave(state) {
  if (!state || !Array.isArray(state.routes)) {
    return [];
  }

  return state.routes.filter(function (route) {
    return route && Array.isArray(route.points) && route.points.length > 0;
  }).map(function (route) {
    return clone(route);
  });
}

function applySavedRoutes(state, routesToSave) {
  if (!state) {
    return;
  }

  var safeRoutes = Array.isArray(routesToSave) ? routesToSave : [];
  state.routes = safeRoutes;
  state.dirty = false;
  var activeRouteStillExists = safeRoutes.some(function (route) {
    return route.id === state.activeRouteId;
  });
  if (!activeRouteStillExists) {
    state.activeRouteId = safeRoutes.length > 0 ? safeRoutes[0].id : null;
  }
  if (!state.activeRouteId && safeRoutes.length > 0) {
    state.activeRouteId = safeRoutes[0].id;
  }
}

module.exports = {
  createEmptyState: createEmptyState,
  createStateForLevel: createStateForLevel,
  getActiveRoute: getActiveRoute,
  createRoute: createRoute,
  ensureActiveRoute: ensureActiveRoute,
  appendPoint: appendPoint,
  collectRoutesForSave: collectRoutesForSave,
  applySavedRoutes: applySavedRoutes
};
