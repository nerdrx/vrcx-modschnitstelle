// ============================================================================
// Orbit Graph — pure co-presence engine (no VRCX imports, fully unit-testable).
//
// The graph is NOT the friend list. It is reconstructed from the LOCAL
// gamelog: who stood in the same instance as me, with whom, for how long.
// That surfaces everyone encountered — friends AND strangers — plus the edges
// between other people who keep showing up in my lobbies together.
//
// Algorithm (one sweep):
//   1. gamelog_location  → my own presence windows [start, end].
//      end = created_at + time, or (time NULL) the next location row's
//      created_at, or "now" for the running session; clipped to the range.
//   2. gamelog_join_leave→ grouped by location. For every window, walk that
//      location's events in time order and rebuild each person's presence
//      intervals:
//        join  → interval opens
//        leave → interval closes (no open join ⇒ they were already there
//                when I arrived ⇒ clip to window start)
//        still open at the end ⇒ clip to window end
//      My own rows are dropped here; I am added as a participant covering
//      the whole window instead.
//   3. Pairwise overlap among all participants of that window (including me),
//      two-pointer over the merged interval lists. Accumulated per pair:
//      overlap seconds, plus one "shared session" when the overlap inside
//      this window reaches SESSION_MIN_OVERLAP_SECONDS.
//   Cost is O(windows · participants²) with tiny constants — pairwise work
//   never spans the whole dataset.
//
// People are keyed `user_id || 'name:' + display_name`. Ancient rows without
// a user_id therefore form their own node; that is accepted (names are not a
// reliable identity), but the same key always merges.
// ============================================================================

import { getJoinLeaveRows, getLocationRows, rangeStartIso } from './db';

/** Location values that are not real instances. */
export const SKIP_LOCATIONS = new Set(['', 'private', 'traveling', 'offline']);

/** Minimum overlap inside one window before a pair earns a "shared session". */
export const SESSION_MIN_OVERLAP_SECONDS = 60;

/**
 * How far before a window start a join line may sit and still count as "this
 * visit". Older joins belong to an earlier visit of the same instance and are
 * ignored, otherwise someone who left while I was away would be counted as
 * present for my whole next visit.
 */
export const PRESENCE_JOIN_GRACE_MS = 60000;

/**
 * Pair ids are packed as `a * PAIR_ID_STRIDE + b` so the hot loop keys its map
 * with a number instead of building millions of strings. Supports 10M people
 * and stays well inside Number.MAX_SAFE_INTEGER.
 */
const PAIR_ID_STRIDE = 10000000;

/** Selectable time ranges (null = everything recorded). */
export const RANGE_OPTIONS = [
    { key: '30', days: 30 },
    { key: '90', days: 90 },
    { key: '365', days: 365 },
    { key: 'all', days: null }
];

export const DEFAULT_OPTIONS = {
    rangeDays: 90,
    minSharedMinutes: 30,
    /** max number of people besides you; 0 = unlimited */
    topN: 120,
    friendsOnly: false
};

/** ECharts categories. Non-friends are deliberately the loud ones. */
export const CATEGORIES = [
    { name: 'You', color: '#ec4899', icon: 'ri-user-star-line' },
    { name: 'Friends', color: '#a855f7', icon: 'ri-heart-3-line' },
    { name: 'Others', color: '#22d3ee', icon: 'ri-user-search-line' }
];

export const CATEGORY_INDEX = { You: 0, Friends: 1, Others: 2 };

// ---------------------------------------------------------------- helpers --

/** @returns {number|null} epoch ms, or null when unparsable */
export function parseTs(iso) {
    if (!iso) {
        return null;
    }
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}

/** Stable identity for a person seen in the gamelog. */
export function personKey(userId, displayName) {
    if (userId) {
        return userId;
    }
    return `name:${displayName || ''}`;
}

/** True for locations that represent a real, shared instance. */
export function isRealLocation(location) {
    return !SKIP_LOCATIONS.has(String(location || '').trim());
}

