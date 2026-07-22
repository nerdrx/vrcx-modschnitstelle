import { describe, expect, it } from 'vitest';

import {
    calculateDailyTrends,
    calculateHourlyDistribution,
    calculateLocationStats,
    computePlaytimeMetrics,
    extractWorldId,
    formatDuration,
    groupEventsIntoSessions
} from '../engine';

describe('formatDuration', () => {
    it('formats 0 or invalid inputs as 0m', () => {
        expect(formatDuration(0)).toBe('0m');
        expect(formatDuration(-100)).toBe('0m');
        expect(formatDuration(null)).toBe('0m');
        expect(formatDuration(NaN)).toBe('0m');
    });

    it('formats minutes, hours, and days correctly', () => {
        expect(formatDuration(45 * 60000)).toBe('45m');
        expect(formatDuration(150 * 60000)).toBe('2h 30m');
        expect(formatDuration((24 * 60 + 15) * 60000)).toBe('1d 0h 15m');
        expect(formatDuration((24 * 60 + 15) * 60000, true)).toBe('1d 0h');
    });
});

describe('extractWorldId', () => {
    it('extracts world id from location tag', () => {
        expect(extractWorldId('wrld_12345:6789~group(usr_abc)')).toBe('wrld_12345');
        expect(extractWorldId('wrld_999')).toBe('wrld_999');
        expect(extractWorldId('')).toBe('');
    });
});

describe('groupEventsIntoSessions', () => {
    it('pairs online and offline events chronologically', () => {
        const events = [
            { createdAt: '2026-07-22T10:00:00.000Z', type: 'Online' },
            { createdAt: '2026-07-22T12:00:00.000Z', type: 'Offline' },
            { createdAt: '2026-07-22T14:00:00.000Z', type: 'Online' },
            { createdAt: '2026-07-22T15:30:00.000Z', type: 'Offline' }
        ];

        const sessions = groupEventsIntoSessions(events);
        expect(sessions.length).toBe(2);
        expect(sessions[0].durationMs).toBe(2 * 3600000);
        expect(sessions[1].durationMs).toBe(1.5 * 3600000);
        expect(sessions[0].isOngoing).toBe(false);
    });

    it('handles ongoing session', () => {
        const nowMs = new Date('2026-07-22T16:00:00.000Z').getTime();
        const events = [
            { createdAt: '2026-07-22T15:00:00.000Z', type: 'Online' }
        ];

        const sessions = groupEventsIntoSessions(events, nowMs);
        expect(sessions.length).toBe(1);
        expect(sessions[0].durationMs).toBe(3600000);
        expect(sessions[0].isOngoing).toBe(true);
    });
});

describe('calculateDailyTrends', () => {
    it('aggregates session playtime into daily buckets', () => {
        const nowMs = new Date('2026-07-22T18:00:00.000Z').getTime();
        const sessions = [
            {
                startMs: new Date('2026-07-22T10:00:00.000Z').getTime(),
                endMs: new Date('2026-07-22T12:00:00.000Z').getTime(),
                durationMs: 2 * 3600000
            }
        ];

        const trends = calculateDailyTrends(sessions, 7, nowMs);
        expect(trends.length).toBe(7);
        const todayTrend = trends.find((t) => t.date === '2026-07-22');
        expect(todayTrend?.playtimeMs).toBe(2 * 3600000);
    });
});

describe('calculateHourlyDistribution', () => {
    it('populates 24 hour slots', () => {
        const sessions = [
            {
                startMs: new Date('2026-07-22T10:15:00.000Z').getTime(),
                endMs: new Date('2026-07-22T11:45:00.000Z').getTime(),
                durationMs: 90 * 60000
            }
        ];

        const hourly = calculateHourlyDistribution(sessions);
        expect(hourly.length).toBe(24);
    });
});

describe('calculateLocationStats', () => {
    it('aggregates world visits and names', () => {
        const gpsLogs = [
            { createdAt: '2026-07-22T10:00:00.000Z', location: 'wrld_alpha:123' },
            { createdAt: '2026-07-22T11:00:00.000Z', location: 'wrld_beta:456' }
        ];
        const sessions = [
            {
                startMs: new Date('2026-07-22T10:00:00.000Z').getTime(),
                endMs: new Date('2026-07-22T12:00:00.000Z').getTime()
            }
        ];
        const worldNames = new Map([
            ['wrld_alpha', 'The Black Cat'],
            ['wrld_beta', 'Pug']
        ]);

        const stats = calculateLocationStats(gpsLogs, sessions, worldNames);
        expect(stats.length).toBe(2);
        expect(stats[0].worldName).toBeDefined();
    });
});

describe('computePlaytimeMetrics', () => {
    it('returns high level summary metrics', () => {
        const nowMs = new Date('2026-07-22T18:00:00.000Z').getTime();
        const logs = [
            { createdAt: '2026-07-22T10:00:00.000Z', type: 'Online' },
            { createdAt: '2026-07-22T12:00:00.000Z', type: 'Offline' }
        ];

        const metrics = computePlaytimeMetrics({
            onlineOfflineLogs: logs,
            gpsLogs: [],
            rangeDays: 30,
            nowMs
        });

        expect(metrics.totalPlaytimeMs).toBe(2 * 3600000);
        expect(metrics.sessionCount).toBe(1);
        expect(metrics.formattedTotalPlaytime).toBe('2h 0m');
    });
});
