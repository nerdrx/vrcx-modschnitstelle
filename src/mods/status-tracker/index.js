// ============================================================================
// Status Tracker mod — records which status (join me/active/ask me/busy) each
// friend had while online and for how long.
//
// Live part: writes an exact status snapshot whenever a friend goes online or
// offline (feed_status only logs *changes*, so the first interval of a session
// would otherwise be ambiguous).
// Historic part: the view computes totals retroactively from VRCX's existing
// feed_status + feed_online_offline tables — data you already have.
// ============================================================================

import StatusTrackerView from './StatusTrackerView.vue';
import { initTables, insertSnapshot } from './db';
import { setCtx } from './runtime';

export default {
    id: 'statustracker',
    name: 'Status Tracker',
    version: '1.0.0',

    async setup(ctx) {
        setCtx(ctx);
        ctx.onLogin(async () => {
            await initTables(ctx);
        });

        const snapshotPresence = (feed, kind) => {
            const friend = ctx.stores.friends.friends.get(feed.userId);
            const status = friend?.ref?.status;
            if (!status || status === 'offline') {
                return;
            }
            insertSnapshot(ctx, {
                createdAt: feed.created_at,
                userId: feed.userId,
                status,
                kind
            }).catch((e) => ctx.error('snapshot insert failed:', e));
        };

        ctx.on('feed:Online', (feed) => snapshotPresence(feed, 'online'));
        ctx.on('feed:Offline', (feed) => snapshotPresence(feed, 'offline'));

        ctx.ui.addNavView({
            key: 'mod-status-tracker',
            component: StatusTrackerView,
            icon: 'ri-donut-chart-line',
            label: {
                en: 'Status Tracker',
                de: 'Status-Tracker'
            }
        });
    }
};
