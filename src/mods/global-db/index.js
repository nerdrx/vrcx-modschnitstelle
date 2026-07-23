// ============================================================================
// Global DB mod — "Contribute to Global Database" (Trusted Pool).
// Opt-in sync of whitelisted feed/gamelog data with a private pool server.
// Local core DB stays untouched; pool data lives in own mirror tables.
// ============================================================================

import GlobalDbView from './GlobalDbView.vue';
import { initTables, kvGet } from './db';
import { fullSync } from './sync';
import { setCtx } from './runtime';

let timer = null;

async function autoSyncTick(ctx) {
    try {
        const settings = await kvGet(ctx, 'settings', {});
        if (!settings.enabled || !settings.token) return;
        await fullSync(ctx, settings);
        ctx.log('auto-sync done');
    } catch (err) {
        ctx.warn('auto-sync failed:', err.message || err);
    }
}

export function restartTimer(ctx, minutes) {
    if (timer) clearInterval(timer);
    const m = Math.max(1, Number(minutes) || 5);
    timer = setInterval(() => autoSyncTick(ctx), m * 60 * 1000);
}

export default {
    id: 'globaldb',
    name: 'Global DB',
    version: '1.0.0',

    async setup(ctx) {
        setCtx(ctx);

        ctx.onLogin(async () => {
            try {
                await initTables(ctx);
                const settings = await kvGet(ctx, 'settings', {});
                restartTimer(ctx, settings.intervalMin || 5);
                if (settings.enabled && settings.token) {
                    autoSyncTick(ctx);
                }
            } catch (err) {
                ctx.error('init failed:', err);
            }
        });

        ctx.ui.addNavView({
            key: 'mod-global-db',
            component: GlobalDbView,
            icon: 'ri-cloud-line',
            label: {
                en: 'Global DB',
                de: 'Global-DB'
            }
        });
    }
};
