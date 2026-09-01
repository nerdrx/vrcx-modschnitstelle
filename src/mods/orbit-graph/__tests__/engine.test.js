import { describe, expect, it } from 'vitest';

import {
    CATEGORIES,
    DEFAULT_OPTIONS,
    SESSION_MIN_OVERLAP_SECONDS,
    accumulateCoPresence,
    applyFilters,
    buildOrbitGraph,
    buildWindowPresence,
    buildWindows,
    computeGraph,
    edgeWidth,
    formatHours,
    groupEventsByLocation,
    isRealLocation,
    isSelfEvent,
    mergeIntervals,
    nodeSymbolSize,
    overlapOf,
    personKey,
    readFriends,
    readSelf,
    toEchartsGraph
} from '../engine';
import { rangeStartIso } from '../db';

// ---------------------------------------------------------------- fixtures --

const DAY = '2026-01-10';
/** ISO timestamp helper: T(10, 30) → 2026-01-10T10:30:00.000Z */
function T(hour, minute = 0, second = 0) {
    return new Date(Date.UTC(2026, 0, 10, hour, minute, second)).toISOString();
}
const NOW = Date.parse(T(12));
const SELF = { userId: 'usr_me', displayName: 'Me' };

function loc(createdAt, location, time, worldId = 'wrld_x', worldName = 'World X') {
    return { createdAt, location, worldId, worldName, time };
}
function join(createdAt, displayName, location, userId = '') {
    return { createdAt, type: 'OnPlayerJoined', displayName, location, userId };
}
function leave(createdAt, displayName, location, userId = '') {
    return { createdAt, type: 'OnPlayerLeft', displayName, location, userId };
}

const A = 'wrld_a:1~region(eu)';
const B = 'wrld_b:2~region(eu)';

/**
 * Baseline scenario:
 *   window A 10:00–11:00  me + Alice (10:00–10:50) + Bob (10:30–open)
 *   window B 11:10–11:40  me + Carol (leave only) + Dave (no user_id)
 *   third location row is 'private' → skipped
 */
const LOCATION_ROWS = [
    loc(T(10), A, 3600000, 'wrld_a', 'World A'),
    loc(T(11, 10), B, null, 'wrld_b', 'World B'),
    loc(T(11, 40), 'private', null, '', '')
];

const JOIN_LEAVE_ROWS = [
    // my own rows — must never become nodes (id match and name-only match)
    join(T(10), 'Me', A, 'usr_me'),
    join(T(10), 'Me', A, ''),
    // others
    join(T(10), 'Alice', A, 'usr_alice'),
    join(T(10, 30), 'Bob', A, 'usr_bob'),
    leave(T(10, 50), 'Alice', A, 'usr_alice'),
    leave(T(11), 'Me', A, 'usr_me'),
    // window B: Carol has no join line, Dave carries no user_id
    leave(T(11, 30), 'Carol', B, 'usr_carol'),
    join(T(11, 15), 'Dave', B, ''),
    leave(T(11, 35), 'Dave', B, '')
];

const OPEN = { minSharedMinutes: 0, topN: 0, friendsOnly: false };

function graphOf(options = {}, extra = {}) {
    return computeGraph({
        locationRows: extra.locationRows || LOCATION_ROWS,
        joinLeaveRows: extra.joinLeaveRows || JOIN_LEAVE_ROWS,
        self: SELF,
        friends: extra.friends || { ids: new Set(), names: new Set() },
        nowMs: NOW,
        options: { ...OPEN, ...options }
    });
}

function nodeByName(graph, displayName) {
    return graph.nodes.find((n) => n.displayName === displayName);
}
function edgeBetween(graph, keyA, keyB) {
    return graph.edges.find(
        (e) => (e.a === keyA && e.b === keyB) || (e.a === keyB && e.b === keyA)
    );
}

// ------------------------------------------------------------- primitives --

