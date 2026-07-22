import { describe, expect, it } from 'vitest';
import {
    CATEGORIES,
    buildGraphFromFriends,
    computeNetworkMetrics,
    filterGraphData,
    generateMockFriendsNetwork
} from '../engine';

describe('Orbit Graph Engine', () => {
    it('defines expected category mappings', () => {
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(5);
        expect(CATEGORIES.some((c) => c.name === 'VIP')).toBe(true);
        expect(CATEGORIES.some((c) => c.name === 'Online')).toBe(true);
    });

    it('generates a rich mock network dataset', () => {
        const mock = generateMockFriendsNetwork();
        expect(mock.nodes.length).toBeGreaterThan(15);
        expect(mock.links.length).toBeGreaterThan(15);
        expect(mock.nodes[0].isCenter).toBe(true);
    });

    it('builds graph dataset from Pinia friend store map', () => {
        const mockFriendsMap = new Map([
            [
                'usr_1',
                {
                    displayName: 'Alice',
                    isFavorite: true,
                    state: 'online',
                    location: 'The Black Cat'
                }
            ],
            [
                'usr_2',
                {
                    displayName: 'Bob',
                    isFavorite: false,
                    state: 'online',
                    location: 'The Black Cat'
                }
            ],
            [
                'usr_3',
                {
                    displayName: 'Charlie',
                    isFavorite: false,
                    state: 'offline',
                    location: 'Offline'
                }
            ]
        ]);

        const currentUser = { id: 'usr_me', displayName: 'Tester' };
        const graph = buildGraphFromFriends(mockFriendsMap, currentUser);

        expect(graph).not.toBeNull();
        expect(graph.nodes.length).toBe(4); // center + 3 friends
        expect(
            graph.nodes.find((n) => n.displayName === 'Alice').categoryName
        ).toBe('VIP');
        // Alice and Bob share 'The Black Cat' location, so there should be a link between them
        expect(graph.links.length).toBe(4); // 3 center links + 1 location cluster link
    });

    it('filters graph data by search query and categories', () => {
        const mock = generateMockFriendsNetwork();

        const filteredByQuery = filterGraphData(mock, 'Kira', []);
        expect(
            filteredByQuery.nodes.some((n) => n.displayName === 'Kira_VR')
        ).toBe(true);
        expect(
            filteredByQuery.nodes.some((n) => n.displayName === 'Astraea')
        ).toBe(false);

        const filteredByCat = filterGraphData(mock, '', ['VIP']);
        expect(
            filteredByCat.nodes.every(
                (n) => n.isCenter || n.categoryName === 'VIP'
            )
        ).toBe(true);
    });

    it('computes network metrics accurately', () => {
        const mock = generateMockFriendsNetwork();
        const metrics = computeNetworkMetrics(mock);

        expect(metrics.totalFriends).toBeGreaterThan(15);
        expect(metrics.onlineCount).toBeGreaterThan(0);
        expect(metrics.connectionsCount).toBeGreaterThan(0);
    });
});
