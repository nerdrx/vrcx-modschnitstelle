// ============================================================================
// Profile History Archiver mod — logs and displays chronological history of
// bio, status, and name changes for VRChat users.
// ============================================================================

import ProfileHistoryView from './ProfileHistoryView.vue';
import { initTables, insertSnapshot, backfillFromFeed } from './db';
import { setCtx } from './runtime';

export default {
    id: 'profilearchiver',
    name: 'Profile Archiver',
    version: '1.0.0',

    async setup(ctx) {
        setCtx(ctx);

        ctx.onLogin(async () => {
            try {
                await initTables(ctx);
                await backfillFromFeed(ctx);
            } catch (err) {
                ctx.error('Failed to initialize Profile Archiver tables or backfill:', err);
            }
        });

        const logBioChange = (feed) => {
            const userId = feed.userId || feed.user_id;
            if (!userId) return;

            const friend = ctx.stores.friends.friends.get(userId);
            const friendRef = friend?.ref || friend;
            const displayName = feed.displayName || feed.display_name || friendRef?.displayName || '';
            const status = friendRef?.statusDescription ? `${friendRef.status}: ${friendRef.statusDescription}` : (friendRef?.status || '');

            insertSnapshot(ctx, {
                id: feed.id || null,
                user_id: userId,
                display_name: displayName,
                bio: feed.bio ?? (friendRef?.bio || ''),
                status: status,
                created_at: feed.created_at || new Date().toISOString()
            }).catch((e) => ctx.error('Failed to log feed:Bio snapshot:', e));
        };

        const logStatusChange = (feed) => {
            const userId = feed.userId || feed.user_id;
            if (!userId) return;

            const friend = ctx.stores.friends.friends.get(userId);
            const friendRef = friend?.ref || friend;
            const displayName = feed.displayName || feed.display_name || friendRef?.displayName || '';
            const statusText = feed.statusDescription ? `${feed.status}: ${feed.statusDescription}` : (feed.status || '');

            insertSnapshot(ctx, {
                id: feed.id || null,
                user_id: userId,
                display_name: displayName,
                bio: friendRef?.bio || '',
                status: statusText,
                created_at: feed.created_at || new Date().toISOString()
            }).catch((e) => ctx.error('Failed to log feed:Status snapshot:', e));
        };

        ctx.on('feed:Bio', logBioChange);
        ctx.on('feed:Status', logStatusChange);

        ctx.ui.addNavView({
            key: 'mod-profile-archiver',
            component: ProfileHistoryView,
            icon: 'ri-history-line',
            label: {
                en: 'Profile Archiver',
                de: 'Profil-Archiv'
            }
        });
    }
};