/** Merge a list of [start, end] pairs into sorted, non-overlapping ranges. */
export function mergeIntervals(intervals) {
    if (intervals.length <= 1) {
        return intervals.slice();
    }
    const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
    const out = [sorted[0].slice()];
    for (let i = 1; i < sorted.length; i++) {
        const last = out[out.length - 1];
        const cur = sorted[i];
        if (cur[0] <= last[1]) {
            if (cur[1] > last[1]) {
                last[1] = cur[1];
            }
        } else {
            out.push(cur.slice());
        }
    }
    return out;
}

/**
 * Overlap between two merged interval lists.
 * @returns {{ms:number, lastEnd:number}} lastEnd = end of the latest shared
 *          slice (0 when they never overlapped)
 */
export function overlapOf(a, b) {
    let i = 0;
    let j = 0;
    let ms = 0;
    let lastEnd = 0;
    while (i < a.length && j < b.length) {
        const start = Math.max(a[i][0], b[j][0]);
        const end = Math.min(a[i][1], b[j][1]);
        if (end > start) {
            ms += end - start;
            if (end > lastEnd) {
                lastEnd = end;
            }
        }
        if (a[i][1] < b[j][1]) {
            i++;
        } else {
            j++;
        }
    }
    return { ms, lastEnd };
}

// ------------------------------------------------------------- step 1: me --

/**
 * Rebuild my own presence windows from gamelog_location.
 *
 * @param {Array} locationRows rows from db.getLocationRows()
 * @param {object} opts
 * @param {number} opts.nowMs
 * @param {number} [opts.fromMs] lower clip bound (range start)
 * @returns {Array<{location:string, worldId:string, worldName:string,
 *                  start:number, end:number}>}
 */
export function buildWindows(locationRows, { nowMs = Date.now(), fromMs = -Infinity } = {}) {
    const rows = locationRows
        .map((r) => ({ ...r, startMs: parseTs(r.createdAt) }))
        .filter((r) => r.startMs !== null)
        .sort((a, b) => a.startMs - b.startMs);

    const windows = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const nextStart = i + 1 < rows.length ? rows[i + 1].startMs : null;

        // Duration is authoritative when present, but never let a bogus value
        // bleed into the next visit.
        let end;
        if (Number.isFinite(row.time) && row.time > 0) {
            end = row.startMs + row.time;
            if (nextStart !== null && nextStart < end) {
                end = nextStart;
            }
        } else {
            end = nextStart !== null ? nextStart : nowMs;
        }
        if (end > nowMs) {
            end = nowMs;
        }

        if (!isRealLocation(row.location)) {
            continue;
        }

        const start = Math.max(row.startMs, fromMs);
        if (end <= start) {
            continue;
        }
        windows.push({
            location: row.location,
            worldId: row.worldId,
            worldName: row.worldName,
            start,
            end
        });
    }
    return windows;
}

/** Group join/leave rows by location, each group sorted ascending by time. */
export function groupEventsByLocation(joinLeaveRows) {
    const byLocation = new Map();
    for (const row of joinLeaveRows) {
        if (!isRealLocation(row.location)) {
            continue;
        }
        const ts = parseTs(row.createdAt);
        if (ts === null) {
            continue;
        }
        let list = byLocation.get(row.location);
        if (!list) {
            list = [];
            byLocation.set(row.location, list);
        }
        list.push({
            ts,
            type: row.type,
            displayName: row.displayName || '',
            userId: row.userId || ''
        });
    }
    for (const list of byLocation.values()) {
        list.sort((a, b) => a.ts - b.ts);
    }
    return byLocation;
}

/** Is this gamelog row me? Matches on user id AND on display name. */
export function isSelfEvent(event, self) {
    if (self.userId && event.userId && event.userId === self.userId) {
        return true;
    }
    return Boolean(self.displayName) && event.displayName === self.displayName;
}

// -------------------------------------------------------- step 2: others --

/**
 * Reconstruct everyone else's presence inside one of my windows.
 *
 * @param {object} win window from buildWindows()
 * @param {Array} events that location's events (sorted, from groupEventsByLocation)
 * @param {{userId:string, displayName:string}} self
 * @returns {Map<string, {key:string, userId:string, displayName:string,
 *                        intervals:Array<[number,number]>}>}
 */
