// ============================================================================
// Global DB mod — sync engine.
// Upload: reads LOCAL core tables (read-only) incrementally, filters rows to
//         pool members client-side, POSTs small batches.
// Download: pulls server deltas per table into the pool mirror tables.
// ============================================================================

import { POOL_TABLES, kvGet, kvSet, poolTable } from './db';

export const DEFAULT_SERVER = 'https://arikazei.wom-gaming.eu/vrcx-pool';
const BATCH = 2000;
const THROTTLE_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ pure ---
/** Same acceptance rule as the server (client-side pre-filter). */
export function rowAllowed(tableKey, row, memberIds, memberNames) {
    if (row.user_id && memberIds.has(row.user_id)) return true;
    if (tableKey === 'join_leave' && !row.user_id && memberNames.has(row.display_name || '')) {
        return true;
    }
    return false;
}

/** Positional query result -> named object. */
export function toObjects(rows, cols) {
    return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

// ------------------------------------------------------------------- api ---
export async function apiFetch(settings, pathname, opts = {}) {
    const base = (settings.serverUrl || DEFAULT_SERVER).replace(/\/$/, '');
    const res = await fetch(`${base}/${pathname}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${settings.token || ''}`,
            'content-type': 'application/json',
            ...(opts.headers || {})
        }
    });
    let body = null;
    try {
        body = await res.json();
    } catch {}
    if (!res.ok) {
        throw new Error(`${pathname}: ${body?.error || res.status}`);
    }
    return body;
}

// ------------------------------------------------------- upload sources ----
// Column lists double as JSON keys sent to the server (server whitelist).
const UPLOAD = {
    status: {
        cols: ['created_at', 'user_id', 'status', 'status_description'],
        sql: (core) => `SELECT created_at,user_id,status,status_description
            FROM ${core}_feed_status WHERE created_at >= @c ORDER BY created_at LIMIT ${BATCH}`
    },
    bio: {
        cols: ['created_at', 'user_id', 'bio'],
        sql: (core) => `SELECT created_at,user_id,bio
            FROM ${core}_feed_bio WHERE created_at >= @c ORDER BY created_at LIMIT ${BATCH}`
    },
    online_offline: {
        cols: ['created_at', 'user_id', 'type', 'location', 'world_name', 'time'],
        sql: (core) => `SELECT created_at,user_id,type,location,world_name,time
            FROM ${core}_feed_online_offline WHERE created_at >= @c ORDER BY created_at LIMIT ${BATCH}`
    },
    gps: {
        cols: ['created_at', 'user_id', 'location', 'world_name', 'time'],
        sql: (core) => `SELECT created_at,user_id,location,world_name,time
            FROM ${core}_feed_gps WHERE created_at >= @c ORDER BY created_at LIMIT ${BATCH}`
    },
    join_leave: {
        cols: ['created_at', 'user_id', 'display_name', 'type', 'location', 'time'],
        sql: () => `SELECT created_at,user_id,display_name,type,location,time
            FROM gamelog_join_leave WHERE created_at >= @c ORDER BY created_at LIMIT ${BATCH}`
    }
};

async function fetchMembers(ctx, settings) {
    const data = await apiFetch(settings, 'v1/members');
    const ids = new Set(data.members.map((m) => m.user_id));
    const names = new Set(data.members.map((m) => m.display_name).filter(Boolean));
    return { ids, names, list: data.members };
}

// ---------------------------------------------------------------- upload ---
export async function uploadDeltas(ctx, settings, members, onProgress = () => {}) {
    const core = ctx.db.corePrefix();
    const shares = settings.shares || {};
    const result = { uploaded: 0, filtered: 0 };

    for (const [key, spec] of Object.entries(UPLOAD)) {
        if (shares[key] === false) continue;
        let cursor = await kvGet(ctx, `up_cursor_${key}`, '');
        for (;;) {
            const raw = await ctx.db.query(spec.sql(core), { '@c': cursor });
            if (raw.length === 0) break;
            const rows = toObjects(raw, spec.cols);
            const newest = rows[rows.length - 1].created_at;
            const allowed = rows.filter((r) => rowAllowed(key, r, members.ids, members.names));
            result.filtered += rows.length - allowed.length;
            if (allowed.length > 0) {
                const resp = await apiFetch(settings, 'v1/contribute', {
                    method: 'POST',
                    body: JSON.stringify({ table: key, rows: allowed })
                });
                result.uploaded += resp.accepted || 0;
            }
            onProgress(`Upload ${key}: bis ${newest}`);
            if (newest === cursor && raw.length < BATCH) break;
            cursor = newest;
            await kvSet(ctx, `up_cursor_${key}`, cursor);
            if (raw.length < BATCH) break;
            await sleep(THROTTLE_MS);
        }
    }
    return result;
}

// -------------------------------------------------------------- download ---
export async function downloadDeltas(ctx, settings, onProgress = () => {}) {
    const result = { downloaded: 0 };
    for (const key of Object.keys(POOL_TABLES)) {
        const table = poolTable(ctx, key);
        const cols = UPLOAD[key].cols;
        for (;;) {
            const cur = await ctx.db.query(`SELECT COALESCE(MAX(remote_id),0) FROM ${table}`);
            const cursor = cur[0][0];
            const data = await apiFetch(settings, `v1/sync?table=${key}&cursor=${cursor}`);
            for (const row of data.rows) {
                const colNames = ['remote_id', ...cols, 'contributed_by'];
                const args = {};
                args['@remote_id'] = row.id;
                for (const c of cols) args[`@${c}`] = row[c] ?? null;
                args['@contributed_by'] = row.contributed_by ?? null;
                await ctx.db.exec(
                    `INSERT OR IGNORE INTO ${table} (${colNames.join(',')})
                     VALUES (${colNames.map((c) => `@${c}`).join(',')})`,
                    args
                );
            }
            result.downloaded += data.rows.length;
            if (data.rows.length) onProgress(`Download ${key}: ${result.downloaded}`);
            if (data.done) break;
            await sleep(THROTTLE_MS);
        }
    }
    return result;
}

export async function fullSync(ctx, settings, onProgress = () => {}) {
    const members = await fetchMembers(ctx, settings);
    const up = await uploadDeltas(ctx, settings, members, onProgress);
    const down = await downloadDeltas(ctx, settings, onProgress);
    await kvSet(ctx, 'last_sync', new Date().toJSON());
    return { members: members.list, ...up, ...down };
}
