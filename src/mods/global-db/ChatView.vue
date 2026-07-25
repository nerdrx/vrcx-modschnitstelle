<template>
    <div class="x-container chat-root">
        <div class="chat-toolbar">
            <span
                class="ampel"
                :class="'ampel-' + ampelColor"
                :title="'Status: ' + vrcStatus + (dndActive ? ' · DND aktiv' : '')"
            ></span>
            <span class="conn" :class="{ on: st.connected }">
                {{ st.connected ? 'Verbunden' : st.enabled ? 'Verbinde…' : 'Inaktiv' }}
            </span>
            <label class="tgl">
                <input type="checkbox" v-model="st.settings.dndAuto" @change="saveSettings" />
                DND an VRC-Status koppeln
            </label>
            <label class="tgl">
                <input type="checkbox" v-model="st.settings.dndManual" @change="saveSettings" />
                DND manuell
            </label>
            <label class="tgl">
                <input type="checkbox" v-model="st.settings.shield" @change="saveSettings" />
                Streamer-Schutz
            </label>
            <label class="tgl" title="Kurzer Ton bei neuer Nachricht">
                <input type="checkbox" v-model="st.settings.vrNotySound" @change="saveVrSettings" />
                Ton
            </label>
            <label class="tgl" title="Windows-Toast / VR-Overlay / OVR-Toolkit">
                <input type="checkbox" v-model="st.settings.vrNotyVisual" @change="saveVrSettings" />
                Benachrichtigung
            </label>
            <label class="tgl" title="Controller-Vibration bei neuer Nachricht">
                <input type="checkbox" v-model="st.settings.vrNotyHaptic" @change="saveVrSettings" />
                Haptik
            </label>
            <select v-if="st.settings.vrNotyHaptic" v-model="st.settings.vrHapticHand"
                class="tgl-select" title="Welche Hand vibriert" @change="saveVrSettings">
                <option value="both">beide</option>
                <option value="left">links</option>
                <option value="right">rechts</option>
            </select>
            <label class="tgl" title="Interaktives Chat-Panel als SteamVR-Overlay (Standard: am Handgelenk)">
                <input type="checkbox" v-model="st.settings.vrPanel" @change="saveVrSettings" />
                VR-Panel
            </label>
            <label v-if="st.settings.vrPanel" class="tgl" title="Neue Nachricht: Mini am Handgelenk einblenden bzw. Panel aufklappen">
                <input type="checkbox" v-model="st.settings.vrAutoShow" @change="saveVrSettings" />
                VR: Auto-Show
            </label>
            <label v-if="st.settings.vrPanel" class="tgl" title="Grip/A-Taste lang drücken öffnet/schließt den großen Chat">
                <input type="checkbox" v-model="st.settings.vrGesture" @change="saveVrSettings" />
                VR: Geste
            </label>
            <span v-if="st.settings.vrPanel" class="tgl" title="Wo das Panel sitzt: am Handgelenk, kopffest oder frei in der Welt">
                VR: Position
                <select v-model="st.settings.vrMode" class="tgl-select" @change="saveVrSettings">
                    <option value="wrist">Handgelenk</option>
                    <option value="hud">Kopffest (HUD)</option>
                    <option value="world">Frei in der Welt</option>
                </select>
            </span>
            <span v-if="st.settings.vrPanel && st.settings.vrMode === 'wrist'" class="tgl"
                title="Welches Handgelenk den Mini trägt">
                VR: Hand
                <select v-model="st.settings.vrWristHand" class="tgl-select" @change="saveVrSettings">
                    <option value="left">links</option>
                    <option value="right">rechts</option>
                </select>
            </span>
            <label v-if="st.settings.vrPanel && st.settings.vrMode === 'wrist'" class="tgl"
                title="Aus: Mini ist dauerhaft am Handgelenk. An: erscheint nur, wenn du hinschaust bzw. bei neuer Nachricht">
                <input type="checkbox" v-model="st.settings.vrWristGate" @change="saveVrSettings" />
                VR: nur beim Hinsehen
            </label>
            <span v-if="st.settings.vrPanel" class="tgl" title="Mini-Anzeigedauer bei neuer Nachricht (Sekunden)">
                Mini
                <input v-model.number="st.settings.vrFlashSec" type="number" min="2" max="120"
                    class="tgl-num" @change="saveVrSettings" />s
            </span>
            <span class="spacer"></span>
            <span v-if="st.lastError" class="err">{{ st.lastError }}</span>
        </div>
        <div v-if="!st.enabled" class="chat-hint">
            Pool-Chat ist inaktiv. Aktiviere den Global-DB-Sync (Server-URL +
            Token) im Tab „Global-DB" — der Chat verbindet sich dann automatisch.
        </div>

        <div class="chat-body" v-if="st.enabled">
            <aside class="chan-list">
                <div
                    class="chan"
                    :class="{ active: st.active === 'global' }"
                    @click="openChannel('global')"
                >
                    <i class="ri-earth-line"></i> Global
                    <span v-if="chan('global').unread" class="badge">{{
                        chan('global').unread
                    }}</span>
                </div>
                <div class="chan-sep">Direktnachrichten</div>
                <div
                    v-for="m in dmMembers"
                    :key="m.user_id"
                    class="chan"
                    :class="{ active: st.active === dmChannel(m.user_id) }"
                    @click="openChannel(dmChannel(m.user_id))"
                >
                    <i class="ri-user-3-line"></i>
                    <span class="chan-name" :class="{ blur: st.settings.shield }">{{
                        m.display_name || m.user_id
                    }}</span>
                    <span
                        v-if="chan(dmChannel(m.user_id)).unread"
                        class="badge"
                        >{{ chan(dmChannel(m.user_id)).unread }}</span
                    >
                </div>
            </aside>

            <main class="chat-main">
                <div class="msg-list" ref="listEl">
                    <div
                        v-for="m in activeChan.messages"
                        :key="m.id"
                        class="msg"
                        :class="{ mine: m.from_user === st.me, system: m.kind === 'system' }"
                    >
                        <div v-if="m.kind === 'system'" class="msg-system">
                            <i class="ri-user-add-line"></i> {{ m.text }}
                            <span class="msg-time">{{ fmtTime(m.created_at) }}</span>
                        </div>
                        <div v-if="m.kind !== 'system'" class="msg-head">
                            <span
                                class="msg-name"
                                :class="{ blur: st.settings.shield }"
                                @click="showUser(m.from_user)"
                                >{{ name(m.from_user) }}</span
                            >
                            <span class="msg-time">{{ fmtTime(m.created_at) }}</span>
                            <span
                                v-if="m.from_user === st.me && isDm && m.id <= activeChan.peerReadId"
                                class="read-check"
                                title="Gelesen"
                                >✓✓</span
                            >
                            <span
                                v-else-if="m.from_user === st.me && isDm"
                                class="read-check pending"
                                title="Zugestellt"
                                >✓</span
                            >
                        </div>

                        <div v-if="m.kind !== 'system'" class="msg-body" :class="{ blur: st.settings.shield }">
                            <template v-if="m.kind === 'invite'">
                                <button class="btn join" @click="joinLocation(m.text)">
                                    <i class="ri-login-circle-line"></i> Join
                                </button>
                                <span class="invite-loc">{{ m.text }}</span>
                            </template>
                            <template v-else>{{ m.text }}</template>
                        </div>
                        <div v-if="m.kind !== 'system'" class="msg-foot">
                            <span
                                v-for="g in groupReactions(m)"
                                :key="g.emoji"
                                class="react-chip"
                                :class="{ mine: g.mine }"
                                @click="toggleReaction(m, g.emoji, g.mine)"
                                >{{ g.emoji }} {{ g.count }}</span
                            >
                            <span
                                class="react-add"
                                @click="pickerFor = pickerFor === m.id ? 0 : m.id"
                                >🙂+</span
                            >
                            <span v-if="pickerFor === m.id" class="react-picker">
                                <span
                                    v-for="e in REACT_EMOJIS"
                                    :key="e"
                                    @click="toggleReaction(m, e, myReaction(m, e))"
                                    >{{ e }}</span
                                >
                            </span>
                        </div>
                    </div>

                    <div v-if="typingText" class="typing">{{ typingText }}</div>
                </div>
                <div class="quick-row">
                    <button
                        v-for="q in st.settings.quickReplies"
                        :key="q"
                        class="btn quick"
                        @click="sendQuick(q)"
                    >
                        {{ q }}
                    </button>
                    <button class="btn quick loc" @click="sendLocation" title="Aktuelle Instanz als Join-Einladung senden">
                        <i class="ri-map-pin-line"></i> Standort senden
                    </button>
                </div>
                <div v-if="emojiOpen" class="emoji-panel">
                    <span
                        v-for="em in INPUT_EMOJIS"
                        :key="em"
                        class="emoji-btn"
                        @click="draft += em"
                        >{{ em }}</span
                    >
                </div>
                <div class="input-row">
                    <button class="btn" title="Emojis" @click="emojiOpen = !emojiOpen">🙂</button>
                    <textarea
                        v-model="draft"
                        class="chat-input"
                        rows="2"
                        :placeholder="'Nachricht an ' + channelTitle + '…'"
                        @input="onTyping"
                        @keydown.enter.exact.prevent="send"
                    ></textarea>
                    <button class="btn send" :disabled="!st.connected || !draft.trim()" @click="send">
                        <i class="ri-send-plane-2-line"></i>
                    </button>
                </div>
            </main>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getCtx } from './runtime';
