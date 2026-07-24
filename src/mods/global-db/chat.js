// ============================================================================
// Global DB mod — Pool chat client (P1).
// WebSocket client with auto-reconnect + reactive chat state, shared between
// the mod lifecycle (notifications) and ChatView. Server: vrcx-pool >= 0.4.0.
// ============================================================================

import { reactive } from 'vue';
import { DEFAULT_SERVER, apiFetch } from './sync';

// ------------------------------------------------------------------ pure ---
export function wsUrl(serverUrl, token) {
    const base = (serverUrl || DEFAULT_SERVER).replace(/\/$/, '');
    return `${base.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token || '')}`;
}

export function canonDm(a, b) {
    const pair = [a, b].sort();
    return `dm:${pair[0]}:${pair[1]}`;
}

export function dmPeer(channel, me) {
    if (!channel || !channel.startsWith('dm:')) return null;
    const [, a, b] = channel.split(':');
    return a === me ? b : a;
}

/** DND: manual switch wins; auto mode couples to VRChat status 'busy'. */
export function isDnd(settings, vrcStatus) {
    if (settings.dndManual) return true;
    if (settings.dndAuto !== false && vrcStatus === 'busy') return true;
    return false;
}

/** Traffic-light color for the status/DND combination. */
export function ampel(settings, vrcStatus) {
    if (isDnd(settings, vrcStatus)) return 'red';
    if (vrcStatus === 'ask me') return 'yellow';
    return 'green';
}

export const DEFAULT_CHAT_SETTINGS = {
    dndAuto: true,
    dndManual: false,
    notifyDesktop: true,
    notifyVr: true,
    shield: false,
    quickReplies: ['👍', 'Bin gleich da!', 'Kann gerade nicht antworten', 'Join?']
};

export function emptyChannel(channel) {
    return {
        channel,
        messages: [], // {id, created_at, from_user, text, kind, reactions:[]}
        lastId: 0,
        myReadId: 0,
        peerReadId: 0,
        unread: 0,
        typingUser: '',
        typingUntil: 0,
        historyLoaded: false
    };
}

// ----------------------------------------------------------------- state ---
export const chatState = reactive({
    connected: false,
    enabled: false,
    me: '',
    members: [], // {user_id, display_name}
    channels: {}, // channel -> emptyChannel()
    active: 'global',
    viewOpen: false,
    settings: { ...DEFAULT_CHAT_SETTINGS },
    lastError: ''
});

export function ensureChannel(channel) {
    if (!chatState.channels[channel]) {
        chatState.channels[channel] = emptyChannel(channel);
    }
    return chatState.channels[channel];
}

export function displayName(userId) {
    const m = chatState.members.find((x) => x.user_id === userId);
    return m?.display_name || (userId || '').slice(0, 12);
}

// ---------------------------------------------------------------- client ---
let ws = null;
let srv = null; // {serverUrl, token}
let modCtx = null;
let onIncoming = null;
let reconnectTimer = null;
let backoff = 1000;
let stopped = true;

function handleEvent(ev) {
    if (ev.type === 'hello') {
        chatState.me = ev.user_id;
        return;
    }
    if (ev.type === 'message') {
        const ch = ensureChannel(ev.channel);
        if (!ch.messages.some((m) => m.id === ev.id)) {
            ch.messages.push({
                id: ev.id,
                created_at: ev.created_at,
                from_user: ev.from_user,
                text: ev.text,
                kind: ev.kind || 'text',
                reactions: []
            });
        }
        ch.lastId = Math.max(ch.lastId, ev.id);
        if (ev.from_user !== chatState.me) {
            const isOpen =
                chatState.viewOpen &&
                chatState.active === ev.channel &&
                !document.hidden;
            if (isOpen) {
                markRead(ev.channel);
            } else {
                ch.unread++;
            }
            if (onIncoming) onIncoming(ev, ch);
        }
        return;
    }

    if (ev.type === 'typing') {
        if (ev.user_id === chatState.me) return;
        const ch = ensureChannel(ev.channel);
        ch.typingUser = ev.user_id;
        ch.typingUntil = Date.now() + 5000;
        return;
    }
    if (ev.type === 'read') {
        const ch = ensureChannel(ev.channel);
        if (ev.user_id === chatState.me) {
            ch.myReadId = Math.max(ch.myReadId, ev.lastId);
        } else if (ev.channel.startsWith('dm:')) {
            ch.peerReadId = Math.max(ch.peerReadId, ev.lastId);
        }
        return;
    }
    if (ev.type === 'react') {
        const ch = chatState.channels[ev.channel];
        if (!ch) return;
        const msg = ch.messages.find((m) => m.id === ev.id);
        if (!msg) return;
        const idx = msg.reactions.findIndex(
            (r) => r.user_id === ev.user_id && r.emoji === ev.emoji
        );
        if (ev.remove) {
            if (idx >= 0) msg.reactions.splice(idx, 1);
        } else if (idx < 0) {
            msg.reactions.push({ user_id: ev.user_id, emoji: ev.emoji });
        }
    }
}

