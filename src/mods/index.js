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
 * @param {object} hostOverrides optional { app, router, pinia }
 */
export async function initMods(hostOverrides = {}) {
    const host = { router, pinia, ...hostOverrides };
    installEventBridge(host);

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
