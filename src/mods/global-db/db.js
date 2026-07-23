// ============================================================================
// Global DB mod — local persistence:
//  * key/value store (settings, sync cursors)
//  * pool mirror tables (data synced FROM the server; own tables only,
//    the local VRCX core database is never modified)
// ============================================================================

const kvTable = (ctx) => `${ctx.db.prefix()}_kv`;
export const poolTable = (ctx, key) => `${ctx.db.prefix()}_p_${key}`;

// Mirrors of the server-side g_* tables (+ remote_id as sync cursor).
export const POOL_TABLES = {
    status: 'created_at TEXT, user_id TEXT, status TEXT, status_description TEXT',
    bio: 'created_at TEXT, user_id TEXT, bio TEXT',
    online_offline:
        'created_at TEXT, user_id TEXT, type TEXT, location TEXT, world_name TEXT, time INTEGER',
    gps: 'created_at TEXT, user_id TEXT, location TEXT, world_name TEXT, time INTEGER',
    join_leave:
        'created_at TEXT, user_id TEXT, display_name TEXT, type TEXT, location TEXT, time INTEGER'
};

export async function initTables(ctx) {
    await ctx.db.exec(
        `CREATE TABLE IF NOT EXISTS ${kvTable(ctx)} (key TEXT PRIMARY KEY, value TEXT)`
    );
    for (const [key, cols] of Object.entries(POOL_TABLES)) {
        await ctx.db.exec(
            `CREATE TABLE IF NOT EXISTS ${poolTable(ctx, key)} (
                remote_id INTEGER UNIQUE, ${cols}, contributed_by TEXT)`
        );
        await ctx.db.exec(
            `CREATE INDEX IF NOT EXISTS ${poolTable(ctx, key)}_user_idx
             ON ${poolTable(ctx, key)} (user_id, created_at)`
        );
    }
}

export async function kvGet(ctx, key, fallback = null) {
    const rows = await ctx.db.query(
        `SELECT value FROM ${kvTable(ctx)} WHERE key = @key`,
        { '@key': key }
    );
    if (rows.length === 0 || rows[0][0] == null) return fallback;
    try {
        return JSON.parse(rows[0][0]);
    } catch {
        return fallback;
    }
}

export async function kvSet(ctx, key, value) {
    await ctx.db.exec(
        `INSERT OR REPLACE INTO ${kvTable(ctx)} (key, value) VALUES (@key, @value)`,
        { '@key': key, '@value': JSON.stringify(value) }
    );
}

export async function poolCounts(ctx) {
    const counts = {};
    for (const key of Object.keys(POOL_TABLES)) {
        const rows = await ctx.db.query(`SELECT COUNT(*) FROM ${poolTable(ctx, key)}`);
        counts[key] = rows[0]?.[0] ?? 0;
    }
    return counts;
}

export async function clearPool(ctx) {
    for (const key of Object.keys(POOL_TABLES)) {
        await ctx.db.exec(`DELETE FROM ${poolTable(ctx, key)}`);
    }
}
