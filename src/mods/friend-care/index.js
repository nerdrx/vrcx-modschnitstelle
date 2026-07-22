// ============================================================================
// Friend Care mod — friendship maintenance overview.
//
// Tab 1 "Last Seen":  when was each friend last in the same instance as me
//                     (from the global gamelog_join_leave table).
// Tab 2 "Inactivity": who has not been active in VRChat for a long time
//                     (live API fields last_activity/last_login, feed
//                     heuristic as fallback).
//
// Read-only: queries core tables only, writes nothing.
// ============================================================================

import FriendCareView from './FriendCareView.vue';
import { setCtx } from './runtime';

export default {
    id: 'friendcare',
    name: 'Friend Care',
    version: '1.0.0',

    async setup(ctx) {
        setCtx(ctx);

        ctx.ui.addNavView({
            key: 'mod-friend-care',
            component: FriendCareView,
            icon: 'ri-heart-pulse-line',
            label: {
                en: 'Friend Care',
                de: 'Freundschaftspflege'
            }
        });
    }
};
