import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
    configRepository: {
        getString: vi.fn(),
        setString: vi.fn()
    },
    changeLogRemoveLinks: vi.fn((value) => value),
    toast: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn()
    }
}));

vi.mock('../../services/config', () => ({
    default: mocks.configRepository
}));

vi.mock('../../shared/utils', () => ({
    changeLogRemoveLinks: (...args) => mocks.changeLogRemoveLinks(...args)
}));

vi.mock('vue-sonner', () => ({
    toast: mocks.toast
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key) => key,
        locale: require('vue').ref('en')
    })
}));

function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

import { useVRCXUpdaterStore } from '../vrcxUpdater';

describe('useVRCXUpdaterStore', () => {
    beforeEach(async () => {
        mocks.configRepository.getString.mockImplementation((key, defaultValue) => {
            if (key === 'VRCX_autoUpdateVRCX') {
                return Promise.resolve('Off');
            }
            if (key === 'VRCX_id') {
                return Promise.resolve('test-vrcx-id');
            }
            if (key === 'VRCX_lastVRCXVersion') {
                return Promise.resolve('2026.1.0');
            }
            return Promise.resolve(defaultValue ?? '');
        });
        mocks.configRepository.setString.mockResolvedValue(undefined);

        globalThis.AppApi = {
            GetVersion: vi.fn().mockResolvedValue('2026.1.0')
        };

        setActivePinia(createPinia());
        useVRCXUpdaterStore();
        await flushPromises();
        vi.clearAllMocks();
    });

    test('sets autoUpdateVRCX to Off, clears pending flag, and persists config', async () => {
        const store = useVRCXUpdaterStore();
        store.pendingVRCXUpdate = true;

        await store.setAutoUpdateVRCX('Off');

        expect(store.autoUpdateVRCX).toBe('Off');
        expect(store.pendingVRCXUpdate).toBe(false);
        expect(mocks.configRepository.setString).toHaveBeenCalledWith('VRCX_autoUpdateVRCX', 'Off');
    });

    test('updates autoUpdateVRCX for non-Off values and keeps pending flag', async () => {
        const store = useVRCXUpdaterStore();
        store.pendingVRCXUpdate = true;

        await store.setAutoUpdateVRCX('Notify');

        expect(store.autoUpdateVRCX).toBe('Notify');
        expect(store.pendingVRCXUpdate).toBe(true);
        expect(mocks.configRepository.setString).toHaveBeenCalledWith('VRCX_autoUpdateVRCX', 'Notify');
    });

    test('checks this fork for updates on both Stable and Nightly', async () => {
        const store = useVRCXUpdaterStore();
        const release = {
            name: 'VRCX 2026.09.16.m1',
            published_at: '2026-10-03T00:00:00Z',
            body: 'Updated from base VRCX',
            assets: []
        };
        const execute = vi.fn().mockResolvedValue({ status: 200, data: JSON.stringify(release) });
        vi.stubGlobal('webApiService', { execute });
        store.appVersion = 'VRCX 2026.07.18.m19';
        store.autoUpdateVRCX = 'Off';

        try {
            for (const branch of ['Stable', 'Nightly']) {
                store.branch = branch;
                expect(await store.checkForVRCXUpdate()).toBe(true);
                expect(execute).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        url: 'https://api.github.com/repos/nerdrx/vrcx-modschnitstelle/releases/latest',
                        method: 'GET'
                    })
                );
                expect(store.changeLogDialog.buildName).toBe(release.name);

                execute.mockResolvedValueOnce({ status: 200, data: JSON.stringify([release]) });
                await store.loadBranchVersions();
                expect(execute).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        url: 'https://api.github.com/repos/nerdrx/vrcx-modschnitstelle/releases',
                        method: 'GET'
                    })
                );
            }
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
