// ============================================================================
// Regression guard for the "filter change re-shuffles the whole graph" bug.
//
// The view renders the force layout once and then reuses the coordinates it
// settled on. These tests drive a real ECharts instance the same way
// OrbitGraphView does, and assert the two properties the UI depends on:
//   * a filter change must not move a surviving node, at all
//   * a filter change must not throw away the user's pan/zoom
//
// ECharts re-creates its force simulation on every setOption and re-anneals it
// from the initial friction, so `layout: 'force'` can never be stable across
// updates no matter how the nodes are seeded. That is precisely why the view
// switches to `layout: 'none'` once it has coordinates to carry.
// ============================================================================

import { describe, expect, it } from 'vitest';
import * as echarts from 'echarts';

import { applyNodePositions, toEchartsGraph } from '../engine';

// --------------------------------------------------------------- fixtures --

function person(i, seconds) {
    return {
        key: `usr_${i}`,
        userId: `usr_${i}`,
        displayName: `P${i}`,
        isSelf: false,
        isFriend: i % 3 === 0,
        secondsWithYou: seconds,
        sessionsWithYou: 3,
        lastSeenAt: null,
        firstSeenAt: null,
        lastLocation: '',
        lastWorldName: ''
    };
}

/** A star around "You" plus a ring between neighbours — the real shape. */
function fixture(count) {
    const nodes = [
        {
            key: 'me',
            userId: 'usr_me',
            displayName: 'Me',
            isSelf: true,
            isFriend: false,
            secondsWithYou: 360000,
            sessionsWithYou: 40,
            lastSeenAt: null,
            firstSeenAt: null,
            lastLocation: '',
            lastWorldName: ''
        }
    ];
    const edges = [];
    for (let i = 0; i < count; i++) {
        nodes.push(person(i, 3600 * (count - i)));
        edges.push({ a: 'me', b: `usr_${i}`, seconds: 3600 * (count - i), sessions: 3 });
        if (i > 0) {
            edges.push({ a: `usr_${i - 1}`, b: `usr_${i}`, seconds: 1800, sessions: 1 });
        }
    }
    return { nodes, edges };
}

/** Keep the heaviest `n` people (what the top-N filter does). */
function topN(graph, n) {
    const kept = graph.nodes.filter((x) => !x.isSelf).slice(0, n);
    const ids = new Set([...kept.map((x) => x.key), 'me']);
    return {
        nodes: [graph.nodes[0], ...kept],
        edges: graph.edges.filter((e) => ids.has(e.a) && ids.has(e.b))
    };
}

// ------------------------------------------------------------------ harness --

function makeChart() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return echarts.init(el, 'dark', { width: 900, height: 600, renderer: 'svg' });
}

function seriesModel(chart) {
    return chart.getModel().getSeriesByIndex(0);
}

function captureLayout(chart, into = new Map()) {
    const data = seriesModel(chart).getData();
    data.each((idx) => {
        const p = data.getItemLayout(idx);
        if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
            into.set(data.getId(idx), [p[0], p[1]]);
        }
    });
    return into;
}

function readRoam(chart) {
    const model = seriesModel(chart);
    const zoom = model.get('zoom');
    const center = model.get('center');
    return {
        zoom: Number.isFinite(zoom) ? zoom : 1,
        center: Array.isArray(center) ? center.slice() : null
    };
}

/** Mirrors OrbitGraphView.updateChart(). */
function render(chart, graph, { positions, useForce }) {
    const series = toEchartsGraph(graph);
    const nodes = useForce ? series.nodes : applyNodePositions(series.nodes, series.links, positions);
    const roam = useForce ? { zoom: 1, center: null } : readRoam(chart);
    chart.setOption(
        {
            series: [
                {
                    id: 'orbit',
                    name: 'Orbit',
                    type: 'graph',
                    layout: useForce ? 'force' : 'none',
                    data: nodes,
                    links: series.links,
                    categories: series.categories,
                    roam: true,
                    draggable: true,
                    zoom: roam.zoom,
                    ...(roam.center ? { center: roam.center } : {}),
                    force: {
                        repulsion: 260,
                        gravity: 0.08,
                        edgeLength: [40, 160],
                        friction: 0.35,
                        layoutAnimation: false
                    }
                }
            ]
        },
        true
    );
    return series;
}

// -------------------------------------------------------------------- tests --

