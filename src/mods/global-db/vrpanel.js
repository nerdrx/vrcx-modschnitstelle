// ============================================================================
// Global DB mod — P2 VR chat panel bridge.
// Pushes chatState into the VR overlay chat panel (vr-chat.html, rendered by
// VRCXVRChatPanel.cs) via AppApi.ExecuteVrOverlayFunction('chat.*', json) and
// receives actions back through window.__vrcxChatAction (routed by the
// OverlayServer, OverlayMessageType.ChatAction).
// ============================================================================

import {
    ampel,
    chatState,
    displayName,
    canonDm,
    markRead,
    sendMessage,
    sendTyping
} from './chat';
import { kvGet, kvSet } from './db';

export const DEFAULT_VR_PANEL = {
    vrPanel: false, // Panel aktiv
    vrMode: 'hud', // 'hud' | 'world'
    vrAlpha: 0.9,
    vrCurvature: 0.08,
    vrWidth: 0.9,
    vrAutoShow: true, // bei neuer Nachricht aus Minimiert aufklappen
    vrGesture: false, // Controller-Geste (Grip/A lang drücken) togglet
    vrMinimized: false
};

let timer = null;
let lastPayload = '';
let modCtx = null;

function vrCall(fn, obj) {
    if (typeof AppApi === 'undefined') return;
    try {
        AppApi.ExecuteVrOverlayFunction(`chat.${fn}`, JSON.stringify(obj));
    } catch {}
}

function vrcStatus() {
    try {
        return modCtx?.stores.user.currentUser?.status || 'active';
    } catch {
        return 'active';
    }
}

/** Kompakter chatState-Auszug für das Panel (letzte 30 Nachrichten je Kanal). */
export function buildPayload(settings) {
    const channels = [];
    const pushChan = (channel, label) => {
        const ch = chatState.channels[channel];
        channels.push({
            channel,
            label,
            unread: ch?.unread || 0,
            typing:
                ch && ch.typingUntil > Date.now()
                    ? displayName(ch.typingUser)
                    : '',
            messages: (ch?.messages || []).slice(-30).map((m) => ({
                id: m.id,
                name: displayName(m.from_user),
                text: m.kind === 'invite' ? m.text : m.text,
                kind: m.kind,
                mine: m.from_user === chatState.me
            }))
        });
    };
    pushChan('global', 'Global');
    for (const m of chatState.members) {
        if (m.user_id === chatState.me) continue;
        pushChan(canonDm(chatState.me, m.user_id), m.display_name || m.user_id.slice(0, 8));
    }
    return {
        me: chatState.me,
        ampel: ampel(chatState.settings, vrcStatus()),
        quickReplies: chatState.settings.quickReplies || [],
        channels
    };
}

async function pushConfig(ctx) {
    const cs = await kvGet(ctx, 'chat_settings', {});
    const s = { ...DEFAULT_VR_PANEL, ...cs };
    vrCall('config', {
        enabled: !!s.vrPanel && chatState.enabled,
        mode: s.vrMode,
        alpha: s.vrAlpha,
        curvature: s.vrCurvature,
        width: s.vrWidth,
        autoShow: s.vrAutoShow,
        gesture: s.vrGesture,
        minimized: s.vrMinimized,
        quickReplies: chatState.settings.quickReplies || []
    });
}

function pushState(settings) {
    if (!chatState.enabled) return;
    const payload = JSON.stringify(buildPayload(settings));
    if (payload === lastPayload) return;
    lastPayload = payload;
    if (typeof AppApi === 'undefined') return;
    try {
        AppApi.ExecuteVrOverlayFunction('chat.update', payload);
    } catch {}
}

function onAction(ctx) {
    return async (json) => {
        try {
            const a = typeof json === 'string' ? JSON.parse(json) : json;
            if (a.type === 'send' && a.channel && a.text) {
                sendMessage(a.channel, a.text);
            } else if (a.type === 'read' && a.channel) {
                markRead(a.channel);
            } else if (a.type === 'typing' && a.channel) {
                sendTyping(a.channel);
            } else if (a.type === 'config') {
                // Panel-seitige Änderungen (Modus/Alpha/minimiert) persistieren
                const cs = await kvGet(ctx, 'chat_settings', {});
                if (a.mode !== undefined) cs.vrMode = a.mode;
                if (a.alpha !== undefined) cs.vrAlpha = a.alpha;
                if (a.curvature !== undefined) cs.vrCurvature = a.curvature;
                if (a.width !== undefined) cs.vrWidth = a.width;
                if (a.minimized !== undefined) cs.vrMinimized = a.minimized;
                await kvSet(ctx, 'chat_settings', cs);
            }
        } catch (err) {
            ctx.warn('vr panel action failed:', err.message || err);
        }
    };
}

/** Nach initChat aufrufen. Läuft passiv (1s-Poll + Diff), bis stopVrPanel. */
export async function startVrPanel(ctx) {
    modCtx = ctx;
    window.__vrcxChatAction = onAction(ctx);
    await pushConfig(ctx);
    clearInterval(timer);
    lastPayload = '';
    timer = setInterval(() => {
        try {
            pushState();
        } catch {}
    }, 1000);
}

export function stopVrPanel() {
    clearInterval(timer);
    timer = null;
    vrCall('config', { enabled: false });
    if (window.__vrcxChatAction) delete window.__vrcxChatAction;
}

/** Aus der Settings-UI aufrufen, wenn sich VR-Panel-Einstellungen ändern. */
export async function refreshVrPanelConfig(ctx) {
    await pushConfig(ctx);
}
