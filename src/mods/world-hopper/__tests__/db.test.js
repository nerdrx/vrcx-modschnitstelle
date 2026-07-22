import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearPlaylist,
    deletePlaylistItem,
    getPlaylist,
    initTables,
    savePlaylistItem,
    updatePlaylistOrder
} from '../db';

describe('World Hopper DB Persistence', () => {
    let mockCtx;
    let mockExecCalls;
    let storedRows;

    beforeEach(() => {
        mockExecCalls = [];
        storedRows = [];

        mockCtx = {
            db: {
                prefix: () => 'usr123_mod_worldhopper',
                exec: async (sql, args) => {
                    mockExecCalls.push({ sql, args });

                    if (sql.includes('INSERT OR REPLACE INTO')) {
                        const existingIdx = storedRows.findIndex((r) => r[0] === args['@id']);
                        const newRow = [
                            args['@id'],
                            args['@location'],
                            args['@world_id'],
                            args['@name'],
                            args['@note'],
                            args['@status'],
                            args['@order_index'],
                            args['@created_at']
                        ];

                        if (existingIdx >= 0) {
                            storedRows[existingIdx] = newRow;
                        } else {
                            storedRows.push(newRow);
                        }
                    } else if (sql.includes('DELETE FROM') && args?.['@id']) {
                        storedRows = storedRows.filter((r) => r[0] !== args['@id']);
                    } else if (sql.includes('DELETE FROM') && sql.includes("status = 'visited'")) {
                        storedRows = storedRows.filter((r) => r[5] !== 'visited');
                    } else if (sql.includes('DELETE FROM')) {
                        storedRows = [];
                    }

                    return true;
                },
                query: async (sql, args) => {
                    if (sql.includes('usr123_mod_worldhopper_playlist')) {
                        return [...storedRows].sort((a, b) => a[6] - b[6]);
                    }
                    return [];
                }
            }
        };
    });

    it('initTables creates playlist table and order index with mod prefix', async () => {
        await initTables(mockCtx);
        expect(mockExecCalls.length).toBe(2);
        expect(mockExecCalls[0].sql).toContain('usr123_mod_worldhopper_playlist');
        expect(mockExecCalls[1].sql).toContain('usr123_mod_worldhopper_playlist_order_idx');
    });

    it('savePlaylistItem inserts and updates item correctly', async () => {
        const item = {
            id: 'item_1',
            location: 'wrld_123:456',
            worldId: 'wrld_123',
            name: 'Test World',
            note: 'My Note',
            status: 'pending',
            orderIndex: 0,
            createdAt: '2026-07-22T18:00:00Z'
        };

        await savePlaylistItem(mockCtx, item);
        const playlist = await getPlaylist(mockCtx);

        expect(playlist.length).toBe(1);
        expect(playlist[0]).toEqual({
            id: 'item_1',
            location: 'wrld_123:456',
            worldId: 'wrld_123',
            name: 'Test World',
            note: 'My Note',
            status: 'pending',
            orderIndex: 0,
            createdAt: '2026-07-22T18:00:00Z'
        });
    });

    it('deletePlaylistItem removes specified item', async () => {
        await savePlaylistItem(mockCtx, { id: 'item_1', location: 'wrld_1', worldId: 'wrld_1', status: 'pending', orderIndex: 0 });
        await savePlaylistItem(mockCtx, { id: 'item_2', location: 'wrld_2', worldId: 'wrld_2', status: 'pending', orderIndex: 1 });

        await deletePlaylistItem(mockCtx, 'item_1');

        const playlist = await getPlaylist(mockCtx);
        expect(playlist.length).toBe(1);
        expect(playlist[0].id).toBe('item_2');
    });

    it('updatePlaylistOrder updates orderIndex for items', async () => {
        const item1 = { id: 'item_1', location: 'wrld_1', worldId: 'wrld_1', status: 'pending', orderIndex: 0 };
        const item2 = { id: 'item_2', location: 'wrld_2', worldId: 'wrld_2', status: 'pending', orderIndex: 1 };
        await savePlaylistItem(mockCtx, item1);
        await savePlaylistItem(mockCtx, item2);

        await updatePlaylistOrder(mockCtx, [item2, item1]);

        const playlist = await getPlaylist(mockCtx);
        expect(playlist[0].id).toBe('item_2');
        expect(playlist[1].id).toBe('item_1');
    });

    it('clearPlaylist clears visited or all items', async () => {
        await savePlaylistItem(mockCtx, { id: 'item_1', location: 'wrld_1', worldId: 'wrld_1', status: 'visited', orderIndex: 0 });
        await savePlaylistItem(mockCtx, { id: 'item_2', location: 'wrld_2', worldId: 'wrld_2', status: 'pending', orderIndex: 1 });

        await clearPlaylist(mockCtx, 'visited');
        let playlist = await getPlaylist(mockCtx);
        expect(playlist.length).toBe(1);
        expect(playlist[0].id).toBe('item_2');

        await clearPlaylist(mockCtx, 'all');
        playlist = await getPlaylist(mockCtx);
        expect(playlist.length).toBe(0);
    });
});
