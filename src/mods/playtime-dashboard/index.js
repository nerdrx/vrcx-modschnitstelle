// ============================================================================
// Playtime Dashboard mod — VRChat playtime metrics & statistics.
//
// Calculates total playtime, session count, average session duration,
// daily trends, hourly activity heatmaps, and top visited worlds.
// Read-only: queries core VRCX feed tables.
// ============================================================================

import PlaytimeDashboardView from './PlaytimeDashboardView.vue';
import { setCtx } from './runtime';

export default {
    id: 'playtimedashboard',
    name: 'Playtime Dashboard',
    version: '1.0.0',

    async setup(ctx) {
        setCtx(ctx);

        ctx.ui.addNavView({
            key: 'mod-playtime-dashboard',
            component: PlaytimeDashboardView,
            icon: 'ri-dashboard-line',
            label: {
                en: 'Playtime Dashboard',
                de: 'Spielzeit-Dashboard'
            }
        });
    }
};
