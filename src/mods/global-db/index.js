// ============================================================================
// Global DB mod — "Contribute to Global Database" (Trusted Pool).
// Opt-in sync of whitelisted feed/gamelog data with a private pool server.
// Local core DB stays untouched; pool data lives in own mirror tables.
// P1: pool chat (global + DMs) with VR/desktop notifications.
// ============================================================================

import GlobalDbView from './GlobalDbView.vue';
import ChatView from './ChatView.vue';
import { initTables, kvGet } from './db';
import { fullSync } from './sync';
import { chatState, displayName, initChat, isDnd, stopChat } from './chat';
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

function onChatMessage(ctx) {
    return (ev) => {
        try {
            let vrcStatus = 'active';
            try {
                vrcStatus = ctx.stores.user.currentUser?.status || 'active';
            } catch {}
            if (isDnd(chatState.settings, vrcStatus)) return;
            const chatOpen =
                chatState.viewOpen &&
                chatState.active === ev.channel &&
                !document.hidden;
            if (chatOpen) return;
            const from = displayName(ev.from_user);
            const scope = ev.channel === 'global' ? 'Pool' : 'DM';
            const body =
                ev.kind === 'invite' ? 'Join-Einladung 📍' : ev.text;
            ctx.ui.notify({
                title: `${from} (${scope})`,
                body,
                desktop: chatState.settings.notifyDesktop !== false,
                xs: chatState.settings.notifyVr !== false,
                vr: chatState.settings.notifyVr !== false
            });
        } catch (err) {
            ctx.warn('chat notify failed:', err);
        }
    };
}

export async function startChatIfConfigured(ctx) {
    const settings = await kvGet(ctx, 'settings', {});
    if (!settings.enabled || !settings.token) {
        stopChat();
        return;
    }
    const chatSettings = await kvGet(ctx, 'chat_settings', {});
    await initChat(ctx, settings, chatSettings, onChatMessage(ctx));
}

export default {
    id: 'globaldb',
    name: 'Global DB',
    version: '1.1.0',

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
                await startChatIfConfigured(ctx);
            } catch (err) {
                ctx.error('init failed:', err);
            }
        });

        ctx.on('logout', () => stopChat());

        ctx.ui.addNavView({
            key: 'mod-global-db',
            component: GlobalDbView,
            icon: 'ri-cloud-line',
            label: {
                en: 'Global DB',
                de: 'Global-DB'
            }
        });

        ctx.ui.addNavView({
            key: 'mod-pool-chat',
            component: ChatView,
            icon: 'ri-chat-3-line',
            label: {
                en: 'Pool Chat',
                de: 'Pool-Chat'
            }
        });
    }
};
