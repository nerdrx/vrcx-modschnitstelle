// ============================================================================
// Status tracker engine — pure functions, no VRCX imports, fully unit-testable.
//
// Computes, per friend, how long they were online in each VRChat status:
//   'join me' (blue), 'active' (green), 'ask me' (orange), 'busy' (red).
//
// Inputs are plain event lists:
//   statusEvents:   { tsMs, userId, status, previousStatus }  (feed_status)
//   presenceEvents: { tsMs, userId, type: 'Online'|'Offline' } (feed_online_offline)
//   snapshots:      { tsMs, userId, status }                   (mod table, exact
//                   status known at online/offline time — removes ambiguity)
//
// Rules:
//   - Time only accumulates while a friend is Online (in-game).
//   - The status during a span is the last known status; if none is known yet,
//     the span is retroactively assigned to the NEXT status event's
//     previousStatus (VRChat statuses persist across sessions), else 'unknown'.
//   - Events outside [rangeStartMs, rangeEndMs] still drive state, but time is
//     only accumulated inside the range (clamped).
// ============================================================================

export const TRACKED_STATUSES = ['join me', 'active', 'ask me', 'busy'];
export const UNKNOWN_STATUS = 'unknown';

function emptyTotals() {
    const totals = { totalOnlineMs: 0 };
    for (const s of TRACKED_STATUSES) {
        totals[s] = 0;
    }
    totals[UNKNOWN_STATUS] = 0;
    return totals;
}

function normalizeStatus(status) {
    if (!status || status === 'offline') {
        return null;
    }
    return TRACKED_STATUSES.includes(status) ? status : null;
}

/**
 * Merge all per-user events into one sorted timeline.
 */
function buildUserTimeline(statusEvents, presenceEvents, snapshots) {
    const byUser = new Map();
    const push = (userId, event) => {
        let list = byUser.get(userId);
        if (!list) {
            list = [];
            byUser.set(userId, list);
        }
        list.push(event);
    };

    for (const e of presenceEvents) {
        push(e.userId, { tsMs: e.tsMs, kind: e.type === 'Online' ? 'online' : 'offline' });
    }
    for (const e of statusEvents) {
        push(e.userId, {
            tsMs: e.tsMs,
            kind: 'status',
            status: normalizeStatus(e.status),
            previousStatus: normalizeStatus(e.previousStatus)
        });
    }
    for (const e of snapshots) {
        push(e.userId, { tsMs: e.tsMs, kind: 'snapshot', status: normalizeStatus(e.status) });
    }

    const kindOrder = { offline: 0, online: 1, snapshot: 2, status: 3 };
    for (const list of byUser.values()) {
        list.sort((a, b) => a.tsMs - b.tsMs || kindOrder[a.kind] - kindOrder[b.kind]);
    }
    return byUser;
}

/**
 * Compute per-user status totals.
 * @returns {Map<string, {totalOnlineMs:number, 'join me':number, active:number, 'ask me':number, busy:number, unknown:number}>}
 */
export function computeStatusTotals({
    statusEvents = [],
    presenceEvents = [],
    snapshots = [],
    rangeStartMs,
    rangeEndMs
}) {
    const byUser = buildUserTimeline(statusEvents, presenceEvents, snapshots);
    const result = new Map();

    for (const [userId, events] of byUser) {
        const totals = emptyTotals();
        // Spans accumulated while status was unknown, waiting for backfill.
        let pendingUnknownMs = 0;

        let online = false;
        let status = null;
        let cursorMs = null; // start of the current open span (only while online)

        const closeSpan = (untilMs) => {
            if (!online || cursorMs === null) {
                return;
            }
            const from = Math.max(cursorMs, rangeStartMs);
            const to = Math.min(untilMs, rangeEndMs);
            if (to > from) {
                const ms = to - from;
                totals.totalOnlineMs += ms;
                if (status) {
                    totals[status] += ms;
                } else {
                    pendingUnknownMs += ms;
                }
            }
            cursorMs = untilMs;
        };

        for (const event of events) {
            closeSpan(event.tsMs);
            switch (event.kind) {
                case 'online':
                    online = true;
                    cursorMs = event.tsMs;
                    break;
                case 'offline':
                    online = false;
                    cursorMs = null;
                    // spans with unknown status stay unknown across sessions
                    totals[UNKNOWN_STATUS] += pendingUnknownMs;
                    pendingUnknownMs = 0;
                    break;
                case 'snapshot':
                    if (event.status) {
                        status = event.status;
                        // a snapshot states the CURRENT status; it cannot
                        // backfill earlier unknown spans
                        totals[UNKNOWN_STATUS] += pendingUnknownMs;
                        pendingUnknownMs = 0;
                    }
                    break;
                case 'status':
                    // Backfill: whatever accumulated as unknown before this
                    // change was spent in previousStatus.
                    if (pendingUnknownMs > 0) {
                        if (event.previousStatus) {
                            totals[event.previousStatus] += pendingUnknownMs;
                        } else {
                            totals[UNKNOWN_STATUS] += pendingUnknownMs;
                        }
                        pendingUnknownMs = 0;
                    }
                    if (event.status) {
                        status = event.status;
                    }
                    break;
            }
        }

        // Open tail: still online at range end.
        closeSpan(rangeEndMs);
        totals[UNKNOWN_STATUS] += pendingUnknownMs;

        if (totals.totalOnlineMs > 0) {
            result.set(userId, totals);
        }
    }

    return result;
}
