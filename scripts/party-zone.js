/*!
 * Don't Wander
 * 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

/**
 * Marks a Region as a Party Zone. It has no fields and handles no events: the movement check
 * looks for Regions carrying it, and the core `disabled` toggle is the per-zone on/off switch.
 */
export class PartyZoneBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    return {};
  }
}