export function buildWindowPresence(win, events, self) {
    const open = new Map(); // key -> join ts
    const people = new Map();

    const touch = (key, userId, displayName) => {
        let person = people.get(key);
        if (!person) {
            person = { key, userId: userId || '', displayName: displayName || '', intervals: [] };
            people.set(key, person);
        } else if (displayName) {
            person.displayName = displayName; // latest name wins
        }
        return person;
    };

    const record = (person, from, to) => {
        const start = Math.max(from, win.start);
        const end = Math.min(to, win.end);
        if (end > start) {
            person.intervals.push([start, end]);
        }
    };

    for (const event of events) {
        if (event.ts > win.end) {
            break;
        }
        if (isSelfEvent(event, self)) {
            continue;
        }
        const key = personKey(event.userId, event.displayName);
        const person = touch(key, event.userId, event.displayName);
        if (event.type === 'OnPlayerJoined') {
            // A join from an earlier visit to the same instance says nothing
            // about this one — VRChat re-logs everybody present when I enter,
            // so anyone still there gets a fresh join line. The grace window
            // absorbs the ordering jitter between the location row and the
            // join lines that follow it.
            if (event.ts < win.start - PRESENCE_JOIN_GRACE_MS) {
                continue;
            }
            if (!open.has(key)) {
                open.set(key, event.ts);
            }
        } else {
            // Missing join → they were already there when I arrived.
            const from = open.has(key) ? open.get(key) : win.start;
            open.delete(key);
            record(person, from, event.ts);
        }
    }

    // Never left (or the leave line is missing) → clip to window end.
    for (const [key, from] of open) {
        record(people.get(key), from, win.end);
    }

    for (const [key, person] of people) {
        if (person.intervals.length === 0) {
            people.delete(key);
        } else {
            person.intervals = mergeIntervals(person.intervals);
        }
    }
    return people;
}

// ----------------------------------------------------- step 3: the sweep --

function emptyPerson(key, userId, displayName) {
    return {
        key,
        userId: userId || '',
        displayName: displayName || '',
        isFriend: false,
        isSelf: false,
        secondsWithYou: 0,
        sessionsWithYou: 0,
        firstSeenAt: null,
        lastSeenAt: null,
        firstSeenMs: null,
        lastSeenMs: null,
        lastLocation: '',
        lastWorldName: ''
    };
}

/**
 * Walk every window once and accumulate node stats plus pairwise overlap.
 *
 * @returns {{people:Map<string,object>, pairs:Map<string,object>, selfKey:string,
 *            windowCount:number, secondsInGame:number}}
 */
