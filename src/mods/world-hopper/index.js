// ============================================================================
// World Hopper / Route Planner mod — VRChat world playlist & hopping manager.
// ============================================================================

import WorldHopperView from './WorldHopperView.vue';
import { initTables } from './db';
import { setCtx } from './runtime';

export default {
    id: 'worldhopper',
    name: 'World Hopper',
    version: '1.0.0',

    async setup(ctx) {
        setCtx(ctx);

        ctx.onLogin(async () => {
            try {
                await initTables(ctx);
            } catch (err) {
                ctx.error('Failed to initialize database tables:', err);
            }
        });

        ctx.ui.addNavView({
            key: 'mod-world-hopper',
            component: WorldHopperView,
            icon: 'ri-route-line',
            label: {
                en: 'World Hopper',
                de: 'World Hopper'
            }
        });
    }
};