describe('primitives', () => {
    it('keys people by user id, falling back to the display name', () => {
        expect(personKey('usr_1', 'Alice')).toBe('usr_1');
        expect(personKey('', 'Alice')).toBe('name:Alice');
        expect(personKey('', '')).toBe('name:');
    });

    it('rejects non-instance locations', () => {
        expect(isRealLocation('wrld_a:1')).toBe(true);
        expect(isRealLocation('')).toBe(false);
        expect(isRealLocation('private')).toBe(false);
        expect(isRealLocation('traveling')).toBe(false);
        expect(isRealLocation('offline')).toBe(false);
    });

    it('merges overlapping intervals', () => {
        expect(mergeIntervals([])).toEqual([]);
        expect(
            mergeIntervals([
                [10, 20],
                [15, 25],
                [40, 50]
            ])
        ).toEqual([
            [10, 25],
            [40, 50]
        ]);
    });

    it('computes overlap and the latest shared end', () => {
        expect(overlapOf([[0, 100]], [[50, 200]])).toEqual({ ms: 50, lastEnd: 100 });
        expect(overlapOf([[0, 10]], [[20, 30]])).toEqual({ ms: 0, lastEnd: 0 });
        expect(
            overlapOf(
                [
                    [0, 10],
                    [20, 30]
                ],
                [[5, 25]]
            )
        ).toEqual({ ms: 10, lastEnd: 25 });
    });

    it('recognizes my own gamelog rows by id and by name', () => {
        expect(isSelfEvent({ userId: 'usr_me', displayName: 'Whatever' }, SELF)).toBe(true);
        expect(isSelfEvent({ userId: '', displayName: 'Me' }, SELF)).toBe(true);
        expect(isSelfEvent({ userId: 'usr_alice', displayName: 'Alice' }, SELF)).toBe(false);
    });
});

// ------------------------------------------------------ my presence windows --

describe('buildWindows', () => {
    it('uses the recorded duration when present', () => {
        const [win] = buildWindows([loc(T(10), A, 1800000)], { nowMs: NOW });
        expect(win.start).toBe(Date.parse(T(10)));
        expect(win.end).toBe(Date.parse(T(10, 30)));
        expect(win.location).toBe(A);
    });

    it('derives the end from the next row when time is NULL', () => {
        const windows = buildWindows([loc(T(10), A, null), loc(T(10, 45), B, null)], {
            nowMs: NOW
        });
        expect(windows[0].end).toBe(Date.parse(T(10, 45)));
        // last row without duration runs until "now"
        expect(windows[1].end).toBe(NOW);
    });

    it('never lets a bogus duration bleed into the next visit', () => {
        const windows = buildWindows([loc(T(10), A, 99999999), loc(T(10, 30), B, null)], {
            nowMs: NOW
        });
        expect(windows[0].end).toBe(Date.parse(T(10, 30)));
        expect(windows[1].end).toBe(NOW);
    });

    it('clamps a running session to now', () => {
        const [win] = buildWindows([loc(T(11), A, 7200000)], { nowMs: NOW });
        expect(win.end).toBe(NOW);
    });

    it('skips private/traveling/offline/empty locations but still uses them as end markers', () => {
        const windows = buildWindows(
            [
                loc(T(10), A, null),
                loc(T(10, 20), 'traveling', null),
                loc(T(10, 25), 'private', null),
                loc(T(10, 40), '', null),
                loc(T(10, 50), 'offline', null)
            ],
            { nowMs: NOW }
        );
        expect(windows).toHaveLength(1);
        expect(windows[0].end).toBe(Date.parse(T(10, 20)));
    });

    it('clips windows to the range start and drops the ones that fall outside', () => {
        const fromMs = Date.parse(T(10, 30));
        const windows = buildWindows([loc(T(9), A, 3600000), loc(T(10, 15), B, 3600000)], {
            nowMs: NOW,
            fromMs
        });
        // 09:00–10:00 is entirely before the range
        expect(windows).toHaveLength(1);
        expect(windows[0].location).toBe(B);
        expect(windows[0].start).toBe(fromMs);
    });

    it('ignores unparsable and zero-length rows', () => {
        const windows = buildWindows([loc('not-a-date', A, 1000), loc(T(10), A, 0), loc(T(10), B, null)], {
            nowMs: NOW
        });
        // the T(10) A row ends at the T(10) B row → zero length → dropped
        expect(windows.map((w) => w.location)).toEqual([B]);
    });
});

// ------------------------------------------------- other people's presence --

