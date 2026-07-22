// ============================================================================
// Profile Archiver — persistence.
// Manages profile history snapshots table and provides backfill from core feed.
// ============================================================================

function snapshotTable(ctx) {
    return `${ctx.db.prefix()}_snapshots`;
}

/**
 * Initialize the mod snapshot table and index.
 * @param {object} ctx ModContext
 */
export async function initTables(ctx) {
    await ctx.db.exec(
        `CREATE TABLE IF NOT EXISTS ${snapshotTable(ctx)} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            display_name TEXT,
            bio TEXT,
            status TEXT,
            created_at TEXT NOT NULL
        )`
    );
    await ctx.db.exec(
        `CREATE INDEX IF NOT EXISTS ${snapshotTable(ctx)}_user_created_idx
         ON ${snapshotTable(ctx)} (user_id, created_at)`
    );
}

/**
 * Insert a profile snapshot entry into the mod's snapshot table.
 * @param {object} ctx ModContext
 * @param {object} snapshot { id, user_id/userId, display_name/displayName, bio, status, created_at/createdAt }
 */
export async function insertSnapshot(ctx, snapshot) {
    const userId = snapshot.user_id || snapshot.userId || '';
    if (!userId) return;

    const displayName = snapshot.display_name ?? snapshot.displayName ?? '';
    const bio = snapshot.bio ?? '';
    const status = snapshot.status ?? '';
    const createdAt = snapshot.created_at || snapshot.createdAt || new Date().toISOString();

    await ctx.db.exec(
        `INSERT INTO ${snapshotTable(ctx)} (user_id, display_name, bio, status, created_at)
         VALUES (@user_id, @display_name, @bio, @status, @created_at)`,
        {
            '@user_id': userId,
            '@display_name': displayName,
            '@bio': bio,
            '@status': status,
            '@created_at': createdAt
        }
    );
}

/**
 * Query the snapshot table for a specific user, ordered by created_at DESC.
 * @param {object} ctx ModContext
 * @param {string} userId
 * @returns {Promise<Array>} list of snapshot objects
 */
export async function getUserHistory(ctx, userId) {
    if (!userId) return [];
    const rows = await ctx.db.query(
        `SELECT id, user_id, display_name, bio, status, created_at
         FROM ${snapshotTable(ctx)}
         WHERE user_id = @user_id
         ORDER BY created_at DESC`,
        { '@user_id': userId }
    );
    return rows.map((r) => ({
        id: r[0],
        user_id: r[1],
        userId: r[1],
        display_name: r[2] || '',
        displayName: r[2] || '',
        bio: r[3] || '',
        status: r[4] || '',
        created_at: r[5] || '',
        createdAt: r[5] || ''
    }));
}

/**
 * Query core VRCX feed tables (_feed_bio and _feed_status) for initial state or backfilling history.
 * @param {object} ctx ModContext
 * @param {string} [userId] optional user_id filter
 * @returns {Promise<Array>} formatted feed snapshot items
 */
export async function getFeedHistory(ctx, userId = null) {
    const core = ctx.db.corePrefix();
    const params = {};

    let bioSql = `SELECT id, created_at, user_id, display_name, bio, previous_bio FROM ${core}_feed_bio`;
    let statusSql = `SELECT id, created_at, user_id, display_name, status, status_description, previous_status, previous_status_description FROM ${core}_feed_status`;

    if (userId) {
        bioSql += ` WHERE user_id = @user_id`;
        statusSql += ` WHERE user_id = @user_id`;
        params['@user_id'] = userId;
    }

    bioSql += ` ORDER BY created_at DESC`;
    statusSql += ` ORDER BY created_at DESC`;

    const bioRows = await ctx.db.query(bioSql, params);
    const statusRows = await ctx.db.query(statusSql, params);

    const items = [];

    for (const r of bioRows) {
        items.push({
            id: `feed_bio_${r[0]}`,
            user_id: r[2],
            userId: r[2],
            display_name: r[3] || '',
            displayName: r[3] || '',
            bio: r[4] || '',
            previousBio: r[5] || '',
            status: '',
            type: 'bio',
            created_at: r[1] || '',
            createdAt: r[1] || ''
        });
    }

    for (const r of statusRows) {
        const stText = r[5] ? `${r[4]}: ${r[5]}` : (r[4] || '');
        const prevStText = r[7] ? `${r[6]}: ${r[7]}` : (r[6] || '');
        items.push({
            id: `feed_status_${r[0]}`,
            user_id: r[2],
            userId: r[2],
            display_name: r[3] || '',
            displayName: r[3] || '',
            bio: '',
            status: stText,
            previousStatus: prevStText,
            type: 'status',
            created_at: r[1] || '',
            createdAt: r[1] || ''
        });
    }

    return items;
}

/**
 * Backfill snapshots table from core feed tables (_feed_bio and _feed_status).
 * Avoids duplicate records by checking existing snapshots.
 * @param {object} ctx ModContext
 * @param {string} [userId] optional user_id filter
 */
export async function backfillFromFeed(ctx, userId = null) {
    const feedItems = await getFeedHistory(ctx, userId);
    if (!feedItems.length) return;

    const existing = await getUserHistory(ctx, userId || '');
    const existingSet = new Set(
        existing.map((s) => `${s.user_id}|${s.created_at}|${s.bio}|${s.status}`)
    );

    for (const item of feedItems) {
        const key = `${item.user_id}|${item.created_at}|${item.bio}|${item.status}`;
        if (!existingSet.has(key)) {
            await insertSnapshot(ctx, item);
            existingSet.add(key);
        }
    }
}

/**
 * Get combined timeline history from both snapshot DB and core feed tables.
 * Merges and deduplicates entries, returning sorted by created_at DESC.
 * @param {object} ctx ModContext
 * @param {string} userId
 * @returns {Promise<Array>} combined timeline items
 */
export async function getCombinedUserHistory(ctx, userId) {
    if (!userId) return [];

    const [snapshots, feedItems] = await Promise.all([
        getUserHistory(ctx, userId),
        getFeedHistory(ctx, userId)
    ]);

    const combined = [...snapshots];
    const existingKeys = new Set(
        snapshots.map((s) => `${s.created_at}_${s.bio}_${s.status}`)
    );

    for (const item of feedItems) {
        const key = `${item.created_at}_${item.bio}_${item.status}`;
        if (!existingKeys.has(key)) {
            combined.push(item);
            existingKeys.add(key);
        }
    }

    combined.sort((a, b) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime());
    return combined;
}
