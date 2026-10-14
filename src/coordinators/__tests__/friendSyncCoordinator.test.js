import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    authStore: {
        handleLogoutEvent: vi.fn()
    },
    friendStore: {
        setIsRefreshFriendsLoading: vi.fn((value) => {
            mocks.friendStore.isRefreshFriendsLoading = value;
        }),
        isRefreshFriendsLoading: false,
        resetFriendLog: vi.fn(),
        initFriendLog: vi.fn(),
        getFriendLog: vi.fn(),
        friends: new Map(),
        tryApplyFriendOrder: vi.fn(),
        getAllUserStats: vi.fn(),
        migrateFriendLog: vi.fn()
    },
    updateLoopStore: {
        nextCurrentUserRefresh: 300
    },
    userStore: {
        currentUser: { id: 'usr_test' }
    },
    configRepository: {
        getBool: vi.fn()
    },
    watchState: {
        isFriendsLoaded: false,
        isLoggedIn: true
    },
    appDebug: {
        dontLogMeOut: false
    },
    toastError: vi.fn(),
    getCurrentUser: vi.fn(),
    reconnectWebSocket: vi.fn(),
    syncFriendSearchIndex: vi.fn(),
    migrateMemos: vi.fn()
}));

vi.mock('vue-sonner', () => ({
    toast: { error: (...args) => mocks.toastError(...args) }
}));

vi.mock('../../services/appConfig', () => ({ AppDebug: mocks.appDebug }));
vi.mock('../../plugins/i18n', () => ({ i18n: { global: { t: (key) => key } } }));
vi.mock('../memoCoordinator', () => ({ migrateMemos: (...args) => mocks.migrateMemos(...args) }));
vi.mock('../searchIndexCoordinator', () => ({
    syncFriendSearchIndex: (...args) => mocks.syncFriendSearchIndex(...args)
}));
vi.mock('../../services/websocket', () => ({ reconnectWebSocket: (...args) => mocks.reconnectWebSocket(...args) }));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mocks.authStore }));
vi.mock('../../stores/friend', () => ({ useFriendStore: () => mocks.friendStore }));
vi.mock('../../stores/updateLoop', () => ({ useUpdateLoopStore: () => mocks.updateLoopStore }));
vi.mock('../../stores/user', () => ({ useUserStore: () => mocks.userStore }));
vi.mock('../userCoordinator', () => ({ getCurrentUser: (...args) => mocks.getCurrentUser(...args) }));
vi.mock('../../services/watchState', () => ({ watchState: mocks.watchState }));
vi.mock('../../services/config', () => ({ default: mocks.configRepository }));

import { runInitFriendsListFlow, runRefreshFriendsListFlow } from '../friendSyncCoordinator';

describe('friend initialization failure handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.VRCX_ANDROID = false;
        mocks.appDebug.dontLogMeOut = false;
        mocks.friendStore.isRefreshFriendsLoading = false;
        mocks.watchState.isFriendsLoaded = false;
        mocks.watchState.isLoggedIn = true;
        mocks.userStore.currentUser = { id: 'usr_test' };
        mocks.friendStore.friends = new Map();
        mocks.friendStore.initFriendLog.mockImplementation(async () => {
            mocks.watchState.isFriendsLoaded = true;
        });
        mocks.friendStore.getFriendLog.mockImplementation(async () => {
            mocks.watchState.isFriendsLoaded = true;
        });
        mocks.configRepository.getBool.mockResolvedValue(false);
        window.VRCXStorage = {
            Get: vi.fn().mockResolvedValue(null),
            Remove: vi.fn()
        };
    });

    test.each([
        ['storage', () => mocks.configRepository.getBool.mockRejectedValueOnce(new Error('storage unavailable')), 1],
        ['network', () => mocks.friendStore.initFriendLog.mockRejectedValueOnce(new Error('network unavailable')), 2]
    ])(
        'keeps the Android session and allows normal refresh retry after %s failure',
        async (_name, failOnce, initCalls) => {
            window.VRCX_ANDROID = true;
            failOnce();

            await runInitFriendsListFlow((key) => key);

            expect(mocks.authStore.handleLogoutEvent).not.toHaveBeenCalled();
            expect(mocks.watchState.isFriendsLoaded).toBe(false);
            expect(mocks.friendStore.isRefreshFriendsLoading).toBe(false);

            await runRefreshFriendsListFlow();

            expect(mocks.friendStore.initFriendLog).toHaveBeenCalledTimes(initCalls);
            expect(mocks.watchState.isFriendsLoaded).toBe(true);
            expect(mocks.authStore.handleLogoutEvent).not.toHaveBeenCalled();
        }
    );

    test('still logs Android out when friend initialization reports invalid credentials', async () => {
        window.VRCX_ANDROID = true;
        mocks.friendStore.initFriendLog.mockRejectedValueOnce(
            Object.assign(new Error('Unauthorized'), { status: 401 })
        );

        await runInitFriendsListFlow((key) => key);

        expect(mocks.authStore.handleLogoutEvent).toHaveBeenCalledOnce();
        expect(mocks.watchState.isFriendsLoaded).toBe(false);
        expect(mocks.friendStore.isRefreshFriendsLoading).toBe(false);
    });

    test('keeps the existing desktop logout behavior after friend initialization failure', async () => {
        const failure = new Error('network unavailable');
        mocks.friendStore.initFriendLog.mockRejectedValueOnce(failure);

        await expect(runInitFriendsListFlow((key) => key)).rejects.toBe(failure);

        expect(mocks.authStore.handleLogoutEvent).toHaveBeenCalledOnce();
        expect(mocks.watchState.isFriendsLoaded).toBe(false);
    });
});
