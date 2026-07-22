// ============================================================================
// VRCX Mod Loader — entry point of the mod system.
// Called once from src/app.js (the only touch point besides router.js).
// ============================================================================

import { pinia } from '../stores';
import { router } from '../plugins/router';

import { createModContext, installEventBridge } from './api';
import { mods } from './registry';

/**
 * Initialize all registered mods. Errors in one mod never break VRCX or
 * other mods.
 *
 * IMPORTANT: mod startup must NOT run before app.mount(). Several VRCX Pinia
 * stores call useI18n() (or other composables that need an active component
 * instance) in their setup. Instantiating any such store outside a component
 * context throws (vue-i18n error 26) and kills the mount → black window.
 * When an `app` is provided we therefore defer startup into the ROOT
 * component's beforeCreate hook via a one-shot mixin: that hook runs during
 * app.mount() with a current instance set — exactly like upstream components
 * instantiating stores.
 *
 * @param {object} hostOverrides optional { app, router, pinia }
 */
export async function initMods(hostOverrides = {}) {
    const host = { router, pinia, ...hostOverrides };

    if (host.app) {
        let started = false;
        host.app.mixin({
            beforeCreate() {
                // Only the root component (App.vue) has no parent; run once.
                if (started || this.$parent !== null) {
                    return;
                }
                started = true;
                startMods(host).catch((err) =>
                    console.error('[mods] startup failed:', err)
                );
            }
        });
        return;
    }

    // No app supplied (e.g. tests): start immediately.
    await startMods(host);
}

async function startMods(host) {
    try {
        installEventBridge(host);
    } catch (err) {
        console.error('[mods] event bridge failed:', err);
    }

    for (const mod of mods) {
        if (!mod || !mod.id || typeof mod.setup !== 'function') {
            console.warn('[mods] skipping invalid mod definition:', mod);
            continue;
        }
        try {
            const ctx = createModContext(mod, host);
            await mod.setup(ctx);
            console.log(`[mods] loaded ${mod.id} v${mod.version || '?'}`);
        } catch (err) {
            console.error(`[mods] failed to load "${mod.id}":`, err);
        }
    }
}
