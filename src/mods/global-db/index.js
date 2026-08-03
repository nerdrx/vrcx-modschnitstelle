// ============================================================================
// Global DB mod — "Contribute to Global Database" (Trusted Pool).
// Opt-in sync of whitelisted feed/gamelog data with a private pool server.
// Local core DB stays untouched; pool data lives in own mirror tables.
// P1: pool chat (global + DMs) with VR/desktop notifications.
// ============================================================================

import GlobalDbView from './GlobalDbView.vue';
import ChatView from './ChatView.vue';
import { initTables, kvGet, kvSet } from './db';
import { fullSync } from './sync';
import { chatState, displayName, initChat, isDnd, stopChat } from './chat';
import { checkEligible, uploadFriendHashes } from './join';
import { mediaSummary } from './media';
import { playSound } from './sounds';
import { hapticPatternFor, startVrPanel, stopVrPanel, vrHaptic } from './vrpanel';
import { setCtx } from './runtime';

let timer = null;

async function autoSyncTick(ctx) {
    try {
        const settings = await kvGet(ctx, 'settings', {});
        if (!settings.enabled || !settings.token) return;
        const result = await fullSync(ctx, settings);
        if (result.ok) {
            ctx.log('auto-sync done');
            await ensureChatReady(ctx);
        } else {
            ctx.warn('auto-sync mit Fehlern:', JSON.stringify(result.errors));
        }
    } catch (err) {
        ctx.warn('auto-sync failed:', err.message || err);
    }
}

/**
 * Pool-Chat ist erst nach dem ersten vollständig erfolgreichen Sync
 * verfügbar (Nav + Verbindung). Fallback für Bestandsnutzer: last_sync
 * gesetzt => First-Sync gilt als erledigt.
 */
export async function firstSyncDone(ctx) {
    if (await kvGet(ctx, 'first_sync_done', false)) return true;
    const legacy = await kvGet(ctx, 'last_sync', '');
    if (legacy) {
        await kvSet(ctx, 'first_sync_done', true);
        return true;
    }
    return false;
}

/** Nach erfolgreichem Sync: Chat-Nav registrieren + Chat verbinden. */
export async function ensureChatReady(ctx) {
    const settings = await kvGet(ctx, 'settings', {});
    if (!settings.token || !(await firstSyncDone(ctx))) return;
    registerChatNav(ctx);
    if (!chatState.enabled) {
        await startChatIfConfigured(ctx);
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
            // Reine Bild-Nachrichten würden sonst als nackte URL im Toast
            // stehen — mediaSummary macht daraus "🖼️ Bild".
            const body =
                ev.kind === 'invite' ? 'Join-Einladung 📍' : mediaSummary(ev.text);
            const s = chatState.settings;
            // Ton, Bild und Vibration lassen sich je Ereignisart unterscheiden:
            // eine Einladung soll sich anders anfühlen als eine Pool-Nachricht.
            const soundEvent =
                ev.kind === 'invite'
                    ? 'invite'
                    : ev.channel === 'global'
                      ? 'global'
                      : 'dm';
            // Separat togglebar: Ton / visuelle Benachrichtigung / Haptik
            if (s.vrNotySound !== false) {
                if (!playSound(s, soundEvent)) {
                    ctx.warn('Benachrichtigungston konnte nicht abgespielt werden');
                }
            }
            if (s.vrNotyVisual !== false) {
                ctx.ui.notify({
                    title: `${from} (${scope})`,
                    body,
                    desktop: s.notifyDesktop !== false,
                    xs: s.notifyVr !== false,
                    ovrt: s.notifyVr !== false,
                    vr: s.notifyVr !== false
                });
            }
            if (s.vrNotyHaptic !== false) {
                vrHaptic(
                    s.vrHapticHand || 'both',
                    hapticPatternFor(s, soundEvent),
                    s.vrHapticStrength
                );
            }
        } catch (err) {
            ctx.warn('chat notify failed:', err);
        }
    };
}

// P1.5: Token vorhanden => Chat verbinden. `enabled` steuert nur noch den
// Auto-Sync, nicht mehr den Chat (im Opt-in-Modell ist ein Mitglied mit
// Token immer chat-fähig).
export async function startChatIfConfigured(ctx) {
    const settings = await kvGet(ctx, 'settings', {});
    // Chat erst nach Token UND erfolgreichem First-Sync
    if (!settings.token || !(await firstSyncDone(ctx))) {
        stopVrPanel();
        stopChat();
        return;
    }
    const chatSettings = await kvGet(ctx, 'chat_settings', {});
    await initChat(ctx, settings, chatSettings, onChatMessage(ctx));
    await startVrPanel(ctx); // P2: VR-Overlay-Chat-Panel
}

// P1.5: nav entries are only registered AFTER login and only when the user
// is a member (token) or eligible (a member has them as friend). Everyone
// else never sees the pool features. addNavView is idempotent.
export function registerDbNav(ctx) {
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

// Pool-Chat-Nav erst nach erfolgreichem First-Sync (idempotent).
export function registerChatNav(ctx) {
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

async function shouldShowNav(ctx, settings) {
    if (settings.token) return true;
    try {
        const userId = ctx.stores.user.currentUser?.id;
        const state = await checkEligible(settings, userId);
        // member: existing member without local token (second PC) — show the
        // dashboard so they can paste their token.
        return state.eligible || state.member;
    } catch {
        return false;
    }
}

export default {
    id: 'globaldb',
    name: 'Global DB',
    version: '1.3.0',

    async setup(ctx) {
        setCtx(ctx);

        ctx.onLogin(async () => {
            try {
                await initTables(ctx);
                const settings = await kvGet(ctx, 'settings', {});
                // Migration P1 -> P1.5: Token vorhanden => Sync aktiv.
                if (settings.token && !settings.enabled) {
                    settings.enabled = true;
                    await kvSet(ctx, 'settings', settings);
                    ctx.log('migration: enabled=true (token vorhanden)');
                }
                if (await shouldShowNav(ctx, settings)) {
                    registerDbNav(ctx);
                    if (settings.token && (await firstSyncDone(ctx))) {
                        registerChatNav(ctx);
                    }
                    ctx.log('nav registered (token/member/eligible)');
                } else {
                    ctx.log('nav hidden (no token, not eligible)');
                }
                restartTimer(ctx, settings.intervalMin || 5);
                if (settings.enabled && settings.token) {
                    autoSyncTick(ctx);
                    // Keep the friend-hash replace-set fresh (delayed:
                    // friend store fills up after login).
                    setTimeout(() => {
                        uploadFriendHashes(ctx, settings).catch((err) =>
                            ctx.warn('friend-hash upload failed:', err.message || err)
                        );
                    }, 60 * 1000);
                }
                await startChatIfConfigured(ctx);
            } catch (err) {
                ctx.error('init failed:', err);
            }
        });

        ctx.on('logout', () => {
            stopVrPanel();
            stopChat();
        });
    }
};
