// ============================================================================
// Playtime Dashboard — persistence & database query helper.
// READ-ONLY: queries VRCX core feed tables and gamelog tables.
// ============================================================================

/**
 * Fetch online/offline presence logs from core feed table.
 *
 * @param {object} ctx Mod context
 * @param {number} limit Max rows to fetch
 * @returns {Promise<Array<{createdAt: string, type: string, userId: string}>>}
 */
export async function getOnlineOfflineLogs(ctx, limit = 2000) {
    const table = `${ctx.db.corePrefix()}_feed_online_offline`;
    const sql = `SELECT created_at, type, user_id FROM ${table} ORDER BY created_at ASC LIMIT ${Number(limit)}`;
    try {
        const rows = await ctx.db.query(sql);
        return rows.map((r) => ({
            createdAt: r[0] || '',
            type: r[1] || '',
            userId: r[2] || ''
        }));
    } catch (err) {
        ctx.warn('failed to fetch online_offline logs:', err);
        return [];
    }
}

/**
 * Fetch GPS world visit logs from core feed table.
 *
 * @param {object} ctx Mod context
 * @param {number} limit Max rows to fetch
 * @returns {Promise<Array<{createdAt: string, location: string}>>}
 */
export async function getGpsLogs(ctx, limit = 2000) {
    const table = `${ctx.db.corePrefix()}_feed_gps`;
    const sql = `SELECT created_at, location FROM ${table} ORDER BY created_at ASC LIMIT ${Number(limit)}`;
    try {
        const rows = await ctx.db.query(sql);
        return rows.map((r) => ({
            createdAt: r[0] || '',
            location: r[1] || ''
        }));
    } catch (err) {
        ctx.warn('failed to fetch gps logs:', err);
        return [];
    }
}

/**
 * Fetch world names from local gamelog_location table.
 *
 * @param {object} ctx Mod context
 * @returns {Promise<Map<string, string>>} worldId -> worldName
 */
export async function getWorldNames(ctx) {
    try {
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
    } catch (err) {
        ctx.warn('failed to fetch world names from gamelog_location:', err);
        return new Map();
    }
}