import { kvSet } from './db';
import {
    ampel,
    chatState as st,
    canonDm,
    dmPeer,
    displayName,
    ensureChannel,
    isDnd,
    loadHistory,
    markRead,
    sendMessage,
    sendReaction,
    sendTyping
} from './chat';
import {
    DEFAULT_VR_PANEL,
    migrateLaserCalibration,
    refreshVrPanelConfig
} from './vrpanel';

const ctx = getCtx();
const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];
const INPUT_EMOJIS = ['😀', '😂', '😍', '🥰', '😎', '🤔', '😭', '😱', '🥳', '😴',
    '👍', '👎', '❤️', '🔥', '✨', '🎉', '💀', '🙏', '👋', '💜', '😈', '🍕', '🎮', '📍'];
const emojiOpen = ref(false);
const draft = ref('');
const pickerFor = ref(0);
const listEl = ref(null);
let tickTimer = null;
const tick = ref(0);

const vrcStatus = computed(() => {
    void tick.value;
    try {
        return ctx.stores.user.currentUser?.status || 'active';
    } catch {
        return 'active';
    }
});
const dndActive = computed(() => isDnd(st.settings, vrcStatus.value));
const ampelColor = computed(() => ampel(st.settings, vrcStatus.value));

const activeChan = computed(() => ensureChannel(st.active));
const isDm = computed(() => st.active.startsWith('dm:'));
const dmMembers = computed(() =>
    st.members.filter((m) => m.user_id !== st.me)
);
const channelTitle = computed(() => {
    if (st.active === 'global') return 'alle im Pool';
    return displayName(dmPeer(st.active, st.me));
});
const typingText = computed(() => {
    void tick.value;
    const ch = activeChan.value;
    if (ch.typingUser && ch.typingUntil > Date.now()) {
        return `${displayName(ch.typingUser)} tippt…`;
    }
    return '';
});

