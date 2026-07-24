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
        sql: (core, batch = BATCH) => `SELECT created_at,user_id,status,status_description
            FROM ${core}_feed_status WHERE created_at >= @c ORDER BY created_at LIMIT ${batch}`
    },
    bio: {
        cols: ['created_at', 'user_id', 'bio'],
        sql: (core, batch = BATCH) => `SELECT created_at,user_id,bio
            FROM ${core}_feed_bio WHERE created_at >= @c ORDER BY created_at LIMIT ${batch}`
    },
    online_offline: {
        cols: ['created_at', 'user_id', 'type', 'location', 'world_name', 'time'],
        sql: (core, batch = BATCH) => `SELECT created_at,user_id,type,location,world_name,time
            FROM ${core}_feed_online_offline WHERE created_at >= @c ORDER BY created_at LIMIT ${batch}`
    },
    gps: {
        cols: ['created_at', 'user_id', 'location', 'world_name', 'time'],
        sql: (core, batch = BATCH) => `SELECT created_at,user_id,location,world_name,time
            FROM ${core}_feed_gps WHERE created_at >= @c ORDER BY created_at LIMIT ${batch}`
    },
    join_leave: {
        cols: ['created_at', 'user_id', 'display_name', 'type', 'location', 'time'],
        sql: (core, batch = BATCH) => `SELECT created_at,user_id,display_name,type,location,time
            FROM gamelog_join_leave WHERE created_at >= @c ORDER BY created_at LIMIT ${batch}`
    }
};

async function fetchMembers(ctx, settings) {
    const data = await apiFetch(settings, 'v1/members');
    const ids = new Set(data.members.map((m) => m.user_id));
    const names = new Set(data.members.map((m) => m.display_name).filter(Boolean));
    return { ids, names, list: data.members };
}

// ---------------------------------------------------- member-diff (P1.5) ---
/**
 * Compare the current member list with the previously known ids.
 * Pure function (unit-tested); returns which members are new.
 * first=true on the very first sync (nothing known yet) — no backfill then.
 */
export function diffMembers(known, list) {
    const ids = list.map((m) => m.user_id).sort();
    if (!Array.isArray(known)) return { fresh: [], ids, first: true };
    const knownSet = new Set(known);
    return {
        fresh: list.filter((m) => !knownSet.has(m.user_id)),
        ids,
        first: false
    };
}

/**
 * Upload-Cursors laufen über gefilterte (Nicht-Mitglieder-)Zeilen hinweg.
 * Tritt später ein Freund bei, muss die eigene Historie über ihn nachgeliefert
 * werden: alle up_cursor_* zurücksetzen => voller Re-Upload. Der Server
 * dedupliziert via INSERT OR IGNORE, der Vorgang ist idempotent.
 */
async function backfillOnNewMembers(ctx, members, onProgress) {
    const known = await kvGet(ctx, 'known_members', null);
    const diff = diffMembers(known, members.list);
    if (!diff.first && diff.fresh.length > 0) {
        for (const key of Object.keys(UPLOAD)) {
            await kvSet(ctx, `up_cursor_${key}`, '');
        }
        const names = diff.fresh.map((m) => m.display_name || m.user_id).join(', ');
        onProgress(`Neues Mitglied ${names} — Re-Backfill gestartet`);
    }
    await kvSet(ctx, 'known_members', diff.ids);
}

/**
 * Setzt alle Upload-Cursor zurück => nächster Sync lädt die komplette
 * Historie erneut hoch (Server dedupliziert, idempotent). Auch bei
 * Pool-Austritt nötig, damit ein Neubeitritt wirklich frisch startet.
 */
export async function resetUploadCursors(ctx) {
    for (const key of Object.keys(UPLOAD)) {
        await kvSet(ctx, `up_cursor_${key}`, '');
    }
    await kvSet(ctx, 'known_members', null);
}

