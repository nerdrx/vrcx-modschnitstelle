// ============================================================================
// Mod registry — add/remove mods here. Order = load order.
// ============================================================================

import statusTracker from './status-tracker';
import friendCare from './friend-care';
import orbitGraph from './orbit-graph';
import globalDb from './global-db';

export const mods = [statusTracker, friendCare, orbitGraph, globalDb];
