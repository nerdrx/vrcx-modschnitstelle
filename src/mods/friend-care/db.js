// ============================================================================
// Friend Care — persistence. READ-ONLY: only queries VRCX core tables,
// creates no own tables.
// ============================================================================

/**
 * Last shared-instance sighting per person from the global gamelog.
 * Old rows may have an empty user_id → grouped by COALESCE(user_id, name).
 * SQLite guarantees bare columns to come from the MAX() row.
 *
 * @returns {Promise<Array<{userId:string, displayName:string, lastDt:string, location:string}>>}
 */
export async function getLastSeenRows(ctx) {
    const rows = await ctx.db.query(
        `SELECT user_id, display_name, MAX(created_at) AS last_dt, location
         FROM gamelog_join_leave
         WHERE type IN ('OnPlayerJoined','OnPlayerLeft')
         GROUP BY COALESCE(NULLIF(user_id,''), display_name)`
    );
    return rows.map((r) => ({
        userId: r[0] || '',
        displayName: r[1] || '',
        lastDt: r[2] || '',
        location: r[3] || ''
    }));
}

/**
 * World names known locally: VRCX logs every visited instance into the
 * global gamelog_location table incl. world_name. Since "last seen" spots
 * are instances *I* was in, this resolves nearly all locations without a
 * single API call.
 *
 * @returns {Promise<Map<string, string>>} worldId -> world name (newest wins)
 */
export async function getWorldNames(ctx) {
    const rows = await ctx.db.query(
        `SELECT world_id, world_name, MAX(created_at)
         FROM gamelog_location
         WHERE world_id != '' AND world_name != ''
         GROUP BY world_id`
    );
    const names = new Map();
    for (const [worldId, worldName] of rows) {
        names.set(worldId, worldName);
    }
    return names;
}

/**
 * Fallback: newest feed event per friend across all per-user feed tables
 * ("last sign of life VRCX has observed"). Only used for friends whose
 * API user object carries no last_activity/last_login.
 *
 * @returns {Promise<Map<string, {lastDt:string, source:string}>>} userId -> hit
 */
export async function getLastFeedActivity(ctx) {
    const prefix = ctx.db.corePrefix();
    const tables = [
        'feed_online_offline',
        'feed_gps',
        'feed_status',
        'feed_avatar',
        'feed_bio'
    ];
    const best = new Map();
    for (const table of tables) {
        const rows = await ctx.db.query(
            `SELECT user_id, MAX(created_at)
             FROM ${prefix}_${table}
             WHERE user_id != ''
             GROUP BY user_id`
        );
        for (const [userId, lastDt] of rows) {
            if (!lastDt) {
                continue;
            }
            const cur = best.get(userId);
            if (!cur || lastDt > cur.lastDt) {
                best.set(userId, { lastDt, source: table });
            }
        }
    }
    return best;
}
