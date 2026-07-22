// ============================================================================
// World Hopper — Database Persistence Layer
// ============================================================================

function playlistTable(ctx) {
    return `${ctx.db.prefix()}_playlist`;
}

/**
 * Initialize playlist table in SQLite.
 * @param {object} ctx ModContext
 */
export async function initTables(ctx) {
    if (!ctx || !ctx.db) return;
    const table = playlistTable(ctx);
    await ctx.db.exec(
        `CREATE TABLE IF NOT EXISTS ${table} (
            id TEXT PRIMARY KEY,
            location TEXT NOT NULL,
            world_id TEXT NOT NULL,
            name TEXT,
            note TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            order_index INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )`
    );
    await ctx.db.exec(
        `CREATE INDEX IF NOT EXISTS ${table}_order_idx ON ${table} (order_index)`
    );
}

/**
 * Get all playlist items ordered by order_index ASC.
 * @param {object} ctx ModContext
 * @returns {Promise<Array>}
 */
export async function getPlaylist(ctx) {
    if (!ctx || !ctx.db) return [];
    const table = playlistTable(ctx);
    const rows = await ctx.db.query(
        `SELECT id, location, world_id, name, note, status, order_index, created_at
         FROM ${table}
         ORDER BY order_index ASC, created_at ASC`
    );

    return rows.map((r) => ({
        id: r[0],
        location: r[1] || '',
        worldId: r[2] || '',
        name: r[3] || '',
        note: r[4] || '',
        status: r[5] || 'pending',
        orderIndex: Number(r[6]) || 0,
        createdAt: r[7] || ''
    }));
}

/**
 * Save or update a playlist item.
 * @param {object} ctx ModContext
 * @param {object} item
 */
export async function savePlaylistItem(ctx, item) {
    if (!ctx || !ctx.db || !item || !item.id) return;
    const table = playlistTable(ctx);
    await ctx.db.exec(
        `INSERT OR REPLACE INTO ${table} (id, location, world_id, name, note, status, order_index, created_at)
         VALUES (@id, @location, @world_id, @name, @note, @status, @order_index, @created_at)`,
        {
            '@id': item.id,
            '@location': item.location || '',
            '@world_id': item.worldId || item.location || '',
            '@name': item.name || '',
            '@note': item.note || '',
            '@status': item.status || 'pending',
            '@order_index': item.orderIndex || 0,
            '@created_at': item.createdAt || new Date().toISOString()
        }
    );
}

/**
 * Delete a single playlist item by ID.
 * @param {object} ctx ModContext
 * @param {string} itemId
 */
export async function deletePlaylistItem(ctx, itemId) {
    if (!ctx || !ctx.db || !itemId) return;
    const table = playlistTable(ctx);
    await ctx.db.exec(
        `DELETE FROM ${table} WHERE id = @id`,
        { '@id': itemId }
    );
}

/**
 * Update order index for multiple playlist items in bulk.
 * @param {object} ctx ModContext
 * @param {Array} items
 */
export async function updatePlaylistOrder(ctx, items) {
    if (!ctx || !ctx.db || !Array.isArray(items)) return;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.id) {
            await savePlaylistItem(ctx, { ...item, orderIndex: i });
        }
    }
}

/**
 * Clear items from playlist table.
 * @param {object} ctx ModContext
 * @param {string} [mode] 'all' | 'visited'
 */
export async function clearPlaylist(ctx, mode = 'all') {
    if (!ctx || !ctx.db) return;
    const table = playlistTable(ctx);
    if (mode === 'visited') {
        await ctx.db.exec(`DELETE FROM ${table} WHERE status = 'visited'`);
    } else {
        await ctx.db.exec(`DELETE FROM ${table}`);
    }
}
