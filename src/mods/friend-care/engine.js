// ============================================================================
// Friend Care — pure logic (no VRCX imports, fully unit-testable).
//
// Two trackers:
//  1. "Last Seen"  — how long since a friend was in the same instance as me.
//  2. "Inactivity" — how long since a friend was last active in VRChat at all.
//
// Category logic ported 1:1 from the proven standalone prototype
// (vrcx_friend_tracker.py). Check order matters: descending severity first,
// otherwise orange swallows red.
// ============================================================================

export const DAYS_PER_MONTH = 30.44; // mean month length

export const SEEN_CATEGORIES = ['green', 'neutral', 'orange', 'red', 'never'];
export const INACTIVITY_CATEGORIES = ['active', 'green', 'orange', 'red', 'nodata'];

/** Tab 1: last time in the same instance. */
export function seenCategory(days) {
    if (days == null) {
        return 'never';
    }
    if (days < 1 * DAYS_PER_MONTH) {
        return 'green';
    }
    if (days >= 6 * DAYS_PER_MONTH) {
        return 'red';
    }
    if (days >= 3 * DAYS_PER_MONTH) {
        return 'orange';
    }
    return 'neutral'; // 1–3 months
}

/** Tab 2: last VRChat activity (API last_activity/last_login). */
export function inactivityCategory(days) {
    if (days == null) {
        return 'nodata';
    }
    if (days >= 12 * DAYS_PER_MONTH) {
        return 'red';
    }
    if (days >= 9 * DAYS_PER_MONTH) {
        return 'orange';
    }
    if (days >= 6 * DAYS_PER_MONTH) {
        return 'green';
    }
    return 'active'; // under 6 months
}

export function daysBetween(tsMs, nowMs) {
    if (!tsMs || !Number.isFinite(tsMs)) {
        return null;
    }
    return Math.max(0, (nowMs - tsMs) / 86400000);
}

/**
 * Match aggregated gamelog rows against the friend list.
 * Old gamelog entries may have an empty user_id → fall back to display_name,
 * but only as a supplement (names change over time).
 *
 * @param {Array<{userId:string, displayName:string}>} friends
 * @param {Array<{userId:string, displayName:string, lastDt:string, location:string}>} rows
 * @returns {Map<string, {lastDt:string, location:string}>} friend userId -> hit
 */
export function matchLastSeen(friends, rows) {
    const byUserId = new Map();
    const byName = new Map();
    for (const row of rows) {
        if (row.userId) {
            const cur = byUserId.get(row.userId);
            if (!cur || row.lastDt > cur.lastDt) {
                byUserId.set(row.userId, row);
            }
        } else if (row.displayName) {
            const cur = byName.get(row.displayName);
            if (!cur || row.lastDt > cur.lastDt) {
                byName.set(row.displayName, row);
            }
        }
    }

    const result = new Map();
    for (const friend of friends) {
        let hit = byUserId.get(friend.userId) || null;
        const nameHit = byName.get(friend.displayName) || null;
        // an id-less entry may be the only record for this friend, or even the
        // newer one — take whichever timestamp is later.
        if (nameHit && (!hit || nameHit.lastDt > hit.lastDt)) {
            hit = nameHit;
        }
        if (hit) {
            result.set(friend.userId, { lastDt: hit.lastDt, location: hit.location });
        }
    }
    return result;
}

/**
 * Pick the best "last active" timestamp for a friend.
 * Prefers live VRChat-API fields; falls back to the feed heuristic.
 *
 * @returns {{tsMs:number|null, source:string}}
 */
export function pickLastActive({ lastActivityIso, lastLoginIso, feedFallbackIso }) {
    const api = [lastActivityIso, lastLoginIso]
        .map((iso) => (iso ? new Date(iso).getTime() : NaN))
        .filter((ms) => Number.isFinite(ms) && ms > 0);
    if (api.length > 0) {
        return { tsMs: Math.max(...api), source: 'api' };
    }
    if (feedFallbackIso) {
        const ms = new Date(feedFallbackIso).getTime();
        if (Number.isFinite(ms)) {
            return { tsMs: ms, source: 'feed' };
        }
    }
    return { tsMs: null, source: 'none' };
}
