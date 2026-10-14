import { afterEach, describe, expect, it, vi } from 'vitest';

import { diffMembers, poolFetch, rowAllowed, toObjects } from '../sync';

afterEach(() => {
    delete window.VRCX_ANDROID;
    delete window.WebApi;
    vi.unstubAllGlobals();
});

describe('poolFetch', () => {
    it('uses the native Android request bridge and parses its response', async () => {
        window.VRCX_ANDROID = true;
        const execute = vi.fn().mockResolvedValue(JSON.stringify({ status: 200, message: '{"ok":true}' }));
        window.WebApi = { ExecuteJson: execute };

        const response = await poolFetch('https://pool.example/v1/test', {
            method: 'POST',
            headers: { Authorization: 'Bearer token' },
            body: '{"value":1}'
        });

        expect(execute).toHaveBeenCalledWith(
            JSON.stringify({
                url: 'https://pool.example/v1/test',
                method: 'POST',
                headers: { Authorization: 'Bearer token' },
                body: '{"value":1}'
            })
        );
        expect(response.ok).toBe(true);
        await expect(response.json()).resolves.toEqual({ ok: true });
    });

    it('surfaces native transport failures', async () => {
        window.VRCX_ANDROID = true;
        window.WebApi = { ExecuteJson: vi.fn().mockResolvedValue('{"status":-1,"message":"offline"}') };

        await expect(poolFetch('https://pool.example/v1/test')).rejects.toThrow('offline');
    });

    it('uses browser fetch on desktop', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);

        await poolFetch('https://pool.example/v1/test');

        expect(fetchMock).toHaveBeenCalledWith('https://pool.example/v1/test', {});
    });
});

const ids = new Set(['usr_a', 'usr_b']);
const names = new Set(['Alice']);

describe('rowAllowed', () => {
    it('accepts rows about members', () => {
        expect(rowAllowed('status', { user_id: 'usr_a' }, ids, names)).toBe(true);
    });
    it('rejects rows about non-members (privacy filter)', () => {
        expect(rowAllowed('status', { user_id: 'usr_fremd' }, ids, names)).toBe(false);
        expect(rowAllowed('gps', { user_id: '' }, ids, names)).toBe(false);
    });
    it('join_leave falls back to display_name only without user_id', () => {
        expect(rowAllowed('join_leave', { user_id: '', display_name: 'Alice' }, ids, names)).toBe(true);
        expect(rowAllowed('join_leave', { user_id: '', display_name: 'Mallory' }, ids, names)).toBe(false);
        expect(rowAllowed('status', { user_id: '', display_name: 'Alice' }, ids, names)).toBe(false);
    });
});

describe('diffMembers (Re-Backfill-Erkennung)', () => {
    const list = [
        { user_id: 'usr_a', display_name: 'Alice' },
        { user_id: 'usr_b', display_name: 'Bob' }
    ];
    it('first sync: nothing known, no backfill', () => {
        const d = diffMembers(null, list);
        expect(d.first).toBe(true);
        expect(d.fresh).toEqual([]);
        expect(d.ids).toEqual(['usr_a', 'usr_b']);
    });
    it('detects a new member', () => {
        const d = diffMembers(['usr_a'], list);
        expect(d.first).toBe(false);
        expect(d.fresh.map((m) => m.user_id)).toEqual(['usr_b']);
    });
    it('no change => no backfill', () => {
        const d = diffMembers(['usr_a', 'usr_b'], list);
        expect(d.fresh).toEqual([]);
    });
    it('member left => no backfill, ids shrink', () => {
        const d = diffMembers(['usr_a', 'usr_b', 'usr_c'], list);
        expect(d.fresh).toEqual([]);
        expect(d.ids).toEqual(['usr_a', 'usr_b']);
    });
});

describe('toObjects', () => {
    it('maps positional rows to named objects', () => {
        const rows = toObjects([['2026-01-01', 'usr_a', 'active']], ['created_at', 'user_id', 'status']);
        expect(rows[0]).toEqual({ created_at: '2026-01-01', user_id: 'usr_a', status: 'active' });
    });
});
