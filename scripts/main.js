/*!
 * Don't Wander
 * 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import {
  DEFAULT_SHOCK_SOUND, MODULE_ID, SHOCK_SOUND_SETTING, ZONE_BEHAVIOR_TYPE, ZONE_COLOR, ZONE_ICON
} from "./constants.js";
import { onPreMoveToken } from "./enforcement.js";
import { PartyZoneBehaviorType } from "./party-zone.js";
import { registerShockListener } from "./shock.js";

// The Create Region Behavior dialog shows a type label only when game.i18n.has() finds it, and
// otherwise falls back to the raw type key. This module keeps its strings hardcoded, so the label
// is registered as a translation at runtime rather than shipping a lang/ file.
const ZONE_LABEL_KEY = `TYPES.RegionBehavior.${ZONE_BEHAVIOR_TYPE}`;

foundry.helpers.Hooks.once("init", () => {
  CONFIG.RegionBehavior.dataModels[ZONE_BEHAVIOR_TYPE] = PartyZoneBehaviorType;
  CONFIG.RegionBehavior.typeLabels[ZONE_BEHAVIOR_TYPE] = ZONE_LABEL_KEY;
  CONFIG.RegionBehavior.typeIcons[ZONE_BEHAVIOR_TYPE] = ZONE_ICON;
  CONFIG.RegionBehavior.typeHints[ZONE_BEHAVIOR_TYPE] =
    "Player-moved tokens cannot leave this region, and tokens outside every zone can only move into one.";

  game.settings.register(MODULE_ID, SHOCK_SOUND_SETTING, {
    name: "Shock sound",
    hint: "Played for everyone when a token is shocked at the edge of a Party Zone. Leave empty for no sound.",
    scope: "world",
    config: true,
    type: new foundry.data.fields.FilePathField({categories: ["AUDIO"], blank: true}),
    default: DEFAULT_SHOCK_SOUND
  });
});

// Translations are loaded between init and i18nInit, so earlier writes would be discarded.
foundry.helpers.Hooks.once("i18nInit", () => {
  foundry.utils.setProperty(game.i18n.translations, ZONE_LABEL_KEY, "Party Zone");
});

foundry.helpers.Hooks.on("preMoveToken", onPreMoveToken);
foundry.helpers.Hooks.once("ready", registerShockListener);

foundry.helpers.Hooks.on("getSceneControlButtons", controls => {
  const regions = controls.regions;
  if ( !regions ) return;
  // Tool order is documented as an integer: open a slot right after Rectangle.
  const after = regions.tools.rectangle.order;
  for ( const tool of Object.values(regions.tools) ) {
    if ( tool.order > after ) tool.order += 1;
  }
  regions.tools.partyZone = {
    ...regions.tools.rectangle,          // inherits creation/control/shapeData/toolclip
    name: "partyZone",
    title: "Draw Party Zone",
    icon: ZONE_ICON,
    order: after + 1,
    visible: game.user.isGM
  };
});

// The Region layer builds new Regions from its palette's data and never reads a tool's
// createData, so the zone data is applied here, while the Party Zone tool is the active one.
foundry.helpers.Hooks.on("preCreateRegion", (region, data, options, userId) => {
  if ( (userId !== game.user.id) || (ui.controls.tool?.name !== "partyZone") ) return;
  region.updateSource({
    name: "Party Zone",
    color: ZONE_COLOR,
    // New Regions default to showing only on the Regions layer; players should see where they may go.
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    behaviors: [{ type: ZONE_BEHAVIOR_TYPE, name: "Party Zone" }]
  });
});
