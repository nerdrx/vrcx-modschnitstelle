import { describe, expect, it, beforeEach } from 'vitest';
import {
    initTables,
    insertSnapshot,
    getUserHistory,
    getFeedHistory,
    backfillFromFeed,
    getCombinedUserHistory
} from '../db';

describe('Profile Archiver DB', () => {
    let mockCtx;
    let mockExecCalls;
    let mockQueryResults;

    beforeEach(() => {
        mockExecCalls = [];
        mockQueryResults = new Map();

        mockCtx = {
            db: {
                prefix: () => 'usr123_mod_profilearchiver',
                corePrefix: () => 'usr123',
                exec: async (sql, args) => {
                    mockExecCalls.push({ sql, args });
                    return true;
                },
                query: async (sql, args) => {
                    for (const [key, rows] of mockQueryResults.entries()) {
                        if (sql.includes(key)) {
                            return rows;
                        }
                    }
                    return [];
                }
            }
        };
    });

    it('initTables creates table and index with correct prefix', async () => {
        await initTables(mockCtx);
        expect(mockExecCalls.length).toBe(2);
        expect(mockExecCalls[0].sql).toContain('usr123_mod_profilearchiver_snapshots');
        expect(mockExecCalls[1].sql).toContain('usr123_mod_profilearchiver_snapshots_user_created_idx');
    });

    it('insertSnapshot handles user_id and parameters correctly', async () => {
        await insertSnapshot(mockCtx, {
            user_id: 'usr_abc123',
            display_name: 'TestUser',
            bio: 'Hello world',
            status: 'active: testing',
            created_at: '2026-07-22T18:00:00Z'
        });

        expect(mockExecCalls.length).toBe(1);
        expect(mockExecCalls[0].args).toEqual({
            '@user_id': 'usr_abc123',
            '@display_name': 'TestUser',
            '@bio': 'Hello world',
            '@status': 'active: testing',
            '@created_at': '2026-07-22T18:00:00Z'
        });
    });

    it('getUserHistory formats returned positional rows correctly', async () => {
        mockQueryResults.set('usr123_mod_profilearchiver_snapshots', [
            [1, 'usr_abc123', 'TestUser', 'Bio text', 'active', '2026-07-22T18:00:00Z']
        ]);

        const history = await getUserHistory(mockCtx, 'usr_abc123');
        expect(history.length).toBe(1);
        expect(history[0]).toEqual({
            id: 1,
            user_id: 'usr_abc123',
            userId: 'usr_abc123',
            display_name: 'TestUser',
            displayName: 'TestUser',
            bio: 'Bio text',
            status: 'active',
            created_at: '2026-07-22T18:00:00Z',
            createdAt: '2026-07-22T18:00:00Z'
        });
    });

    it('getFeedHistory maps core bio and status tables', async () => {
        mockQueryResults.set('_feed_bio', [
            [10, '2026-07-22T12:00:00Z', 'usr_abc123', 'TestUser', 'New Bio', 'Old Bio']
        ]);
        mockQueryResults.set('_feed_status', [
            [20, '2026-07-22T14:00:00Z', 'usr_abc123', 'TestUser', 'join me', 'vibing', 'active', 'chilling']
        ]);

        const items = await getFeedHistory(mockCtx, 'usr_abc123');
        expect(items.length).toBe(2);

        const bioItem = items.find((i) => i.type === 'bio');
        expect(bioItem).toBeDefined();
        expect(bioItem.bio).toBe('New Bio');

        const statusItem = items.find((i) => i.type === 'status');
        expect(statusItem).toBeDefined();
        expect(statusItem.status).toBe('join me: vibing');
    });

    it('getCombinedUserHistory merges and sorts by created_at DESC', async () => {
        mockQueryResults.set('usr123_mod_profilearchiver_snapshots', [
            [1, 'usr_abc123', 'TestUser', 'Snap Bio', '', '2026-07-22T10:00:00Z']
        ]);
        mockQueryResults.set('_feed_bio', [
            [10, '2026-07-22T15:00:00Z', 'usr_abc123', 'TestUser', 'Feed Bio', '']
        ]);
        mockQueryResults.set('_feed_status', []);

        const combined = await getCombinedUserHistory(mockCtx, 'usr_abc123');
        expect(combined.length).toBe(2);
        expect(combined[0].bio).toBe('Feed Bio');
        expect(combined[1].bio).toBe('Snap Bio');
    });
});