const chan = (c) => ensureChannel(c);
const dmChannel = (uid) => canonDm(st.me, uid);
const name = (uid) => displayName(uid);
const fmtTime = (iso) =>
    new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

function groupReactions(m) {
    const map = new Map();
    for (const r of m.reactions) {
        const g = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
        g.count++;
        if (r.user_id === st.me) g.mine = true;
        map.set(r.emoji, g);
    }
    return [...map.values()];
}
const myReaction = (m, emoji) =>
    m.reactions.some((r) => r.user_id === st.me && r.emoji === emoji);

function toggleReaction(m, emoji, mine) {
    sendReaction(m.id, emoji, mine);
    pickerFor.value = 0;
}

async function openChannel(channel) {
    st.active = channel;
    const ch = ensureChannel(channel);
    if (!ch.historyLoaded) {
        try {
            await loadHistory(channel);
        } catch (err) {
            ctx.warn('history load failed:', err);
        }
    }
    markRead(channel);
    scrollDown();
}

function send() {
    if (sendMessage(st.active, draft.value)) {
        draft.value = '';
    }
}
function sendQuick(text) {
    sendMessage(st.active, text);
}
function onTyping() {
    if (draft.value.trim()) sendTyping(st.active);
}

async function sendLocation() {
    try {
        const rows = await ctx.db.query(
            'SELECT location FROM gamelog_location ORDER BY created_at DESC LIMIT 1'
        );
        const loc = rows[0]?.[0];
        if (loc && loc.startsWith('wrld_')) {
            sendMessage(st.active, loc, 'invite');
        } else {
            ctx.warn('no current location found');
        }
    } catch (err) {
        ctx.warn('sendLocation failed:', err);
    }
}