export function accumulateCoPresence({ windows, eventsByLocation, self }) {
    const selfKey = personKey(self.userId, self.displayName);
    const people = new Map();
    const pairs = new Map();
    let secondsInGame = 0;

    // Dense integer ids per person: the inner loop then keys pairs by a single
    // number instead of building millions of strings.
    const idOf = new Map();
    const keyOf = [];
    const nodeOf = [];
    const idFor = (person) => {
        let id = idOf.get(person.key);
        if (id === undefined) {
            id = keyOf.length;
            idOf.set(person.key, id);
            keyOf.push(person.key);
            let node = people.get(person.key);
            if (!node) {
                node = emptyPerson(person.key, person.userId, person.displayName);
                people.set(person.key, node);
            }
            nodeOf.push(node);
        }
        return id;
    };

    const selfNode = emptyPerson(selfKey, self.userId, self.displayName);
    selfNode.isSelf = true;
    people.set(selfKey, selfNode);
    const selfId = idFor(selfNode);

    for (const win of windows) {
        secondsInGame += (win.end - win.start) / 1000;

        const presence = buildWindowPresence(win, eventsByLocation.get(win.location) || [], self);
        // I cover the whole window by definition.
        presence.set(selfKey, {
            key: selfKey,
            userId: self.userId,
            displayName: self.displayName,
            intervals: [[win.start, win.end]]
        });

        const participants = Array.from(presence.values());
        const ids = new Array(participants.length);

        // Register every participant as a node, even if a pairing later
        // yields nothing (keeps names/ids fresh).
        for (let i = 0; i < participants.length; i++) {
            const p = participants[i];
            ids[i] = idFor(p);
            const node = nodeOf[ids[i]];
            if (p.displayName && !node.isSelf) {
                node.displayName = p.displayName; // latest name wins
            }
        }

        for (let i = 0; i < participants.length; i++) {
            const a = participants[i];
            const ai = a.intervals;
            const aSingle = ai.length === 1 ? ai[0] : null;
            for (let j = i + 1; j < participants.length; j++) {
                const b = participants[j];
                const bi = b.intervals;

                // Fast path: a single interval each — the common case by far.
                let ms = 0;
                let lastEnd = 0;
                if (aSingle !== null && bi.length === 1) {
                    const from = aSingle[0] > bi[0][0] ? aSingle[0] : bi[0][0];
                    const to = aSingle[1] < bi[0][1] ? aSingle[1] : bi[0][1];
                    if (to > from) {
                        ms = to - from;
                        lastEnd = to;
                    }
                } else {
                    const result = overlapOf(ai, bi);
                    ms = result.ms;
                    lastEnd = result.lastEnd;
                }
                if (ms <= 0) {
                    continue;
                }
                const seconds = ms / 1000;
                const isSession = seconds >= SESSION_MIN_OVERLAP_SECONDS;
                const idA = ids[i];
                const idB = ids[j];
                const first = idA < idB ? idA : idB;
                const second = idA < idB ? idB : idA;
                const pairKey = first * PAIR_ID_STRIDE + second;
                let pair = pairs.get(pairKey);
                if (!pair) {
                    pair = { a: keyOf[first], b: keyOf[second], seconds: 0, sessions: 0 };
                    pairs.set(pairKey, pair);
                }
                pair.seconds += seconds;
                if (isSession) {
                    pair.sessions += 1;
                }

                // Stats for "with you" only come from pairs that include me.
                if (idA === selfId || idB === selfId) {
                    const node = nodeOf[idA === selfId ? idB : idA];
                    node.secondsWithYou += seconds;
                    if (isSession) {
                        node.sessionsWithYou += 1;
                    }
                    if (node.lastSeenMs === null || lastEnd > node.lastSeenMs) {
                        node.lastSeenMs = lastEnd;
                        node.lastLocation = win.location;
                        node.lastWorldName = win.worldName;
                    }
                    if (node.firstSeenMs === null || win.start < node.firstSeenMs) {
                        node.firstSeenMs = win.start;
                    }
                }
            }
        }
    }

    selfNode.secondsWithYou = secondsInGame;
    selfNode.sessionsWithYou = windows.length;

    // Timestamps become ISO strings once instead of millions of times.
    for (const node of people.values()) {
        node.lastSeenAt = node.lastSeenMs === null ? null : new Date(node.lastSeenMs).toISOString();
        node.firstSeenAt =
            node.firstSeenMs === null ? null : new Date(node.firstSeenMs).toISOString();
    }

    return { people, pairs, selfKey, windowCount: windows.length, secondsInGame };
}

// ---------------------------------------------------------- step 4: view --

/**
 * Apply the UI filters and produce the final node/edge lists.
 *
 * @param {{people:Map, pairs:Map, selfKey:string}} acc
 * @param {object} options {minSharedMinutes, topN, friendsOnly}
 */
export function applyFilters(acc, options = {}) {
    const { minSharedMinutes = 0, topN = 0, friendsOnly = false } = options;
    const minSeconds = Math.max(0, minSharedMinutes) * 60;
    const { people, pairs, selfKey } = acc;

    const all = Array.from(people.values());
    const others = all
        .filter((p) => !p.isSelf)
        .filter((p) => p.secondsWithYou >= minSeconds)
        .filter((p) => (friendsOnly ? p.isFriend : true))
        .sort((a, b) => b.secondsWithYou - a.secondsWithYou || a.key.localeCompare(b.key));

    const kept = topN > 0 ? others.slice(0, topN) : others;
    const selfNode = people.get(selfKey);
    const nodes = selfNode ? [selfNode, ...kept] : kept;
    const keptKeys = new Set(nodes.map((n) => n.key));

    const edges = [];
    for (const pair of pairs.values()) {
        if (pair.seconds < minSeconds) {
            continue;
        }
        if (!keptKeys.has(pair.a) || !keptKeys.has(pair.b)) {
            continue;
        }
        edges.push({ a: pair.a, b: pair.b, seconds: pair.seconds, sessions: pair.sessions });
    }
    edges.sort((x, y) => y.seconds - x.seconds);

    return {
        nodes,
        edges,
        stats: {
            windows: acc.windowCount || 0,
            secondsInGame: acc.secondsInGame || 0,
            peopleTotal: all.length - (selfNode ? 1 : 0),
            peopleShown: kept.length,
            friendsShown: kept.filter((p) => p.isFriend).length,
            othersShown: kept.filter((p) => !p.isFriend).length,
            edgesTotal: pairs.size,
            edgesShown: edges.length
        }
    };
}

