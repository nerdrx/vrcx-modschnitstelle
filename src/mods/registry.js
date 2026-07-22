// ============================================================================
// Mod registry — add/remove mods here. Order = load order.
// ============================================================================

import statusTracker from './status-tracker';
import friendCare from './friend-care';
import playtimeDashboard from './playtime-dashboard';
import profileArchiver from './profile-archiver';
import worldHopper from './world-hopper';
import orbitGraph from './orbit-graph';
import globalDb from './global-db';
import vrcWrapped from './vrc-wrapped';

export const mods = [statusTracker, friendCare, playtimeDashboard, profileArchiver, worldHopper, orbitGraph, globalDb, vrcWrapped];