// ---------------------------------------------------------------- upload ---
// opts: { batch, throttleMs, gate } — gate() is awaited before every batch
// (pause support for the initial full-bandwidth sync).
export async function uploadDeltas(ctx, settings, members, onProgress = () => {}, opts = {}) {
    const core = ctx.db.corePrefix();
    const batch = opts.batch || BATCH;
    const throttleMs = opts.throttleMs ?? THROTTLE_MS;
    const gate = opts.gate || (() => Promise.resolve());
    const result = { uploaded: 0, filtered: 0, errors: {} };

    for (const [key, spec] of Object.entries(UPLOAD)) {
        // Fehler bei einer Tabelle stoppen die übrigen nicht; der Cursor der
        // fehlgeschlagenen Tabelle bleibt stehen (Batch läuft beim nächsten
        // Sync erneut).
        try {
            let cursor = await kvGet(ctx, `up_cursor_${key}`, '');
            for (;;) {
                await gate();
                const raw = await ctx.db.query(spec.sql(core, batch), { '@c': cursor });
                if (raw.length === 0) break;
                const rows = toObjects(raw, spec.cols);
                const newest = rows[rows.length - 1].created_at;
                const allowed = rows.filter((r) => rowAllowed(key, r, members.ids, members.names));
                result.filtered += rows.length - allowed.length;
                // Diagnose: erste gefilterte Zeile je Tabelle einmalig loggen
                if (!result.filteredSample) result.filteredSample = {};
                if (allowed.length < rows.length && !result.filteredSample[key]) {
                    const sample = rows.find((r) => !rowAllowed(key, r, members.ids, members.names));
                    result.filteredSample[key] = JSON.stringify(sample).slice(0, 220);
                    ctx.log(`filter-sample ${key}:`, result.filteredSample[key]);
                }
                if (allowed.length > 0) {
                    const resp = await apiFetch(settings, 'v1/contribute', {
                        method: 'POST',
                        body: JSON.stringify({ table: key, rows: allowed })
                    });
                    result.uploaded += resp.accepted || 0;
                    if (resp.rowError) {
                        result.errors[key] = `Zeilenfehler: ${resp.rowError}`;
                    }
                    // Diagnose: Server hat Zeilen verworfen (rejected > client-gefiltert 0)
                    if ((resp.rejected || 0) > 0) {
                        ctx.log(`server-rejected ${key}: ${resp.rejected} von ${allowed.length}${resp.rowError ? ' — ' + resp.rowError : ''}`);
                    }
                }
                onProgress(`Upload ${key}: bis ${newest}`, result);
                if (newest === cursor && raw.length < batch) break;
                cursor = newest;
                await kvSet(ctx, `up_cursor_${key}`, cursor);
                if (raw.length < batch) break;
                if (throttleMs > 0) await sleep(throttleMs);
            }
        } catch (err) {
            result.errors[key] = String(err.message || err);
            onProgress(`Upload ${key} fehlgeschlagen: ${result.errors[key]} — weiter mit nächster Tabelle`, result);
        }
    }
    return result;
}

// -------------------------------------------------------------- download ---
export async function downloadDeltas(ctx, settings, onProgress = () => {}, opts = {}) {
    const batch = opts.batch || BATCH;
    const throttleMs = opts.throttleMs ?? THROTTLE_MS;
    const gate = opts.gate || (() => Promise.resolve());
    const result = { downloaded: 0, errors: {} };
    for (const key of Object.keys(POOL_TABLES)) {
        const table = poolTable(ctx, key);
        const cols = UPLOAD[key].cols;
        try {
        for (;;) {
            await gate();
            const cur = await ctx.db.query(`SELECT COALESCE(MAX(remote_id),0) FROM ${table}`);
            const cursor = cur[0][0];
            const data = await apiFetch(settings, `v1/sync?table=${key}&cursor=${cursor}&limit=${batch}`);
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
            if (data.rows.length) onProgress(`Download ${key}: ${result.downloaded}`, result);
            if (data.done) break;
            if (throttleMs > 0) await sleep(throttleMs);
        }
        } catch (err) {
            result.errors[key] = String(err.message || err);
            onProgress(`Download ${key} fehlgeschlagen: ${result.errors[key]} — weiter mit nächster Tabelle`, result);
        }
    }
    return result;
}

// opts: { batch, throttleMs, gate } — see uploadDeltas. Initial sync after
// join runs with { batch: 5000, throttleMs: 0 }, the periodic delta sync
// keeps the throttled defaults.
export async function fullSync(ctx, settings, onProgress = () => {}, opts = {}) {
    const members = await fetchMembers(ctx, settings);
    await backfillOnNewMembers(ctx, members, onProgress);
    const up = await uploadDeltas(ctx, settings, members, onProgress, opts);
    const down = await downloadDeltas(ctx, settings, onProgress, opts);
    await kvSet(ctx, 'last_sync', new Date().toJSON());
    const errors = { ...up.errors, ...down.errors };
    const ok = Object.keys(errors).length === 0;
    if (ok) {
        // Chat-Freischaltung hängt am ersten VOLLSTÄNDIG erfolgreichen Sync.
        await kvSet(ctx, 'first_sync_done', true);
    }
    return { members: members.list, ...up, ...down, errors, ok };
}
