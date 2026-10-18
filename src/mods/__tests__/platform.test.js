import { describe, expect, test } from 'vitest';

import { isAndroidHost } from '../platform';

describe('isAndroidHost', () => {
    test('detects the Android bridge and pre-bootstrap marker', () => {
        expect(isAndroidHost({ NXAndroid: {} })).toBe(true);
        expect(isAndroidHost({ VRCX_ANDROID: true })).toBe(true);
    });

    test('does not classify desktop or false markers as Android', () => {
        expect(isAndroidHost({ VRCX_ANDROID: false })).toBe(false);
        expect(isAndroidHost({})).toBe(false);
        expect(isAndroidHost(undefined)).toBe(false);
    });
});