function joinLocation(loc) {
    ctx.ui.showWorldDialog(loc);
}
function showUser(uid) {
    ctx.ui.showUserDialog(uid);
}

function saveSettings() {
    kvSet(ctx, 'chat_settings', { ...st.settings }).catch((e) =>
        ctx.warn('chat settings save failed:', e)
    );
}

// P2: VR-Panel-Einstellungen — Defaults sicherstellen, speichern, Panel-Config pushen
function ensureVrDefaults() {
    // Alte cm-Laserkalibrierung in Winkel überführen, bevor Defaults greifen —
    // sonst schreibt der nächste Toggle die veralteten Keys zurück.
    const mig = migrateLaserCalibration(st.settings);
    if (mig.changed) {
        Object.assign(st.settings, mig.settings);
        delete st.settings.vrLaserOffX;
        delete st.settings.vrLaserOffY;
    }
    for (const [k, v] of Object.entries(DEFAULT_VR_PANEL)) {
        if (st.settings[k] === undefined) st.settings[k] = v;
    }
}
async function saveVrSettings() {
    ensureVrDefaults();
    await kvSet(ctx, 'chat_settings', { ...st.settings }).catch((e) =>
        ctx.warn('chat settings save failed:', e)
    );
    refreshVrPanelConfig(ctx).catch(() => {});
}

function scrollDown() {
    nextTick(() => {
        if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
    });
}

watch(
    () => activeChan.value.messages.length,
    () => {
        scrollDown();
        if (!document.hidden) markRead(st.active);
    }
);

onMounted(() => {
    st.viewOpen = true;
    ensureVrDefaults(); // neue VR-/Noty-Settings mit Defaults initialisieren
    tickTimer = setInterval(() => tick.value++, 1000);
    openChannel(st.active);
});
onUnmounted(() => {
    st.viewOpen = false;
    clearInterval(tickTimer);
});
</script>

