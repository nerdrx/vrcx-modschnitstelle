import { describe, expect, it } from 'vitest';

import {
    DAYS_PER_MONTH,
    daysBetween,
    inactivityCategory,
    matchLastSeen,
    pickLastActive,
    seenCategory
} from '../engine';

const M = DAYS_PER_MONTH;

describe('seenCategory', () => {
    it('categorizes all thresholds', () => {
        expect(seenCategory(null)).toBe('never');
        expect(seenCategory(0)).toBe('green');
        expect(seenCategory(1 * M - 0.01)).toBe('green');
        expect(seenCategory(1 * M)).toBe('neutral');
        expect(seenCategory(3 * M - 0.01)).toBe('neutral');
        expect(seenCategory(3 * M)).toBe('orange');
        expect(seenCategory(6 * M - 0.01)).toBe('orange');
        expect(seenCategory(6 * M)).toBe('red');
        expect(seenCategory(24 * M)).toBe('red');
    });

    it('red is not swallowed by orange (check order)', () => {
        // 8 months is >= 3 months AND >= 6 months — must be red
        expect(seenCategory(8 * M)).toBe('red');
    });
});

describe('inactivityCategory', () => {
    it('categorizes all thresholds', () => {
        expect(inactivityCategory(null)).toBe('nodata');
        expect(inactivityCategory(0)).toBe('active');
        expect(inactivityCategory(6 * M - 0.01)).toBe('active');
        expect(inactivityCategory(6 * M)).toBe('green');
        expect(inactivityCategory(9 * M)).toBe('orange');
        expect(inactivityCategory(12 * M)).toBe('red');
        expect(inactivityCategory(36 * M)).toBe('red');
    });
});

describe('daysBetween', () => {
    it('computes day distance and handles missing input', () => {
        const now = Date.parse('2026-07-22T00:00:00Z');
        expect(daysBetween(Date.parse('2026-07-21T00:00:00Z'), now)).toBeCloseTo(1);
        expect(daysBetween(null, now)).toBe(null);
        expect(daysBetween(NaN, now)).toBe(null);
    });

    it('clamps future timestamps to 0', () => {
        const now = Date.parse('2026-07-22T00:00:00Z');
        expect(daysBetween(Date.parse('2026-07-23T00:00:00Z'), now)).toBe(0);
    });
});

describe('matchLastSeen', () => {
    const friends = [
        { userId: 'usr_a', displayName: 'Alice' },
        { userId: 'usr_b', displayName: 'Bob' },
        { userId: 'usr_c', displayName: 'Carol' }
    ];

    it('matches by user_id first', () => {
        const rows = [
            { userId: 'usr_a', displayName: 'OldAliceName', lastDt: '2026-01-01T00:00:00.000Z', location: 'wrld_1' }
        ];
        const hits = matchLastSeen(friends, rows);
        expect(hits.get('usr_a')?.lastDt).toBe('2026-01-01T00:00:00.000Z');
        expect(hits.has('usr_b')).toBe(false);
    });

    it('falls back to display_name for legacy rows without user_id', () => {
        const rows = [{ userId: '', displayName: 'Bob', lastDt: '2025-05-05T00:00:00.000Z', location: 'wrld_2' }];
        const hits = matchLastSeen(friends, rows);
        expect(hits.get('usr_b')?.location).toBe('wrld_2');
    });

    it('keeps the newest timestamp when both id and name rows exist', () => {
        const rows = [
            { userId: 'usr_c', displayName: 'Carol', lastDt: '2026-02-01T00:00:00.000Z', location: 'wrld_new' },
            { userId: '', displayName: 'Carol', lastDt: '2024-01-01T00:00:00.000Z', location: 'wrld_old' }
        ];
        const hits = matchLastSeen(friends, rows);
        expect(hits.get('usr_c')?.location).toBe('wrld_new');
    });
});

describe('pickLastActive', () => {
    it('prefers the max of the API fields', () => {
        const r = pickLastActive({
            lastActivityIso: '2026-06-01T00:00:00.000Z',
            lastLoginIso: '2026-07-01T00:00:00.000Z',
            feedFallbackIso: '2026-07-20T00:00:00.000Z'
        });
        expect(r.source).toBe('api');
        expect(r.tsMs).toBe(Date.parse('2026-07-01T00:00:00.000Z'));
    });

    it('falls back to feed when API fields are empty', () => {
        const r = pickLastActive({
            lastActivityIso: '',
            lastLoginIso: undefined,
            feedFallbackIso: '2026-05-01T00:00:00.000Z'
        });
        expect(r.source).toBe('feed');
        expect(r.tsMs).toBe(Date.parse('2026-05-01T00:00:00.000Z'));
    });

    it('returns none when nothing is available', () => {
        const r = pickLastActive({});
        expect(r).toEqual({ tsMs: null, source: 'none' });
    });
});