function connect() {
    if (stopped || !srv?.token) return;
    try {
        ws = new WebSocket(wsUrl(srv.serverUrl, srv.token));
    } catch (err) {
        chatState.lastError = String(err.message || err);
        scheduleReconnect();
        return;
    }
    ws.onopen = () => {
        chatState.connected = true;
        chatState.lastError = '';
        backoff = 1000;
        modCtx?.log('chat connected');
        refreshState().catch(() => {});
    };
    ws.onmessage = (e) => {
        try {
            handleEvent(JSON.parse(e.data));
        } catch (err) {
            modCtx?.warn('chat event parse failed:', err);
        }
    };
    ws.onclose = () => {
        chatState.connected = false;
        scheduleReconnect();
    };
    ws.onerror = () => {
        chatState.lastError = 'Verbindungsfehler';
    };
}

function scheduleReconnect() {
    if (stopped) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30000);
}

// ------------------------------------------------------------- lifecycle ---
export async function initChat(ctx, serverSettings, chatSettings, incoming) {
    modCtx = ctx;
    srv = serverSettings;
    onIncoming = incoming;
    stopped = false;
    chatState.enabled = true;
    chatState.settings = { ...DEFAULT_CHAT_SETTINGS, ...(chatSettings || {}) };
    ensureChannel('global');
    try {
        const data = await apiFetch(srv, 'v1/members');
        chatState.members = data.members || [];
    } catch (err) {
        chatState.lastError = String(err.message || err);
    }
    connect();
}

export function stopChat() {
    stopped = true;
    chatState.enabled = false;
    chatState.connected = false;
    clearTimeout(reconnectTimer);
    try {
        ws?.close();
    } catch {}
    ws = null;
}

export async function refreshState() {
    const data = await apiFetch(srv, 'v1/chat/state');
    for (const s of data.state || []) {
        const ch = ensureChannel(s.channel);
        ch.lastId = Math.max(ch.lastId, s.lastId || 0);
        ch.myReadId = Math.max(ch.myReadId, s.lastReadId || 0);
        if (!ch.historyLoaded) ch.unread = s.unread || 0;
    }
}

export async function loadHistory(channel) {
    const ch = ensureChannel(channel);
    const data = await apiFetch(
        srv,
        `v1/chat/history?channel=${encodeURIComponent(channel)}&limit=100`
    );
    const reactionsByMsg = {};
    for (const r of data.reactions || []) {
        (reactionsByMsg[r.message_id] ||= []).push({
            user_id: r.user_id,
            emoji: r.emoji
        });
    }
    const known = new Set(ch.messages.map((m) => m.id));
    const older = (data.messages || [])
        .filter((m) => !known.has(m.id))
        .map((m) => ({
            id: m.id,
            created_at: m.created_at,
            from_user: m.from_user,
            text: m.text,
            kind: m.type || 'text',
            reactions: reactionsByMsg[m.id] || []
        }));
    ch.messages = [...older, ...ch.messages].sort((a, b) => a.id - b.id);
    for (const m of ch.messages) {
        if (reactionsByMsg[m.id] && m.reactions.length === 0) {
            m.reactions = reactionsByMsg[m.id];
        }
        ch.lastId = Math.max(ch.lastId, m.id);
    }
    ch.historyLoaded = true;
}

// --------------------------------------------------------------- actions ---
function wsSend(obj) {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
        return true;
    }
    return false;
}

export function sendMessage(channel, text, kind = 'text') {
    const t = (text || '').trim();
    if (!t) return false;
    return wsSend({ type: 'send', channel, text: t.slice(0, 2000), kind });
}

let lastTypingSent = 0;
export function sendTyping(channel) {
    const now = Date.now();
    if (now - lastTypingSent < 3000) return;
    lastTypingSent = now;
    wsSend({ type: 'typing', channel });
}

export function markRead(channel) {
    const ch = chatState.channels[channel];
    if (!ch || ch.lastId <= 0) return;
    ch.unread = 0;
    if (ch.myReadId >= ch.lastId) return;
    ch.myReadId = ch.lastId;
    wsSend({ type: 'read', channel, lastId: ch.lastId });
}

export function sendReaction(id, emoji, remove = false) {
    wsSend({ type: 'react', id, emoji, remove });
}

export function totalUnread() {
    return Object.values(chatState.channels).reduce((n, c) => n + c.unread, 0);
}
