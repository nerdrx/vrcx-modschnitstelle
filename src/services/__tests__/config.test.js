// Mock router to avoid transitive i18n.global error from columns.jsx
vi.mock('../../plugins/router.js', () => ({
    router: { beforeEach: vi.fn(), push: vi.fn() },
    initRouter: vi.fn()
}));

vi.mock('../sqlite.js', () => ({ default: { executeNonQuery: vi.fn(), execute: vi.fn() } }));

import { ConfigRepository, transformKey } from '../config.js';
import sqlite from '../sqlite.js';

describe('transformKey', () => {
    test('lowercases and prefixes with config:', () => {
        expect(transformKey('Foo')).toBe('config:foo');
    });

    test('handles already lowercase key', () => {
        expect(transformKey('bar')).toBe('config:bar');
    });

    test('handles key with mixed case and numbers', () => {
        expect(transformKey('MyKey123')).toBe('config:mykey123');
    });

    test('handles empty string', () => {
        expect(transformKey('')).toBe('config:');
    });

    test('converts non-string values via String()', () => {
        expect(transformKey(42)).toBe('config:42');
        expect(transformKey(null)).toBe('config:null');
    });
});

describe('Android private configuration', () => {
    afterEach(() => {
        delete window.VRCX_ANDROID;
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    test('stores session settings through encrypted native storage, not SQLite', async () => {
        window.VRCX_ANDROID = true;
        const native = { Set: vi.fn(), Get: vi.fn().mockResolvedValue('{"session":"opaque"}'), Remove: vi.fn() };
        vi.stubGlobal('VRCXStorage', native);
        const config = new ConfigRepository();
        await config.setString('savedCredentials', '{"session":"opaque"}');
        expect(native.Set).toHaveBeenCalledWith('config:savedcredentials', '{"session":"opaque"}');
        expect(await config.getString('savedCredentials')).toBe('{"session":"opaque"}');
        await config.remove('savedCredentials');
        expect(native.Remove).toHaveBeenCalledWith('config:savedcredentials');
        expect(sqlite.executeNonQuery).not.toHaveBeenCalled();
        expect(sqlite.execute).not.toHaveBeenCalled();
    });
});
