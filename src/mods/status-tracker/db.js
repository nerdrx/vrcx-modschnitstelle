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