describe('orbit graph layout stability', () => {
    it('settles the force layout synchronously on first render', () => {
        const chart = makeChart();
        const graph = fixture(40);
        render(chart, graph, { positions: new Map(), useForce: true });
        const positions = captureLayout(chart);
        // Every node ends up with a real coordinate in one pass — no frames of
        // simulation are painted on the way there.
        expect(positions.size).toBe(41);
        for (const [, p] of positions) {
            expect(Number.isFinite(p[0])).toBe(true);
            expect(Number.isFinite(p[1])).toBe(true);
        }
        chart.dispose();
    });

    it('does not move a single surviving node when a filter removes nodes', () => {
        const chart = makeChart();
        const graph = fixture(40);
        render(chart, graph, { positions: new Map(), useForce: true });
        const positions = captureLayout(chart);

        render(chart, topN(graph, 25), { positions, useForce: false });
        const after = captureLayout(chart, new Map());

        expect(after.size).toBe(26);
        for (const [id, p] of after) {
            const before = positions.get(id);
            expect(before).toBeDefined();
            expect(p[0]).toBe(before[0]);
            expect(p[1]).toBe(before[1]);
        }
        chart.dispose();
    });

    it('does not move surviving nodes when a filter adds nodes back', () => {
        const chart = makeChart();
        const graph = fixture(40);
        render(chart, graph, { positions: new Map(), useForce: true });
        let positions = captureLayout(chart);

        render(chart, topN(graph, 20), { positions, useForce: false });
        positions = captureLayout(chart, positions);
        const narrowed = captureLayout(chart, new Map());

        // widen the filter again — the 20 that stayed must not budge
        render(chart, topN(graph, 35), { positions, useForce: false });
        const widened = captureLayout(chart, new Map());

        expect(widened.size).toBe(36);
        for (const [id, p] of narrowed) {
            expect(p[0]).toBe(widened.get(id)[0]);
            expect(p[1]).toBe(widened.get(id)[1]);
        }
        chart.dispose();
    });

    it('places a returning node back where it used to be', () => {
        const chart = makeChart();
        const graph = fixture(30);
        render(chart, graph, { positions: new Map(), useForce: true });
        const positions = captureLayout(chart);
        const original = positions.get('usr_29');

        render(chart, topN(graph, 10), { positions, useForce: false });
        captureLayout(chart, positions); // usr_29 is gone but stays remembered
        render(chart, graph, { positions, useForce: false });

        const back = captureLayout(chart, new Map()).get('usr_29');
        expect(back).toEqual(original);
        chart.dispose();
    });

    it('keeps a pure restyle (search highlight) perfectly still', () => {
        const chart = makeChart();
        const graph = fixture(30);
        render(chart, graph, { positions: new Map(), useForce: true });
        const positions = captureLayout(chart);

        // same nodes, different styling
        const series = toEchartsGraph(graph, { search: 'P1' });
        const nodes = applyNodePositions(series.nodes, series.links, positions);
        chart.setOption(
            {
                series: [
                    {
                        id: 'orbit',
                        name: 'Orbit',
                        type: 'graph',
                        layout: 'none',
                        data: nodes,
                        links: series.links,
                        categories: series.categories,
                        roam: true
                    }
                ]
            },
            true
        );
        const after = captureLayout(chart, new Map());
        for (const [id, p] of after) {
            expect(p).toEqual(positions.get(id));
        }
        chart.dispose();
    });

    it('survives a filter change without losing the user pan/zoom', () => {
        const chart = makeChart();
        const graph = fixture(30);
        render(chart, graph, { positions: new Map(), useForce: true });
        const positions = captureLayout(chart);
        render(chart, graph, { positions, useForce: false });

        chart.dispatchAction({ type: 'graphRoam', zoom: 1.6, originX: 450, originY: 300 });
        const roamed = readRoam(chart);
        expect(roamed.zoom).toBeGreaterThan(1.2);

        render(chart, topN(graph, 20), { positions, useForce: false });
        const kept = readRoam(chart);
        expect(kept.zoom).toBeCloseTo(roamed.zoom, 6);
        expect(kept.center[0]).toBeCloseTo(roamed.center[0], 6);
        expect(kept.center[1]).toBeCloseTo(roamed.center[1], 6);
        chart.dispose();
    });

    it('shows the force layout really is unstable across updates (why layout:none exists)', () => {
        const chart = makeChart();
        const graph = fixture(30);
        render(chart, graph, { positions: new Map(), useForce: true });
        const first = captureLayout(chart, new Map());
        // identical data, force layout again → everything moves, because the
        // simulation restarts its annealing from scratch
        render(chart, graph, { positions: new Map(), useForce: true });
        const second = captureLayout(chart, new Map());
        const moved = [...second].filter(([id, p]) => {
            const b = first.get(id);
            return Math.hypot(p[0] - b[0], p[1] - b[1]) > 20;
        });
        expect(moved.length).toBeGreaterThan(10);
        chart.dispose();
    });
});
