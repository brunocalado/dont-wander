/*!
 * Don't Wander
 * 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { MODULE_ID, ZONE_BEHAVIOR_TYPE } from "./constants.js";
import { shock } from "./shock.js";

/** Active zones on the token's scene: regions holding an enabled Party Zone behavior. */
function activeZones(scene) {
  return scene.regions.filter(r =>
    r.behaviors.some(b => (b.type === ZONE_BEHAVIOR_TYPE) && !b.disabled));
}

/**
 * Points along the straight segment a→b, at most `step` apart, b included and a excluded.
 * Two inside endpoints don't prove the segment between them is inside: the combined zones can be
 * concave (an L of two rectangles) or have holes. The segment keeps a's Level until b, where a
 * level change (stairs, a Change Level region) takes effect.
 */
function* sampleSegment(a, b, step) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  for ( let k = 1; k <= n; k++ ) {
    const t = k / n;
    yield {x: a.x + ((b.x - a.x) * t), y: a.y + ((b.y - a.y) * t), level: (k === n) ? b.level : a.level};
  }
}

function warn() {
  ui.notifications.warn("Wait for the GM — you can't leave the zone yet.");
}

/**
 * preMoveToken fires only on the client that requests the move, and its waypoints are final: the
 * move can only be rejected whole. A drag with waypoints fires once per checkpoint, but the first
 * call already carries the rest of the path in `pending`, so rejecting there stops all of it.
 * The bounce off the edge is therefore new movement, started after the rejection.
 *
 * The hook is the public seam for this. Walls would block NPCs and the GM too; the Region
 * "restriction" setting and Define Surface don't stop crossing a Region's sides; terrain cost works
 * inside a region, the inverse of what is needed; overriding TokenDocument#_preUpdateMovement means
 * replacing the Token document class. The check runs on the player's own client by design — a
 * table courtesy, not a guard against a player editing documents from the console.
 */
export function onPreMoveToken(tokenDoc, movement, operation) {
  // GMs are never restricted — that includes the GM moving a player's token.
  if ( game.user.isGM ) return;

  // Centre line of the whole path, origin first, each point tagged with the Level it is on.
  const waypoints = [movement.origin, ...movement.passed.waypoints, ...movement.pending.waypoints];
  const centres = waypoints.map(w => ({...tokenDoc.getCenterPoint(w), level: w.level ?? tokenDoc.level}));

  // Zones follow v14 Levels, not elevation: a zone holds tokens on the Levels its Region is in (all
  // of them when it lists none), whatever their elevation. RegionDocument#testPoint would also apply
  // the Region's elevation range, which the drawing tools set to the Level's band, and let a token
  // standing above it escape — so the Level is tested explicitly and only the 2D shape after it.
  // Only zones on a Level the path touches count, so a Level with no zones stays unrestricted.
  const levels = new Set(centres.map(c => c.level));
  const zones = activeZones(tokenDoc.parent).filter(z => levels.values().some(l => z.includedInLevel(l)));
  if ( !zones.length ) return;
  const inside = point => zones.some(z => z.includedInLevel(point.level) && z.polygonTree.testPoint(point));
  const step = tokenDoc.parent.grid.size / 4;

  // The bounce's own moves are planned inside the zone; if one is refused anyway, don't bounce again.
  const bouncing = operation?.[MODULE_ID]?.bounce;

  // Once the centre is inside the combined zones it may not leave, and the move must end inside.
  // A token starting outside may cross open ground on its way in, but not wander around outside.
  let entered = inside(centres[0]);
  let lastInside = entered ? centres[0] : null;
  for ( let i = 1; i < centres.length; i++ ) {
    for ( const point of sampleSegment(centres[i - 1], centres[i], step) ) {
      if ( inside(point) ) {
        entered = true;
        lastInside = point;
        continue;
      }
      if ( !entered ) continue;
      if ( bouncing ) return false;
      warn();
      bounce(tokenDoc, {prefix: waypoints.slice(1, i), from: centres[i - 1], to: centres[i], lastInside,
        contact: {x: (lastInside.x + point.x) / 2, y: (lastInside.y + point.y) / 2}, inside, step});
      return false;
    }
  }
  if ( !inside(centres.at(-1)) ) {
    if ( bouncing ) return false;
    warn();
    shock(tokenDoc);
    return false;
  }
}

/** Is every sampled point of the polyline inside? */
function pathInside(points, inside, step) {
  if ( !inside(points[0]) ) return false;
  for ( let i = 1; i < points.length; i++ ) {
    for ( const point of sampleSegment(points[i - 1], points[i], step) ) {
      if ( !inside(point) ) return false;
    }
  }
  return true;
}

/**
 * The token runs into the edge, gets shocked, and is thrown one grid space back the way it came.
 * Both moves are re-checked by preMoveToken, so each target is a snapped position whose path stays
 * inside; where none exists the token is shocked where it stands.
 */
async function bounce(tokenDoc, {prefix, from, to, lastInside, contact, inside, step}) {
  const level = lastInside.level;
  const offset = tokenDoc.getCenterPoint({x: 0, y: 0});
  const snap = c => {
    const p = tokenDoc.getSnappedPosition({x: c.x - offset.x, y: c.y - offset.y});
    return {x: p.x, y: p.y, level};
  };
  const centreOf = p => ({...tokenDoc.getCenterPoint(p), level});
  const prefixCentres = [tokenDoc.getCenterPoint(), ...prefix.map(w => tokenDoc.getCenterPoint(w))]
    .map(c => ({...c, level: tokenDoc.level}));

  // The edge: the last snapped position on the way out whose path from the origin stays inside.
  let edge = null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  for ( let d = Math.hypot(lastInside.x - from.x, lastInside.y - from.y); d >= 0; d -= step ) {
    const candidate = snap({x: from.x + (dx * d / length), y: from.y + (dy * d / length)});
    if ( pathInside([...prefixCentres, centreOf(candidate)], inside, step) ) {
      edge = candidate;
      break;
    }
  }

  // The rejected movement is still unwinding in this tick.
  await new Promise(resolve => setTimeout(resolve, 0));
  const options = {[MODULE_ID]: {bounce: true}};
  const atOrigin = !edge || ((edge.x === tokenDoc.x) && (edge.y === tokenDoc.y));
  if ( !atOrigin ) {
    await tokenDoc.move([...prefix, edge], options);
    await tokenDoc.object?.movementAnimationPromise;
  }
  await shock(tokenDoc, contact);
  if ( !edge ) return;

  // Thrown back one grid space against the direction of travel, if that lands inside.
  const size = tokenDoc.parent.grid.size;
  const edgeCentre = centreOf(edge);
  const back = snap({x: edgeCentre.x - (dx / length * size), y: edgeCentre.y - (dy / length * size)});
  if ( pathInside([centreOf({x: tokenDoc.x, y: tokenDoc.y}), centreOf(back)], inside, step) ) {
    await tokenDoc.move(back, options);
  }
}
