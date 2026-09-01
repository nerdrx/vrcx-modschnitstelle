// ============================================================================
// Orbit Graph — persistence. READ-ONLY: touches core tables only, creates
// nothing of its own.
//
// Both gamelog tables are GLOBAL (not per-user prefixed), so no
// ctx.db.corePrefix() is needed here.
//
//   gamelog_location   — every instance *I* visited (my own presence windows)
//   gamelog_join_leave — every player join/leave VRChat logged while I was
//                        in that instance (my own join/leave rows included)
//
// Rows arrive from ctx.db.query() as POSITIONAL ARRAYS.
// ============================================================================

/**
 * Convert a millisecond timestamp into the ISO string format VRCX stores in
 * created_at ('2026-07-21T12:34:56.789Z'), which is lexicographically
 * sortable and therefore usable in a plain SQL range filter.
 *
 * @param {number} ms
 * @returns {string}
 */
export function isoFromMs(ms) {
    return new Date(ms).toISOString();
}

/**
 * Start of the requested time range as an ISO string.
 *
 * @param {number} nowMs
 * @param {number|null} rangeDays null/0 → everything ever recorded
 * @returns {string}
 */
export function rangeStartIso(nowMs, rangeDays) {
    if (!rangeDays || !Number.isFinite(rangeDays) || rangeDays <= 0) {
        return '0000-01-01T00:00:00.000Z';
    }
    return isoFromMs(nowMs - rangeDays * 86400000);
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

/**
 * My own instance visits inside the range.
 *
 * `time` is the visit duration in ms; it is NULL/0 for the row VRCX is
 * currently filling (the running or last session) — the engine then derives
 * the end from the following row (or "now").
 *
 * @param {object} ctx mod context
 * @param {string} fromIso inclusive lower bound on created_at
 * @returns {Promise<Array<{createdAt:string, location:string, worldId:string,
 *                          worldName:string, time:number|null}>>}
 */
export async function getLocationRows(ctx, fromIso) {
    const rows = await ctx.db.query(
        `SELECT created_at, location, world_id, world_name, time
         FROM gamelog_location
         WHERE created_at >= @from
         ORDER BY created_at ASC`,
        { '@from': fromIso }
    );
    return rows.map((r) => ({
        createdAt: r[0] || '',
        location: r[1] || '',
        worldId: r[2] || '',
        worldName: r[3] || '',
        time: toNumberOrNull(r[4])
    }));
}

/**
 * Every join/leave event in the range. Old rows can carry an empty user_id,
 * hence display_name is always read as well (the engine keys people by
 * `user_id || 'name:' + display_name`).
 *
 * @param {object} ctx mod context
 * @param {string} fromIso inclusive lower bound on created_at
 * @returns {Promise<Array<{createdAt:string, type:string, displayName:string,
 *                          location:string, userId:string}>>}
 */
export async function getJoinLeaveRows(ctx, fromIso) {
    const rows = await ctx.db.query(
        `SELECT created_at, type, display_name, location, user_id
         FROM gamelog_join_leave
         WHERE created_at >= @from
           AND type IN ('OnPlayerJoined','OnPlayerLeft')
         ORDER BY created_at ASC`,
        { '@from': fromIso }
    );
    return rows.map((r) => ({
        createdAt: r[0] || '',
        type: r[1] || '',
        displayName: r[2] || '',
        location: r[3] || '',
        userId: r[4] || ''
    }));
}