// ------------------------------------------------------------ public API --

/**
 * Full pure pipeline: raw rows in, filtered graph out.
 *
 * @param {object} input
 * @param {Array}  input.locationRows
 * @param {Array}  input.joinLeaveRows
 * @param {{userId:string, displayName:string}} input.self
 * @param {{ids:Set<string>, names:Set<string>}} [input.friends]
 * @param {number} [input.nowMs]
 * @param {object} [input.options] {rangeDays, minSharedMinutes, topN, friendsOnly}
 */
export function computeGraph(input) {
    return applyFilters(accumulateFromRows(input), {
        ...DEFAULT_OPTIONS,
        ...(input.options || {})
    });
}

/**
 * The expensive half of the pipeline: rows in, accumulator out. The view keeps
 * this around so moving a filter slider does not re-read the database.
 *
 * @returns {{people:Map, pairs:Map, selfKey:string, windowCount:number,
 *            secondsInGame:number}}
 */
export function accumulateFromRows({
    locationRows = [],
    joinLeaveRows = [],
    self = { userId: '', displayName: '' },
    friends = { ids: new Set(), names: new Set() },
    nowMs = Date.now(),
    options = {}
}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const fromMs =
        opts.rangeDays && opts.rangeDays > 0 ? nowMs - opts.rangeDays * 86400000 : -Infinity;

    const windows = buildWindows(locationRows, { nowMs, fromMs });
    const eventsByLocation = groupEventsByLocation(joinLeaveRows);
    const acc = accumulateCoPresence({ windows, eventsByLocation, self });

    for (const person of acc.people.values()) {
        if (person.isSelf) {
            continue;
        }
        person.isFriend = Boolean(
            person.userId
                ? friends.ids.has(person.userId)
                : friends.names.has(person.displayName)
        );
    }

    return acc;
}

/** Read my identity from the user store (defensive: stores may be missing). */
export function readSelf(ctx) {
    try {
        const user = ctx.stores.user.currentUser;
        return {
            userId: user?.id || '',
            displayName: user?.displayName || ''
        };
    } catch {
        return { userId: '', displayName: '' };
    }
}

/**
 * Friend ids + names from the friend store.
 * Names are only a fallback for gamelog rows without a user_id.
 */
export function readFriends(ctx) {
    const ids = new Set();
    const names = new Set();
    try {
        const store = ctx.stores.friends;
        const map = store?.friends;
        if (map && typeof map.forEach === 'function') {
            map.forEach((friend, userId) => {
                if (userId) {
                    ids.add(userId);
                }
                const name = friend?.ref?.displayName || friend?.name || '';
                if (name) {
                    names.add(name);
                }
            });
        }
    } catch {
        // no store (tests / pre-login) → nobody is a friend
    }
    return { ids, names };
}

/**
 * Query the local gamelog and run the sweep, without filtering. The view keeps
 * the result so filter changes stay instant.
 *
 * @param {object} ctx mod context
 * @param {object} [options] {rangeDays, nowMs}
 */
export async function loadCoPresence(ctx, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
    const fromIso = rangeStartIso(nowMs, opts.rangeDays);

    const [locationRows, joinLeaveRows] = await Promise.all([
        getLocationRows(ctx, fromIso),
        getJoinLeaveRows(ctx, fromIso)
    ]);

    return accumulateFromRows({
        locationRows,
        joinLeaveRows,
        self: readSelf(ctx),
        friends: readFriends(ctx),
        nowMs,
        options: opts
    });
}

