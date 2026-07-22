// ============================================================================
// Status tracker — persistence. Reads VRCX core feed tables (read-only) and
// owns one snapshot table under the mod's own prefix.
// ============================================================================

function snapshotTable(ctx) {
    return `${ctx.db.prefix()}_snapshots`;
}

export async function initTables(ctx) {
    await ctx.db.exec(
        `CREATE TABLE IF NOT EXISTS ${snapshotTable(ctx)} (
            id INTEGER PRIMARY KEY,
            created_at TEXT,
            user_id TEXT,
            status TEXT,
            kind TEXT
        )`
    );
    await ctx.db.exec(
        `CREATE INDEX IF NOT EXISTS ${snapshotTable(ctx)}_user_created_idx
         ON ${snapshotTable(ctx)} (user_id, created_at)`
    );
}

export async function insertSnapshot(ctx, { createdAt, userId, status, kind }) {
    await ctx.db.exec(
        `INSERT INTO ${snapshotTable(ctx)} (created_at, user_id, status, kind)
         VALUES (@created_at, @user_id, @status, @kind)`,
        {
            '@created_at': createdAt,
            '@user_id': userId,
            '@status': status,
            '@kind': kind
        }
    );
}

// ---------------------------------------------------------------------------
// "Last known instance" — dismissed entries (persisted so an instance that
// was confirmed empty stays gone after a reload).
// ---------------------------------------------------------------------------

function dismissedTable(ctx) {
    return `${ctx.db.prefix()}_dismissed_instances`;
}

export async function initDismissedTable(ctx) {
    await ctx.db.exec(
        `CREATE TABLE IF NOT EXISTS ${dismissedTable(ctx)} (
            user_id TEXT,
            location TEXT,
            created_at TEXT,
            PRIMARY KEY (user_id, location)
        )`
    );
}

/** @returns {Promise<Set<string>>} set of "userId|location" pairs */
export async function loadDismissed(ctx) {
    const rows = await ctx.db.query(
        `SELECT user_id, location FROM ${dismissedTable(ctx)}`
    );
    return new Set(rows.map((r) => `${r[0]}|${r[1]}`));
}

export async function dismissInstance(ctx, userId, location) {
    await ctx.db.exec(
        `INSERT OR REPLACE INTO ${dismissedTable(ctx)} (user_id, location, created_at)
         VALUES (@user_id, @location, @created_at)`,
        {
            '@user_id': userId,
            '@location': location,
            '@created_at': new Date().toJSON()
        }
    );
}

/**
 * Newest real instance (wrld_…) per friend from the GPS feed.
 * @returns {Promise<Array<{userId, displayName, location, worldName, lastDt}>>}
 */
export async function loadLastGpsPerFriend(ctx) {
    const rows = await ctx.db.query(
        `SELECT user_id, display_name, location, world_name, MAX(created_at)
         FROM ${ctx.db.corePrefix()}_feed_gps
         WHERE location LIKE 'wrld_%'
         GROUP BY user_id`
    );
    return rows.map((r) => ({
        userId: r[0],
        displayName: r[1] || '',
        location: r[2],
        worldName: r[3] || '',
        lastDt: r[4]
    }));
}

const toMs = (iso) => new Date(iso).getTime();

/**
 * Load all events needed by the engine since a given ISO date.
 * Also returns a userId -> displayName map harvested from the feed rows.
 */
export async function loadEvents(ctx, sinceIso) {
    const core = ctx.db.corePrefix();
    const args = { '@since': sinceIso };
    const names = new Map();

    const statusRows = await ctx.db.query(
        `SELECT created_at, user_id, display_name, status, previous_status
         FROM ${core}_feed_status
         WHERE created_at >= @since
         ORDER BY created_at`,
        args
    );
    const statusEvents = statusRows.map((r) => {
        if (r[2]) names.set(r[1], r[2]);
        return {
            tsMs: toMs(r[0]),
            userId: r[1],
            status: r[3],
            previousStatus: r[4]
        };
    });

    const presenceRows = await ctx.db.query(
        `SELECT created_at, user_id, display_name, type
         FROM ${core}_feed_online_offline
         WHERE created_at >= @since
         ORDER BY created_at`,
        args
    );
    const presenceEvents = presenceRows.map((r) => {
        if (r[2]) names.set(r[1], r[2]);
        return { tsMs: toMs(r[0]), userId: r[1], type: r[3] };
    });

    const snapshotRows = await ctx.db.query(
        `SELECT created_at, user_id, status
         FROM ${snapshotTable(ctx)}
         WHERE created_at >= @since
         ORDER BY created_at`,
        args
    );
    const snapshots = snapshotRows.map((r) => ({
        tsMs: toMs(r[0]),
        userId: r[1],
        status: r[2]
    }));

    return { statusEvents, presenceEvents, snapshots, names };
}