<style scoped>
.chat-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 8px;
}
.chat-toolbar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 12px;
    border: 1px solid var(--border, #444);
    border-radius: 8px;
    flex-wrap: wrap;
}
.ampel {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: inline-block;
}
.ampel-green { background: #2ecc71; }
.ampel-yellow { background: #f1c40f; }
.ampel-red { background: #e74c3c; }
.conn { font-size: 12px; color: var(--muted-foreground, #999); }
.conn.on { color: #2ecc71; }
.tgl {
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    color: var(--foreground, inherit);
}
.spacer { flex: 1; }
.err { color: #e74c3c; font-size: 12px; }
.chat-hint {
    padding: 14px;
    border: 1px dashed var(--border, #444);
    border-radius: 8px;
    color: var(--muted-foreground, #999);
}
.chat-body {
    display: flex;
    gap: 8px;
    flex: 1;
    min-height: 0;
}
.chan-list {
    width: 220px;
    min-width: 160px;
    border: 1px solid var(--border, #444);
    border-radius: 8px;
    padding: 6px;
    overflow-y: auto;
}
.chan {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 9px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
}
.chan:hover { background: color-mix(in srgb, var(--accent, #3498db) 12%, transparent); }
.chan.active { background: color-mix(in srgb, var(--accent, #3498db) 22%, transparent); }
.chan-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.chan-sep {
    margin: 8px 4px 4px;
    font-size: 11px;
    text-transform: uppercase;
    color: var(--muted-foreground, #888);
}
.badge {
    margin-left: auto;
    background: var(--accent, #3498db);
    color: #fff;
    border-radius: 9px;
    font-size: 11px;
    padding: 1px 7px;
}
.chat-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border, #444);
    border-radius: 8px;
    overflow: hidden;
}
.msg-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.msg { max-width: 78%; align-self: flex-start; }
.msg.mine { align-self: flex-end; text-align: right; }
.msg-head { font-size: 11px; color: var(--muted-foreground, #999); display: flex; gap: 8px; }
.msg.mine .msg-head { justify-content: flex-end; }
.msg-name { cursor: pointer; font-weight: 600; color: var(--accent, #3498db); }
.msg-body {
    margin-top: 2px;
    padding: 7px 11px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--foreground, #888) 8%, transparent);
    display: inline-block;
    text-align: left;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
}
.msg.mine .msg-body {
    background: color-mix(in srgb, var(--accent, #3498db) 22%, transparent);
}
.blur { filter: blur(5px); transition: filter 0.15s; }
.blur:hover { filter: none; }
.read-check { color: var(--accent, #3498db); }
.read-check.pending { color: var(--muted-foreground, #999); }
.msg-foot { margin-top: 3px; display: flex; gap: 5px; align-items: center; font-size: 12px; }
.msg.mine .msg-foot { justify-content: flex-end; }
.react-chip {
    border: 1px solid var(--border, #444);
    border-radius: 10px;
    padding: 0 7px;
    cursor: pointer;
}
.react-chip.mine { border-color: var(--accent, #3498db); }
.react-add { cursor: pointer; opacity: 0; transition: opacity 0.15s; }
.msg:hover .react-add { opacity: 0.7; }
.react-picker {
    display: inline-flex;
    gap: 6px;
    border: 1px solid var(--border, #444);
    border-radius: 10px;
    padding: 2px 8px;
    cursor: pointer;
}
.typing { font-size: 12px; color: var(--muted-foreground, #999); font-style: italic; }
.quick-row {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    flex-wrap: wrap;
    border-top: 1px solid var(--border, #444);
}
.btn {
    border: 1px solid var(--border, #444);
    background: transparent;
    color: var(--foreground, inherit);
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 12px;
}
.btn:hover { border-color: var(--accent, #3498db); }
.btn.join {
    border-color: #2ecc71;
    color: #2ecc71;
    margin-right: 8px;
}
.invite-loc { font-size: 11px; color: var(--muted-foreground, #999); word-break: break-all; }
.input-row {
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    border-top: 1px solid var(--border, #444);
    align-items: flex-end;
}
.chat-input {
    flex: 1;
    resize: none;
    background: transparent;
    color: var(--foreground, inherit);
    border: 1px solid var(--border, #444);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 13px;
    font-family: inherit;
}
.chat-input:focus { outline: none; border-color: var(--accent, #3498db); }
.btn.send { padding: 8px 16px; font-size: 15px; }
.btn.send:disabled { opacity: 0.4; cursor: default; }
.msg.system { align-self: center; max-width: 90%; }
.msg-system {
    font-size: 12px;
    color: var(--muted-foreground, #9f9fa5);
    font-style: italic;
    text-align: center;
    padding: 2px 10px;
}
.msg-system .msg-time { margin-left: 6px; opacity: 0.6; }
.tgl-select, .tgl-num {
    background: transparent;
    color: inherit;
    border: 1px solid var(--border, #4443);
    border-radius: 6px;
    font-size: 12px;
    padding: 2px 6px;
}
.tgl-num { width: 48px; }
.emoji-panel {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 10px;
    border-top: 1px solid var(--border, #444);
}
.emoji-btn {
    font-size: 18px;
    padding: 3px 6px;
    border-radius: 6px;
    cursor: pointer;
}
.emoji-btn:hover { background: var(--accent, #3f3f46); }
</style>