describe('buildWindowPresence', () => {
    const win = { location: A, worldId: 'wrld_a', worldName: 'World A', start: Date.parse(T(10)), end: Date.parse(T(11)) };
    const events = groupEventsByLocation(JOIN_LEAVE_ROWS).get(A);

    it('rebuilds intervals from join/leave pairs', () => {
        const people = buildWindowPresence(win, events, SELF);
        expect(people.get('usr_alice').intervals).toEqual([
            [Date.parse(T(10)), Date.parse(T(10, 50))]
        ]);
    });

    it('clips a missing leave to the window end', () => {
        const people = buildWindowPresence(win, events, SELF);
        expect(people.get('usr_bob').intervals).toEqual([
            [Date.parse(T(10, 30)), Date.parse(T(11))]
        ]);
    });

    it('clips a missing join to the window start', () => {
        const winB = { location: B, worldName: 'World B', start: Date.parse(T(11, 10)), end: Date.parse(T(11, 40)) };
        const people = buildWindowPresence(winB, groupEventsByLocation(JOIN_LEAVE_ROWS).get(B), SELF);
        expect(people.get('usr_carol').intervals).toEqual([
            [Date.parse(T(11, 10)), Date.parse(T(11, 30))]
        ]);
    });

    it('excludes my own rows (by id and by display name)', () => {
        const people = buildWindowPresence(win, events, SELF);
        expect(people.has('usr_me')).toBe(false);
        expect(people.has('name:Me')).toBe(false);
    });

    it('drops people whose presence falls outside the window', () => {
        const late = { location: A, worldName: '', start: Date.parse(T(11, 30)), end: Date.parse(T(11, 45)) };
        const people = buildWindowPresence(late, events, SELF);
        expect(people.size).toBe(0);
    });

    it('does not carry a join from an earlier visit into a later one', () => {
        // I visit the same instance twice; Alice joined during the first visit
        // and is gone (without a leave line) during the second.
        const locationRows = [loc(T(10), A, 1800000), loc(T(11), A, 1800000)];
        const joinLeaveRows = [join(T(10, 5), 'Alice', A, 'usr_alice')];
        const graph = graphOf({}, { locationRows, joinLeaveRows });
        const alice = nodeByName(graph, 'Alice');
        // 10:05–10:30 in the first window only, nothing in the second
        expect(alice.secondsWithYou).toBe(25 * 60);
    });

    it('collapses duplicate join lines instead of double counting', () => {
        const rows = [join(T(10), 'Eve', A, 'usr_eve'), join(T(10, 10), 'Eve', A, 'usr_eve'), leave(T(10, 40), 'Eve', A, 'usr_eve')];
        const people = buildWindowPresence(win, groupEventsByLocation(rows).get(A), SELF);
        expect(people.get('usr_eve').intervals).toEqual([
            [Date.parse(T(10)), Date.parse(T(10, 40))]
        ]);
    });
});

// ----------------------------------------------------------- full pipeline --

