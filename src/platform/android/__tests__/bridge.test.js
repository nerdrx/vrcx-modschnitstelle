import { afterEach, describe, expect, it, vi } from 'vitest';
import { installAndroidBridge } from '../bridge';

describe('Android IPC contract', () => {
    afterEach(() => vi.useRealTimers());

    it('preserves named SQL values across the JSON boundary and resolves native rows', async () => {
        const target = {};
        let message;
        const { call } = installAndroidBridge(
            {
                postMessage: (json) => {
                    message = JSON.parse(json);
                }
            },
            target
        );
        const result = call('SQLite', 'ExecuteJson', [
            'SELECT @name, @n, @null',
            new Map([
                ['@name', "a' OR 1=1 --"],
                ['@n', 0],
                ['@null', null]
            ])
        ]);
        expect(message.args[1]).toEqual({ '@name': "a' OR 1=1 --", '@n': 0, '@null': null });
        target.__nxAndroidResult({ id: message.id, result: '[["value",0,null]]' });
        expect(await result).toBe('[["value",0,null]]');
    });

    it('rejects native failures and ignores duplicate or unknown replies', async () => {
        const target = {};
        let message;
        const { call } = installAndroidBridge(
            {
                postMessage: (json) => {
                    message = JSON.parse(json);
                }
            },
            target
        );
        const result = call('WebApi', 'ExecuteJson', ['{}']);
        const rejected = expect(result).rejects.toThrow('HTTPS is required');
        target.__nxAndroidResult({ id: message.id + 1, result: 'wrong' });
        target.__nxAndroidResult({ id: message.id, error: 'HTTPS is required' });
        target.__nxAndroidResult({ id: message.id, result: 'late' });
        await rejected;
    });

    it('times out a missing host response so views do not remain stuck forever', async () => {
        vi.useFakeTimers();
        const { call } = installAndroidBridge({ postMessage() {} }, {});
        const result = call('SQLite', 'ExecuteJson', ['SELECT 1']);
        const rejected = expect(result).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(120_000);
        await rejected;
    });

    it('fails before boot when loaded outside the Android host', () => {
        expect(() => installAndroidBridge(null, {})).toThrow('Android host is missing');
    });
});
