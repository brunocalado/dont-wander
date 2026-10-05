/*!
 * Don't Wander
 * 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { MODULE_ID, SHOCK_SOUND_SETTING } from "./constants.js";

const SOCKET_EVENT = `module.${MODULE_ID}`;
const SHAKE_MS = 400;

/** Every client plays the shock itself, so each one uses its own interface volume. */
export function registerShockListener() {
  game.socket.on(SOCKET_EVENT, playShock);
}

/**
 * Shock a token on every client viewing its scene. Resolves when the local effect ends.
 * @param {TokenDocument} tokenDoc
 * @param {Point|null} [contact]  Where the token hit the zone's edge, if it hit one.
 */
export function shock(tokenDoc, contact=null) {
  const payload = {sceneId: tokenDoc.parent.id, tokenId: tokenDoc.id,
    contact: contact && {x: Math.round(contact.x), y: Math.round(contact.y)}};
  game.socket.emit(SOCKET_EVENT, payload);
  // The emitter never receives its own broadcast.
  return playShock(payload);
}

const FLASH_COLOR = 0xA0F4FF;
const ARC_COLOR = 0x7FE7FF;

async function playShock({sceneId, tokenId, contact}) {
  if ( canvas.scene?.id !== sceneId ) return;
  const src = game.settings.get(MODULE_ID, SHOCK_SOUND_SETTING);
  if ( src ) foundry.audio.AudioHelper.play({src, volume: 0.8, autoplay: true}, false);
  const token = canvas.tokens.get(tokenId);
  if ( !token?.mesh ) return;

  // Arcs and the edge ripple are removed when the shock ends.
  const arcs = overToken(token);
  const ripple = contact ? overToken(token) : null;
  const tint = foundry.utils.Color.from(token.mesh.tint);
  const amplitude = token.w * 0.08;
  const radius = Math.max(token.w, token.h) / 2;
  let side = 1;
  try {
    await foundry.canvas.animation.CanvasAnimation.animate([], {
      name: `${token.objectId}.${MODULE_ID}.shock`,
      context: token,
      duration: SHAKE_MS,
      ontick: (elapsed, animation) => {
        const fade = 1 - Math.min(animation.time / SHAKE_MS, 1);

        // Shake: only the mesh, sideways, fading out. The side flips every frame rather than
        // following a sine, so the shake shows at any frame rate.
        side = -side;
        token.mesh.position.x = token.center.x + (side * amplitude * fade);

        // Flash: one fade from cyan-white back to the token's own tint, not a strobe.
        token.mesh.tint = tint.mix(foundry.utils.Color.from(FLASH_COLOR), fade);

        // Arcs: a few jagged bolts from near the centre past the token's rim, new ones every frame.
        drawArcs(arcs, token.center, radius, fade);

        // Ripple: the barrier lights up where the token hit it, as a ring growing and fading.
        if ( ripple ) {
          ripple.clear();
          ripple.lineStyle({width: 3, color: ARC_COLOR, alpha: fade});
          ripple.drawCircle(contact.x, contact.y, radius * (0.3 + (0.9 * (1 - fade))));
          ripple.beginFill(0xFFFFFF, 0.8 * fade).drawCircle(contact.x, contact.y, 3 + (4 * fade)).endFill();
        }
      }
    });
  } finally {
    arcs.destroy();
    ripple?.destroy();
    // Position and tint come back from the document.
    token.renderFlags.set({refreshPosition: true, refreshMesh: true});
  }
}

/**
 * Token sprites live in the primary group and draw over the interface group, so effects meant to
 * sit on top of a token go into the primary group too, sorted just above that token's mesh. They
 * stay under fog and occlusion like the token itself.
 */
function overToken(token) {
  const graphics = new foundry.canvas.primary.PrimaryGraphics();
  graphics.elevation = token.mesh.elevation;
  graphics.sortLayer = token.mesh.sortLayer;
  graphics.sort = token.mesh.sort;
  graphics.zIndex = token.mesh.zIndex + 1;
  return canvas.primary.addChild(graphics);
}

function drawArcs(graphics, centre, radius, fade) {
  graphics.clear();
  if ( fade <= 0 ) return;
  for ( let bolt = 0; bolt < 4; bolt++ ) {
    const angle = Math.random() * Math.PI * 2;
    const inner = radius * 0.3;
    const length = radius * (1.05 + (Math.random() * 0.35));
    const points = [];
    for ( let step = 0; step <= 5; step++ ) {
      const r = inner + ((length - inner) * step / 5);
      const jitter = step ? (Math.random() - 0.5) * 0.6 : 0;
      points.push(centre.x + (Math.cos(angle + jitter) * r), centre.y + (Math.sin(angle + jitter) * r));
    }
    // A wide translucent glow under a thin white core reads as a spark on any background.
    for ( const [width, color, alpha] of [[6, ARC_COLOR, 0.5], [2, 0xFFFFFF, 1]] ) {
      graphics.lineStyle({width, color, alpha: alpha * fade});
      graphics.moveTo(points[0], points[1]);
      for ( let i = 2; i < points.length; i += 2 ) graphics.lineTo(points[i], points[i + 1]);
    }
  }
}
