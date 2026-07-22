// ============================================================================
// Playtime Dashboard — pure calculation engine (no VRCX imports, unit-testable).
// ============================================================================

export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;

/**
 * Format milliseconds into human-readable text.
 * @param {number} ms Milliseconds
 * @param {boolean} [short=false] Short format (e.g. "2d 4h")
 * @returns {string}
 */
export function formatDuration(ms, short = false) {
    if (!ms || !Number.isFinite(ms) || ms <= 0) {
        return '0m';
    }
    const totalMins = Math.floor(ms / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;

    if (days > 0) {
        if (short) {
            return `${days}d ${remHours}h`;
        }
        return `${days}d ${remHours}h ${mins}m`;
    }
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

/**
 * Extract world ID from full location string (e.g. 'wrld_xxx:12345~...' -> 'wrld_xxx').
 * @param {string} location
 * @returns {string}
 */
export function extractWorldId(location) {
    if (!location) return '';
    return location.split(':')[0];
}

/**
 * Process online/offline feed events into play sessions.
 *
 * @param {Array<{createdAt: string, type: string}>} events
 * @param {number} [nowMs=Date.now()] Current timestamp for ongoing sessions
 * @returns {Array<{startMs: number, endMs: number, durationMs: number, isOngoing: boolean}>}
 */
export function groupEventsIntoSessions(events, nowMs = Date.now()) {
    if (!Array.isArray(events) || events.length === 0) {
        return [];
    }

    // Sort chronologically (oldest first)
    const sorted = [...events]
        .map((e) => ({
            tsMs: new Date(e.createdAt).getTime(),
            type: e.type
        }))
        .filter((e) => Number.isFinite(e.tsMs) && e.tsMs > 0)
        .sort((a, b) => a.tsMs - b.tsMs);

    const sessions = [];
    let currentStartMs = null;

    for (const e of sorted) {
        if (e.type === 'Online') {
            if (currentStartMs !== null) {
                // Previous session was open without Offline event; close it at this new Online event
                if (e.tsMs > currentStartMs) {
                    sessions.push({
                        startMs: currentStartMs,
                        endMs: e.tsMs,
                        durationMs: e.tsMs - currentStartMs,
                        isOngoing: false
                    });
                }
            }
            currentStartMs = e.tsMs;
        } else if (e.type === 'Offline') {
            if (currentStartMs !== null) {
                if (e.tsMs > currentStartMs) {
                    sessions.push({
                        startMs: currentStartMs,
                        endMs: e.tsMs,
                        durationMs: e.tsMs - currentStartMs,
                        isOngoing: false
                    });
                }
                currentStartMs = null;
            }
        }
    }

    // Open tail: player currently online
    if (currentStartMs !== null && nowMs > currentStartMs) {
        sessions.push({
            startMs: currentStartMs,
            endMs: nowMs,
            durationMs: nowMs - currentStartMs,
            isOngoing: true
        });
    }

    return sessions;
}

/**
 * Calculate playtime distribution across daily buckets.
 *
 * @param {Array<{startMs: number, endMs: number}>} sessions
 * @param {number} rangeDays Number of past days to include (0 for all-time)
 * @param {number} [nowMs=Date.now()]
 * @returns {Array<{date: string, dateLabel: string, playtimeMs: number, formattedTime: string}>}
 */
export function calculateDailyTrends(sessions, rangeDays, nowMs = Date.now()) {
    const dayCount = rangeDays > 0 ? rangeDays : 30;
    const daysMap = new Map(); // YYYY-MM-DD -> totalMs

    const todayDate = new Date(nowMs);
    todayDate.setHours(0, 0, 0, 0);

    // Key by LOCAL date (toISOString is UTC and shifts the day in non-UTC timezones)
    const localKey = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    for (let i = dayCount - 1; i >= 0; i--) {
        const d = new Date(todayDate.getTime() - i * DAY_MS);
        daysMap.set(localKey(d), 0);
    }

    for (const s of sessions) {
        for (const [isoKey] of daysMap) {
            const dayStartMs = new Date(`${isoKey}T00:00:00`).getTime();
            const dayEndMs = dayStartMs + DAY_MS;

            const overlapStart = Math.max(s.startMs, dayStartMs);
            const overlapEnd = Math.min(s.endMs, dayEndMs);

            if (overlapEnd > overlapStart) {
                const current = daysMap.get(isoKey) || 0;
                daysMap.set(isoKey, current + (overlapEnd - overlapStart));
            }
        }
    }

    const result = [];
    for (const [date, playtimeMs] of daysMap.entries()) {
        const d = new Date(`${date}T00:00:00`);
        const dateLabel = d.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' });
        result.push({
            date,
            dateLabel,
            playtimeMs,
            formattedTime: formatDuration(playtimeMs)
        });
    }

    return result;
}

/**
 * Calculate playtime distribution across 24 hours of the day (0..23).
 *
 * @param {Array<{startMs: number, endMs: number}>} sessions
 * @returns {Array<{hour: number, hourLabel: string, playtimeMs: number, formattedTime: string, percent: number}>}
 */
export function calculateHourlyDistribution(sessions) {
    const hours = new Array(24).fill(0);

    for (const s of sessions) {
        let cursor = s.startMs;
        while (cursor < s.endMs) {
            const date = new Date(cursor);
            const hour = date.getHours();
            const nextHour = new Date(date);
            nextHour.setMinutes(0, 0, 0);
            nextHour.setHours(hour + 1);

            const nextHourMs = nextHour.getTime();
            const spanEnd = Math.min(s.endMs, nextHourMs);

            if (spanEnd > cursor) {
                hours[hour] += spanEnd - cursor;
                cursor = spanEnd;
            } else {
                break;
            }
        }
    }

    const maxMs = Math.max(...hours, 1);

    return hours.map((ms, h) => {
        const hourLabel = `${String(h).padStart(2, '0')}:00`;
        return {
            hour: h,
            hourLabel,
            playtimeMs: ms,
            formattedTime: formatDuration(ms),
            percent: Math.min(100, Math.round((ms / maxMs) * 100))
        };
    });
}

/**
 * Calculate location visit statistics & estimated playtime per world.
 *
 * @param {Array<{createdAt: string, location: string}>} gpsEvents
 * @param {Array<{startMs: number, endMs: number}>} sessions
 * @param {Map<string, string>} worldNames Map of worldId -> worldName
 * @returns {Array<{location: string, worldId: string, worldName: string, visitCount: number, estimatedMs: number, formattedTime: string}>}
 */
export function calculateLocationStats(gpsEvents, sessions, worldNames = new Map()) {
    if (!Array.isArray(gpsEvents) || gpsEvents.length === 0) {
        return [];
    }

    const sortedGps = [...gpsEvents]
        .map((e) => ({
            tsMs: new Date(e.createdAt).getTime(),
            location: e.location,
            worldId: extractWorldId(e.location)
        }))
        .filter((e) => Number.isFinite(e.tsMs) && e.tsMs > 0 && e.location)
        .sort((a, b) => a.tsMs - b.tsMs);

    const statsMap = new Map(); // worldId -> { location, visitCount, estimatedMs }

    for (let i = 0; i < sortedGps.length; i++) {
        const cur = sortedGps[i];
        const nextGps = sortedGps[i + 1];

        // Find which session this GPS event belongs to
        const session = sessions.find((s) => cur.tsMs >= s.startMs && cur.tsMs <= s.endMs);
        const spanEnd = nextGps ? Math.min(nextGps.tsMs, session ? session.endMs : cur.tsMs + HOUR_MS) : (session ? session.endMs : cur.tsMs + HOUR_MS);
        const duration = Math.max(0, spanEnd - cur.tsMs);

        const wId = cur.worldId || cur.location;
        const existing = statsMap.get(wId) || {
            location: cur.location,
            worldId: wId,
            visitCount: 0,
            estimatedMs: 0
        };

        existing.visitCount += 1;
        existing.estimatedMs += duration;
        statsMap.set(wId, existing);
    }

    const result = Array.from(statsMap.values()).map((item) => {
        const name = worldNames.get(item.worldId) || item.worldId;
        return {
            ...item,
            worldName: name,
            formattedTime: formatDuration(item.estimatedMs)
        };
    });

    // Sort by estimated playtime descending
    result.sort((a, b) => b.estimatedMs - a.estimatedMs || b.visitCount - a.visitCount);
    return result;
}

/**
 * Compute overall metrics summary for Playtime Dashboard.
 *
 * @param {object} params
 * @param {Array} params.onlineOfflineLogs Raw online/offline log rows
 * @param {Array} params.gpsLogs Raw GPS log rows
 * @param {Map<string, string>} [params.worldNames] World names map
 * @param {number} [params.rangeDays=30] 7, 30, 90, 365, 0 (all)
 * @param {number} [params.nowMs=Date.now()]
 */
export function computePlaytimeMetrics({
    onlineOfflineLogs = [],
    gpsLogs = [],
    worldNames = new Map(),
    rangeDays = 30,
    nowMs = Date.now()
}) {
    const allSessions = groupEventsIntoSessions(onlineOfflineLogs, nowMs);

    const rangeStartMs = rangeDays > 0 ? nowMs - rangeDays * DAY_MS : 0;
    const filteredSessions = rangeDays > 0
        ? allSessions.filter((s) => s.endMs >= rangeStartMs)
        : allSessions;

    let totalPlaytimeMs = 0;
    let longestSession = null;

    for (const s of filteredSessions) {
        // Clamp session overlap to rangeStartMs if needed
        const effectiveStart = Math.max(s.startMs, rangeStartMs);
        const effectiveDuration = Math.max(0, s.endMs - effectiveStart);
        totalPlaytimeMs += effectiveDuration;

        if (!longestSession || effectiveDuration > longestSession.durationMs) {
            longestSession = {
                ...s,
                durationMs: effectiveDuration
            };
        }
    }

    const sessionCount = filteredSessions.length;
    const avgSessionMs = sessionCount > 0 ? Math.round(totalPlaytimeMs / sessionCount) : 0;

    // Calculate today's playtime
    const todayStartMs = new Date(nowMs).setHours(0, 0, 0, 0);
    let todayPlaytimeMs = 0;
    for (const s of allSessions) {
        const overlapStart = Math.max(s.startMs, todayStartMs);
        const overlapEnd = Math.min(s.endMs, nowMs);
        if (overlapEnd > overlapStart) {
            todayPlaytimeMs += overlapEnd - overlapStart;
        }
    }

    const dailyTrends = calculateDailyTrends(filteredSessions, rangeDays, nowMs);
    const hourlyDistribution = calculateHourlyDistribution(filteredSessions);
    const topLocations = calculateLocationStats(gpsLogs, filteredSessions, worldNames);

    return {
        totalPlaytimeMs,
        sessionCount,
        avgSessionMs,
        todayPlaytimeMs,
        longestSessionMs: longestSession ? longestSession.durationMs : 0,
        formattedTotalPlaytime: formatDuration(totalPlaytimeMs),
        formattedAvgSession: formatDuration(avgSessionMs),
        formattedTodayPlaytime: formatDuration(todayPlaytimeMs),
        formattedLongestSession: formatDuration(longestSession ? longestSession.durationMs : 0),
        dailyTrends,
        hourlyDistribution,
        topLocations,
        sessions: filteredSessions.sort((a, b) => b.startMs - a.startMs)
    };
}
