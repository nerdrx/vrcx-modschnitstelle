// ============================================================================
// Mod registry — add/remove mods here. Order = load order.
// ============================================================================

import statusTracker from './status-tracker';
import friendCare from './friend-care';
import playtimeDashboard from './playtime-dashboard';
import profileArchiver from './profile-archiver';
import worldHopper from './world-hopper';

export const mods = [statusTracker, friendCare, playtimeDashboard, profileArchiver, worldHopper];


