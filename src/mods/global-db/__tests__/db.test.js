import { afterEach, describe, expect, test, vi } from 'vitest';

import { initTables, kvGet, kvSet } from '../db';

describe('Global DB settings storage', () => {
    afterEach(() => {
        delete window.VRCX_ANDROID;
        delete window.NXAndroid;
        delete window.VRCXStorage;
    });

    test('uses account-prefixed secure Android storage for settings', async () => {
        window.VRCX_ANDROID = true;
        const storage = (window.VRCXStorage = {
            Get: vi.fn().mockResolvedValue('{"token":"secret"}'),
            Set: vi.fn().mockResolvedValue(undefined)
        });
        const ctx = { db: { prefix: () => 'account_mod_globaldb' } };

        expect(await kvGet(ctx, 'settings', {})).toEqual({ token: 'secret' });
        await kvSet(ctx, 'chat_settings', { dndManual: true });

        expect(storage.Get).toHaveBeenCalledWith('account_mod_globaldb_settings');
        expect(storage.Set).toHaveBeenCalledWith('account_mod_globaldb_chat_settings', '{"dndManual":true}');
    });

    test('keeps desktop settings in SQLite and skips only Android KV table', async () => {
        const query = vi.fn().mockResolvedValue([['{"enabled":true}']]);
        const exec = vi.fn().mockResolvedValue(undefined);
        const ctx = { db: { prefix: () => 'account_mod_globaldb', query, exec } };

        expect(await kvGet(ctx, 'settings', {})).toEqual({ enabled: true });
        await kvSet(ctx, 'settings', { enabled: false });
        expect(query).toHaveBeenCalledOnce();
        expect(exec).toHaveBeenCalledOnce();

        window.VRCX_ANDROID = true;
        window.VRCXStorage = { Get: vi.fn().mockResolvedValue(''), Set: vi.fn() };
        exec.mockClear();
        await initTables(ctx);
        expect(exec.mock.calls.some(([sql]) => sql.includes('_kv'))).toBe(false);
        expect(exec.mock.calls.some(([sql]) => sql.includes('_p_status'))).toBe(true);
    });
});