describe('computeGraph', () => {
    it('turns co-presence into nodes with time and session counts', () => {
        const graph = graphOf();
        const alice = nodeByName(graph, 'Alice');
        const bob = nodeByName(graph, 'Bob');
        const carol = nodeByName(graph, 'Carol');
        const dave = nodeByName(graph, 'Dave');

        expect(alice.secondsWithYou).toBe(50 * 60);
        expect(bob.secondsWithYou).toBe(30 * 60);
        expect(carol.secondsWithYou).toBe(20 * 60);
        expect(dave.secondsWithYou).toBe(20 * 60);
        expect(alice.sessionsWithYou).toBe(1);

        // node keying: real id vs name fallback
        expect(alice.key).toBe('usr_alice');
        expect(dave.key).toBe('name:Dave');
        expect(dave.userId).toBe('');
    });

    it('always keeps me as the first node and never as a friend', () => {
        const graph = graphOf();
        expect(graph.nodes[0].isSelf).toBe(true);
        expect(graph.nodes[0].key).toBe('usr_me');
        expect(graph.nodes[0].isFriend).toBe(false);
        // my "seconds" is total time in instances (60 + 30 minutes)
        expect(graph.nodes[0].secondsWithYou).toBe(90 * 60);
        expect(graph.nodes[0].sessionsWithYou).toBe(2);
    });

    it('records last seen timestamp, location and world name', () => {
        const alice = nodeByName(graphOf(), 'Alice');
        expect(alice.lastSeenAt).toBe(T(10, 50));
        expect(alice.firstSeenAt).toBe(T(10));
        expect(alice.lastLocation).toBe(A);
        expect(alice.lastWorldName).toBe('World A');
    });

    it('builds edges between other people, not just to me', () => {
        const graph = graphOf();
        expect(graph.edges).toHaveLength(6);
        expect(edgeBetween(graph, 'usr_alice', 'usr_bob').seconds).toBe(20 * 60);
        expect(edgeBetween(graph, 'usr_carol', 'name:Dave').seconds).toBe(15 * 60);
        expect(edgeBetween(graph, 'usr_me', 'usr_alice').seconds).toBe(50 * 60);
    });

    it('excludes me from the people count', () => {
        const graph = graphOf();
        expect(graph.stats.peopleTotal).toBe(4);
        expect(graph.stats.peopleShown).toBe(4);
        expect(graph.stats.edgesShown).toBe(6);
        expect(graph.stats.windows).toBe(2);
    });

    it('merges the same key across windows and counts one session per window', () => {
        const locationRows = [loc(T(10), A, 3600000), loc(T(11), A, 1800000)];
        const joinLeaveRows = [
            join(T(10), 'Alice', A, 'usr_alice'),
            leave(T(10, 30), 'Alice', A, 'usr_alice'),
            join(T(11), 'Alice', A, 'usr_alice'),
            leave(T(11, 20), 'Alice', A, 'usr_alice')
        ];
        const alice = nodeByName(graphOf({}, { locationRows, joinLeaveRows }), 'Alice');
        expect(alice.secondsWithYou).toBe(50 * 60);
        expect(alice.sessionsWithYou).toBe(2);
    });

    it('keeps id-keyed and name-keyed sightings of one person apart', () => {
        const locationRows = [loc(T(10), A, 3600000)];
        const joinLeaveRows = [
            join(T(10), 'Frank', A, ''),
            leave(T(10, 20), 'Frank', A, ''),
            join(T(10, 30), 'Frank', A, 'usr_frank'),
            leave(T(10, 50), 'Frank', A, 'usr_frank')
        ];
        const graph = graphOf({}, { locationRows, joinLeaveRows });
        const franks = graph.nodes.filter((n) => n.displayName === 'Frank');
        expect(franks.map((f) => f.key).sort()).toEqual(['name:Frank', 'usr_frank']);
        expect(franks.every((f) => f.secondsWithYou === 20 * 60)).toBe(true);
    });

    it('counts short encounters in seconds but not as a shared session', () => {
        const locationRows = [loc(T(10), A, 3600000)];
        const joinLeaveRows = [
            join(T(10), 'Ghost', A, 'usr_ghost'),
            leave(T(10, 0, 30), 'Ghost', A, 'usr_ghost')
        ];
        const ghost = nodeByName(graphOf({}, { locationRows, joinLeaveRows }), 'Ghost');
        expect(ghost.secondsWithYou).toBe(30);
        expect(ghost.sessionsWithYou).toBe(0);
        expect(SESSION_MIN_OVERLAP_SECONDS).toBe(60);
    });

    it('honours the time range', () => {
        const locationRows = [loc(T(10), A, 3600000)];
        const joinLeaveRows = [join(T(10), 'Alice', A, 'usr_alice'), leave(T(11), 'Alice', A, 'usr_alice')];
        const nowMs = Date.parse('2026-06-01T00:00:00.000Z'); // ~142 days later
        const inRange = computeGraph({
            locationRows,
            joinLeaveRows,
            self: SELF,
            nowMs,
            options: { ...OPEN, rangeDays: 365 }
        });
        const outOfRange = computeGraph({
            locationRows,
            joinLeaveRows,
            self: SELF,
            nowMs,
            options: { ...OPEN, rangeDays: 30 }
        });
        expect(inRange.nodes).toHaveLength(2);
        expect(outOfRange.nodes).toHaveLength(1); // only me
        expect(outOfRange.stats.windows).toBe(0);
    });
});

// ---------------------------------------------------------------- filters --