/**
 * ctx-driven entry point: query the local DB, sweep, filter.
 *
 * @param {object} ctx mod context
 * @param {object} [options] {rangeDays, minSharedMinutes, topN, friendsOnly, nowMs}
 */
export async function buildOrbitGraph(ctx, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return applyFilters(await loadCoPresence(ctx, opts), opts);
}

// ------------------------------------------------------- presentation ----

/** Node radius from time together: sqrt scale, clamped. */
export function nodeSymbolSize(secondsWithYou, isSelf = false) {
    if (isSelf) {
        return 46;
    }
    const hours = Math.max(0, secondsWithYou) / 3600;
    return Math.max(10, Math.min(38, 9 + Math.sqrt(hours) * 5));
}

/** Edge width from time together: sqrt scale, clamped. */
export function edgeWidth(seconds) {
    const hours = Math.max(0, seconds) / 3600;
    return Math.max(0.6, Math.min(7, 0.6 + Math.sqrt(hours) * 0.9));
}

/** Edge opacity from time together. */
export function edgeOpacity(seconds) {
    const hours = Math.max(0, seconds) / 3600;
    return Math.max(0.12, Math.min(0.8, 0.12 + Math.sqrt(hours) * 0.12));
}

export function formatHours(seconds) {
    const hours = Math.max(0, seconds || 0) / 3600;
    if (hours < 1) {
        return `${Math.round((seconds || 0) / 60)} min`;
    }
    if (hours < 10) {
        return `${hours.toFixed(1)} h`;
    }
    return `${Math.round(hours)} h`;
}

export function formatDate(iso) {
    if (!iso) {
        return '—';
    }
    const ms = parseTs(iso);
    if (ms === null) {
        return '—';
    }
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Translate the engine result into ECharts graph series data.
 *
 * @param {{nodes:Array, edges:Array}} graph
 * @param {object} [opts] {search: string}
 */
export function toEchartsGraph(graph, opts = {}) {
    const search = String(opts.search || '')
        .trim()
        .toLowerCase();

    const nodes = graph.nodes.map((n) => {
        const category = n.isSelf ? 0 : n.isFriend ? 1 : 2;
        const color = CATEGORIES[category].color;
        const hit = search && n.displayName.toLowerCase().includes(search);
        return {
            id: n.key,
            name: n.key,
            displayName: n.displayName || n.key,
            userId: n.userId,
            category,
            categoryName: CATEGORIES[category].name,
            isSelf: n.isSelf,
            isFriend: n.isFriend,
            secondsWithYou: n.secondsWithYou,
            sessionsWithYou: n.sessionsWithYou,
            lastSeenAt: n.lastSeenAt,
            lastLocation: n.lastLocation,
            lastWorldName: n.lastWorldName,
            firstSeenAt: n.firstSeenAt,
            symbolSize: nodeSymbolSize(n.secondsWithYou, n.isSelf),
            value: Math.round(n.secondsWithYou / 3600),
            itemStyle: {
                color,
                borderColor: hit ? '#ffffff' : n.isSelf ? '#f472b6' : 'transparent',
                borderWidth: hit ? 3 : n.isSelf ? 3 : 0,
                opacity: search && !hit ? 0.25 : 1,
                shadowBlur: n.isSelf ? 22 : hit ? 20 : 6,
                shadowColor: color
            },
            // The view decides whether labels render at all; this only marks
            // the nodes worth labelling when they do.
            labelShow: Boolean(n.isSelf || hit || n.secondsWithYou > 3600)
        };
    });

    const links = graph.edges.map((e) => ({
        source: e.a,
        target: e.b,
        seconds: e.seconds,
        sessions: e.sessions,
        value: Math.round(e.seconds / 3600),
        lineStyle: {
            width: edgeWidth(e.seconds),
            opacity: search ? edgeOpacity(e.seconds) * 0.4 : edgeOpacity(e.seconds)
        }
    }));

    return { nodes, links, categories: CATEGORIES.map((c) => ({ name: c.name })) };
}
