import { describe, expect, it } from 'vitest';
import {
    createPlaylistItem,
    filterPlaylist,
    generateItemId,
    parseWorldInput,
    reorderItems
} from '../engine';

describe('World Hopper Engine & Parsing', () => {
    describe('parseWorldInput', () => {
        it('returns invalid object for empty or non-string input', () => {
            expect(parseWorldInput('')).toEqual({ location: '', worldId: '', instanceId: null, isValid: false });
            expect(parseWorldInput(null)).toEqual({ location: '', worldId: '', instanceId: null, isValid: false });
        });

        it('parses raw world ID', () => {
            const raw = 'wrld_12345678-1234-1234-1234-123456789abc';
            const res = parseWorldInput(raw);
            expect(res.isValid).toBe(true);
            expect(res.worldId).toBe(raw);
            expect(res.location).toBe(raw);
            expect(res.instanceId).toBeNull();
        });

        it('parses world and instance tag', () => {
            const tag = 'wrld_12345678-1234-1234-1234-123456789abc:12345~region(eu)';
            const res = parseWorldInput(tag);
            expect(res.isValid).toBe(true);
            expect(res.location).toBe(tag);
            expect(res.worldId).toBe('wrld_12345678-1234-1234-1234-123456789abc');
            expect(res.instanceId).toBe('12345~region(eu)');
        });

        it('parses VRChat home launch URL', () => {
            const url = 'https://vrchat.com/home/launch?worldId=wrld_abc123&instanceId=999~region(jp)';
            const res = parseWorldInput(url);
            expect(res.isValid).toBe(true);
            expect(res.location).toBe('wrld_abc123:999~region(jp)');
            expect(res.worldId).toBe('wrld_abc123');
            expect(res.instanceId).toBe('999~region(jp)');
        });

        it('parses VRChat world details page URL', () => {
            const url = 'https://vrchat.com/home/world/wrld_def456';
            const res = parseWorldInput(url);
            expect(res.isValid).toBe(true);
            expect(res.location).toBe('wrld_def456');
            expect(res.worldId).toBe('wrld_def456');
        });

        it('parses launch URI with id query param', () => {
            const uri = 'vrchat://launch?ref=vrchat.com&id=wrld_789:123';
            const res = parseWorldInput(uri);
            expect(res.isValid).toBe(true);
            expect(res.location).toBe('wrld_789:123');
            expect(res.worldId).toBe('wrld_789');
            expect(res.instanceId).toBe('123');
        });
    });

    describe('createPlaylistItem', () => {
        it('creates structured playlist item object', () => {
            const item = createPlaylistItem({
                location: 'wrld_test:123',
                name: 'Test World',
                note: 'Meet friend',
                status: 'pending',
                orderIndex: 2
            });

            expect(item.id).toMatch(/^item_/);
            expect(item.location).toBe('wrld_test:123');
            expect(item.worldId).toBe('wrld_test');
            expect(item.instanceId).toBe('123');
            expect(item.name).toBe('Test World');
            expect(item.note).toBe('Meet friend');
            expect(item.status).toBe('pending');
            expect(item.orderIndex).toBe(2);
            expect(typeof item.createdAt).toBe('string');
        });
    });

    describe('reorderItems', () => {
        it('reorders items and updates orderIndex', () => {
            const items = [
                { id: '1', location: 'a', orderIndex: 0 },
                { id: '2', location: 'b', orderIndex: 1 },
                { id: '3', location: 'c', orderIndex: 2 }
            ];

            const reordered = reorderItems(items, 0, 2);
            expect(reordered.map((i) => i.id)).toEqual(['2', '3', '1']);
            expect(reordered.map((i) => i.orderIndex)).toEqual([0, 1, 2]);
        });

        it('returns clone if indices are out of bounds', () => {
            const items = [{ id: '1', orderIndex: 0 }];
            expect(reorderItems(items, -1, 0)).toEqual(items);
            expect(reorderItems(items, 0, 5)).toEqual(items);
        });
    });

    describe('filterPlaylist', () => {
        const samplePlaylist = [
            { id: '1', name: 'Black Cat', location: 'wrld_bc', note: 'Hangout', status: 'pending', worldId: 'wrld_bc' },
            { id: '2', name: 'Midnight Rooftop', location: 'wrld_mr', note: 'Relax', status: 'visited', worldId: 'wrld_mr' },
            { id: '3', name: 'Great Pug', location: 'wrld_gp', note: 'Drinking', status: 'pending', worldId: 'wrld_gp' }
        ];

        it('filters by status', () => {
            const pending = filterPlaylist(samplePlaylist, { statusFilter: 'pending' });
            expect(pending.length).toBe(2);
            expect(pending.map((i) => i.id)).toEqual(['1', '3']);

            const visited = filterPlaylist(samplePlaylist, { statusFilter: 'visited' });
            expect(visited.length).toBe(1);
            expect(visited[0].id).toBe('2');
        });

        it('filters by search query', () => {
            const catRes = filterPlaylist(samplePlaylist, { searchQuery: 'cat' });
            expect(catRes.length).toBe(1);
            expect(catRes[0].name).toBe('Black Cat');

            const noteRes = filterPlaylist(samplePlaylist, { searchQuery: 'Relax' });
            expect(noteRes.length).toBe(1);
            expect(noteRes[0].name).toBe('Midnight Rooftop');

            const worldIdRes = filterPlaylist(samplePlaylist, { searchQuery: 'wrld_gp' });
            expect(worldIdRes.length).toBe(1);
            expect(worldIdRes[0].name).toBe('Great Pug');
        });
    });
});