describe('filters', () => {
    it('drops nodes and edges below the minimum shared time', () => {
        const graph = graphOf({ minSharedMinutes: 25 });
        expect(graph.nodes.map((n) => n.displayName).sort()).toEqual(['Alice', 'Bob', 'Me']);
        // Alice↔Bob (20 min) is below the threshold, so only my two edges remain
        expect(graph.edges).toHaveLength(2);
        expect(edgeBetween(graph, 'usr_alice', 'usr_bob')).toBeUndefined();
    });

    it('limits to the top N people by time with me and always keeps me', () => {
        const graph = graphOf({ topN: 2 });
        expect(graph.nodes).toHaveLength(3);
        expect(graph.nodes[0].isSelf).toBe(true);
        expect(graph.nodes.slice(1).map((n) => n.displayName)).toEqual(['Alice', 'Bob']);
        // edges to dropped nodes disappear with them
        expect(graph.edges).toHaveLength(3);
        expect(graph.stats.peopleTotal).toBe(4);
        expect(graph.stats.peopleShown).toBe(2);
    });

    it('can restrict the graph to friends', () => {
        const friends = { ids: new Set(['usr_alice']), names: new Set(['Dave']) };
        const all = graphOf({}, { friends });
        expect(nodeByName(all, 'Alice').isFriend).toBe(true);
        expect(nodeByName(all, 'Dave').isFriend).toBe(true); // name fallback, no user_id
        expect(nodeByName(all, 'Bob').isFriend).toBe(false);
        expect(all.stats.friendsShown).toBe(2);
        expect(all.stats.othersShown).toBe(2);

        const onlyFriends = graphOf({ friendsOnly: true }, { friends });
        expect(onlyFriends.nodes.map((n) => n.displayName).sort()).toEqual(['Alice', 'Dave', 'Me']);
    });

    it('does not apply the friend name fallback to id-keyed people', () => {
        // Bob has a user_id, so a name-only friend entry must not mark him
        const friends = { ids: new Set(), names: new Set(['Bob']) };
        expect(nodeByName(graphOf({}, { friends }), 'Bob').isFriend).toBe(false);
    });

    it('is friends-blind by default', () => {
        expect(DEFAULT_OPTIONS.friendsOnly).toBe(false);
    });

    it('applyFilters works on a hand-built accumulator', () => {
        const acc = accumulateCoPresence({
            windows: buildWindows(LOCATION_ROWS, { nowMs: NOW }),
            eventsByLocation: groupEventsByLocation(JOIN_LEAVE_ROWS),
            self: SELF
        });
        expect(acc.selfKey).toBe('usr_me');
        expect(acc.windowCount).toBe(2);
        expect(applyFilters(acc, { minSharedMinutes: 0, topN: 0 }).nodes).toHaveLength(5);
    });
});

// ------------------------------------------------------ ctx-driven entry ----

function fakeCtx({
    locationRows = LOCATION_ROWS,
    joinLeaveRows = JOIN_LEAVE_ROWS,
    self = SELF,
    friendEntries = [],
    throwOnStores = false
} = {}) {
    const calls = [];
    return {
        calls,
        db: {
            async query(sql, args) {
                calls.push({ sql, args });
                if (sql.includes('gamelog_location')) {
                    return locationRows.map((r) => [
                        r.createdAt,
                        r.location,
                        r.worldId,
                        r.worldName,
                        r.time
                    ]);
                }
                return joinLeaveRows.map((r) => [
                    r.createdAt,
                    r.type,
                    r.displayName,
                    r.location,
                    r.userId
                ]);
            }
        },
        stores: {
            get user() {
                if (throwOnStores) {
                    throw new Error('no pinia');
                }
                return { currentUser: { id: self.userId, displayName: self.displayName } };
            },
            get friends() {
                if (throwOnStores) {
                    throw new Error('no pinia');
                }
                return { friends: new Map(friendEntries) };
            }
        }
    };
}

