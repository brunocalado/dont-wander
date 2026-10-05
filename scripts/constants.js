/*!
 * Don't Wander
 * 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

export const MODULE_ID = "dont-wander";

// Module-defined subtypes are namespaced by the module id. Used by the CONFIG registration, the
// enforcement hook and the scene-control tool — three call sites, so it lives here.
export const ZONE_BEHAVIOR_TYPE = `${MODULE_ID}.partyZone`;

// audio-console's accent; zones are drawn in it so they read as this module's at a glance.
export const ZONE_COLOR = "#d4af37";
export const ZONE_ICON = "fa-solid fa-person-shelter";

export const SHOCK_SOUND_SETTING = "shockSound";
// "forceField_000" from Kenney's Sci-Fi Sounds (CC0); the GM can pick another in the settings.
export const DEFAULT_SHOCK_SOUND = `modules/${MODULE_ID}/sounds/shock.ogg`;
