import { describe, expect, it } from 'vitest';

import { computeStatusTotals } from '../engine';

const T0 = 1_000_000_000_000; // arbitrary epoch base
const MIN = 60_000;
const at = (min) => T0 + min * MIN;

const range = { rangeStartMs: T0, rangeEndMs: at(600) };

describe('computeStatusTotals', () => {
    it('accumulates time per status between events', () => {
        const totals = computeStatusTotals({
            presenceEvents: [
                { tsMs: at(0), userId: 'u1', type: 'Online' },
                { tsMs: at(100), userId: 'u1', type: 'Offline' }
            ],
            snapshots: [{ tsMs: at(0), userId: 'u1', status: 'active' }],
            statusEvents: [
                { tsMs: at(30), userId: 'u1', status: 'busy', previousStatus: 'active' },
                { tsMs: at(80), userId: 'u1', status: 'join me', previousStatus: 'busy' }
            ],
            ...range
        });

        const u1 = totals.get('u1');
        expect(u1.active).toBe(30 * MIN);
        expect(u1.busy).toBe(50 * MIN);
        expect(u1['join me']).toBe(20 * MIN);
        expect(u1.totalOnlineMs).toBe(100 * MIN);
        expect(u1.unknown).toBe(0);
    });

    it('backfills unknown spans from the next status event previousStatus', () => {
        const totals = computeStatusTotals({
            presenceEvents: [
                { tsMs: at(0), userId: 'u1', type: 'Online' },
                { tsMs: at(90), userId: 'u1', type: 'Offline' }
            ],
            statusEvents: [
                { tsMs: at(40), userId: 'u1', status: 'ask me', previousStatus: 'join me' }
            ],
            ...range
        });

        const u1 = totals.get('u1');
        expect(u1['join me']).toBe(40 * MIN); // backfilled
        expect(u1['ask me']).toBe(50 * MIN);
        expect(u1.unknown).toBe(0);
    });

    it('counts spans with no status information as unknown', () => {
        const totals = computeStatusTotals({
            presenceEvents: [
                { tsMs: at(0), userId: 'u1', type: 'Online' },
                { tsMs: at(60), userId: 'u1', type: 'Offline' }
            ],
            statusEvents: [],
            ...range
        });

        const u1 = totals.get('u1');
        expect(u1.unknown).toBe(60 * MIN);
        expect(u1.totalOnlineMs).toBe(60 * MIN);
    });

    it('does not accumulate while offline', () => {
        const totals = computeStatusTotals({
            presenceEvents: [
                { tsMs: at(0), userId: 'u1', type: 'Online' },
                { tsMs: at(10), userId: 'u1', type: 'Offline' },
                { tsMs: at(500), userId: 'u1', type: 'Online' }
            ],
            snapshots: [
                { tsMs: at(0), userId: 'u1', status: 'busy' },
                { tsMs: at(500), userId: 'u1', status: 'busy' }
            ],
            statusEvents: [],
            ...range
        });

        const u1 = totals.get('u1');
        // 10 min first session + open tail 100 min (500 -> 600)
        expect(u1.busy).toBe(110 * MIN);
        expect(u1.totalOnlineMs).toBe(110 * MIN);
    });

    it('keeps status across sessions (VRChat statuses persist)', () => {
        const totals = computeStatusTotals({
            presenceEvents: [
                { tsMs: at(0), userId: 'u1', type: 'Online' },
                { tsMs: at(30), userId: 'u1', type: 'Offline' },
                { tsMs: at(100), userId: 'u1', type: 'Online' },
                { tsMs: at(160), userId: 'u1', type: 'Offline' }
            ],
            snapshots: [{ tsMs: at(0), userId: 'u1', status: 'join me' }],
            statusEvents: [],
            ...range
        });

        const u1 = totals.get('u1');
        expect(u1['join me']).toBe(90 * MIN);
    });

    it('clamps accumulation to the requested range', () => {
        const totals = computeStatusTotals({
            presenceEvents: [
                { tsMs: at(-120), userId: 'u1', type: 'Online' },
                { tsMs: at(60), userId: 'u1', type: 'Offline' }
            ],
            snapshots: [{ tsMs: at(-120), userId: 'u1', status: 'active' }],
            statusEvents: [],
            ...range
        });

        const u1 = totals.get('u1');
        expect(u1.active).toBe(60 * MIN); // only the part inside the range
    });

    it('handles multiple users independently', () => {
        const totals = computeStatusTotals({
            presenceEvents: [
                { tsMs: at(0), userId: 'u1', type: 'Online' },
                { tsMs: at(10), userId: 'u2', type: 'Online' },
                { tsMs: at(50), userId: 'u1', type: 'Offline' },
                { tsMs: at(70), userId: 'u2', type: 'Offline' }
            ],
            snapshots: [
                { tsMs: at(0), userId: 'u1', status: 'busy' },
                { tsMs: at(10), userId: 'u2', status: 'active' }
            ],
            statusEvents: [],
            ...range
        });

        expect(totals.get('u1').busy).toBe(50 * MIN);
        expect(totals.get('u2').active).toBe(60 * MIN);
    });

    it('ignores offline/invalid statuses in events', () => {
        const totals = computeStatusTotals({
            presenceEvents: [
                { tsMs: at(0), userId: 'u1', type: 'Online' },
                { tsMs: at(20), userId: 'u1', type: 'Offline' }
            ],
            statusEvents: [
                { tsMs: at(10), userId: 'u1', status: 'offline', previousStatus: 'weird' }
            ],
            ...range
        });

        const u1 = totals.get('u1');
        expect(u1.totalOnlineMs).toBe(20 * MIN);
        expect(u1.unknown).toBe(20 * MIN);
    });
});