describe('buildOrbitGraph (ctx driven)', () => {
    it('queries both gamelog tables with the range bound and builds the graph', async () => {
        const ctx = fakeCtx();
        const graph = await buildOrbitGraph(ctx, {
            ...OPEN,
            rangeDays: 90,
            nowMs: NOW
        });

        expect(ctx.calls).toHaveLength(2);
        const from = rangeStartIso(NOW, 90);
        for (const call of ctx.calls) {
            expect(call.args).toEqual({ '@from': from });
        }
        expect(ctx.calls.some((c) => c.sql.includes('gamelog_location'))).toBe(true);
        expect(ctx.calls.some((c) => c.sql.includes('gamelog_join_leave'))).toBe(true);

        expect(graph.nodes.map((n) => n.displayName).sort()).toEqual([
            'Alice',
            'Bob',
            'Carol',
            'Dave',
            'Me'
        ]);
    });

    it('reads friendship from the friend store', async () => {
        const ctx = fakeCtx({
            friendEntries: [
                ['usr_alice', { id: 'usr_alice', name: 'Alice', ref: { displayName: 'Alice' } }],
                ['usr_zed', { id: 'usr_zed', name: 'Zed' }]
            ]
        });
        const graph = await buildOrbitGraph(ctx, { ...OPEN, nowMs: NOW });
        expect(nodeByName(graph, 'Alice').isFriend).toBe(true);
        expect(nodeByName(graph, 'Bob').isFriend).toBe(false);
    });

    it('queries everything ever recorded for the "all" range', async () => {
        const ctx = fakeCtx();
        await buildOrbitGraph(ctx, { ...OPEN, rangeDays: null, nowMs: NOW });
        expect(ctx.calls[0].args['@from']).toBe('0000-01-01T00:00:00.000Z');
    });

    it('returns an empty graph on a fresh install', async () => {
        const ctx = fakeCtx({ locationRows: [], joinLeaveRows: [] });
        const graph = await buildOrbitGraph(ctx, { ...OPEN, nowMs: NOW });
        expect(graph.stats.peopleTotal).toBe(0);
        expect(graph.edges).toHaveLength(0);
        expect(graph.nodes).toHaveLength(1); // just me
    });

    it('survives missing stores', () => {
        const ctx = fakeCtx({ throwOnStores: true });
        expect(readSelf(ctx)).toEqual({ userId: '', displayName: '' });
        expect(readFriends(ctx)).toEqual({ ids: new Set(), names: new Set() });
    });

    it('reads my identity from the user store', () => {
        expect(readSelf(fakeCtx())).toEqual({ userId: 'usr_me', displayName: 'Me' });
    });
});

// ------------------------------------------------------------ presentation --

describe('presentation helpers', () => {
    it('scales node size with sqrt of time and clamps it', () => {
        expect(nodeSymbolSize(0)).toBeGreaterThanOrEqual(10);
        expect(nodeSymbolSize(3600)).toBeGreaterThan(nodeSymbolSize(0));
        expect(nodeSymbolSize(3600 * 10000)).toBeLessThanOrEqual(38);
        expect(nodeSymbolSize(0, true)).toBe(46);
    });

    it('scales edge width with sqrt of time and clamps it', () => {
        expect(edgeWidth(0)).toBeGreaterThanOrEqual(0.6);
        expect(edgeWidth(3600 * 1000)).toBeLessThanOrEqual(7);
    });

    it('formats durations for humans', () => {
        expect(formatHours(600)).toBe('10 min');
        expect(formatHours(3600 * 2.5)).toBe('2.5 h');
        expect(formatHours(3600 * 42)).toBe('42 h');
    });

    it('maps the graph onto ECharts categories', () => {
        const friends = { ids: new Set(['usr_alice']), names: new Set() };
        const series = toEchartsGraph(graphOf({}, { friends }));
        expect(series.categories.map((c) => c.name)).toEqual(['You', 'Friends', 'Others']);
        expect(series.nodes.find((n) => n.displayName === 'Me').category).toBe(0);
        expect(series.nodes.find((n) => n.displayName === 'Alice').category).toBe(1);
        expect(series.nodes.find((n) => n.displayName === 'Bob').category).toBe(2);
        expect(series.links).toHaveLength(6);
        expect(CATEGORIES).toHaveLength(3);
        // my own node is always worth a label, a 20 minute acquaintance is not
        expect(series.nodes.find((n) => n.displayName === 'Me').labelShow).toBe(true);
        expect(series.nodes.find((n) => n.displayName === 'Carol').labelShow).toBe(false);
    });

    it('dims non-matching nodes while searching', () => {
        const series = toEchartsGraph(graphOf(), { search: 'ali' });
        const alice = series.nodes.find((n) => n.displayName === 'Alice');
        const bob = series.nodes.find((n) => n.displayName === 'Bob');
        expect(alice.itemStyle.opacity).toBe(1);
        expect(alice.itemStyle.borderWidth).toBe(3);
        expect(bob.itemStyle.opacity).toBeLessThan(1);
    });

    it('day fixture sanity', () => {
        expect(T(10)).toContain(DAY);
    });
});
