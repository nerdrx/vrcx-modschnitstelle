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
            <button v-if="st.settings.vrNotySound" class="btn" title="Töne und Vibration einstellen"
                @click="soundPanel = !soundPanel">
                Töne …
            </button>
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
            <label class="tgl" title="Bilder und GIFs aus Links direkt im Chat anzeigen. Die Datei bleibt beim ursprünglichen Anbieter — der Pool-Server speichert nur den Link.">
                <input type="checkbox" v-model="st.settings.mediaShow" @change="saveVrSettings" />
                Medien
            </label>
            <template v-if="st.settings.mediaShow">
                <label class="tgl" title="Auch mp4/webm einbetten">
                    <input type="checkbox" v-model="st.settings.mediaVideo" @change="saveVrSettings" />
                    Videos
                </label>
                <label class="tgl" title="Tenor-/Giphy-Seitenlinks in das eigentliche GIF auflösen (ohne API-Key, per oEmbed)">
                    <input type="checkbox" v-model="st.settings.mediaEmbeds" @change="saveVrSettings" />
                    GIF-Links auflösen
                </label>
                <label class="tgl" title="Medien auch im VR-Panel anzeigen">
                    <input type="checkbox" v-model="st.settings.mediaInVr" @change="saveVrSettings" />
                    Medien in VR
                </label>
                <span class="tgl" title="Anzeigehöhe im Desktop-Chat">
                    Höhe
                    <input v-model.number="st.settings.mediaMaxPx" type="number" min="80" max="900"
                        step="20" class="tgl-num wide" @change="saveVrSettings" />px
                </span>
            </template>
            <label class="tgl" title="Interaktives Chat-Panel als SteamVR-Overlay (Standard: am Handgelenk)">
                <input type="checkbox" v-model="st.settings.vrPanel" @change="saveVrSettings" />
                VR-Panel
            </label>
            <label v-if="st.settings.vrPanel" class="tgl" title="Neue Nachricht: Mini am Handgelenk einblenden bzw. Panel aufklappen">
                <input type="checkbox" v-model="st.settings.vrAutoShow" @change="saveVrSettings" />
                VR: Auto-Show
            </label>
            <label v-if="st.settings.vrPanel" class="tgl" title="Controller-Taste öffnet/schließt den großen Chat">
                <input type="checkbox" v-model="st.settings.vrGesture" @change="saveVrSettings" />
                VR: Geste
            </label>
            <template v-if="st.settings.vrPanel && st.settings.vrGesture">
                <span class="tgl" title="Welche Controller-Taste die Geste auslöst">
                    Taste
                    <select v-model.number="st.settings.vrGestureMask" class="tgl-select" @change="saveVrSettings">
                        <option v-for="b in GESTURE_BUTTONS" :key="b.mask" :value="b.mask">
                            {{ b.label }}
                        </option>
                        <option v-if="!knownGestureMask" :value="st.settings.vrGestureMask">
                            {{ gestureButtonLabel(st.settings.vrGestureMask) }}
                        </option>
                    </select>
                </span>
                <button class="btn" :class="{ learning: gestureLearning }"
                    title="In VR die gewünschte Taste drücken — sie wird übernommen"
                    @click="startLearnGesture">
                    {{ gestureLearning ? 'Taste drücken…' : 'Taste lernen' }}
                </button>
                <span class="tgl" title="Auf welcher Hand die Geste zählt">
                    Hand
                    <select v-model="st.settings.vrGestureHand" class="tgl-select" @change="saveVrSettings">
                        <option value="both">beide</option>
                        <option value="left">links</option>
                        <option value="right">rechts</option>
                    </select>
                </span>
                <span class="tgl" title="Halten oder zweimal kurz tippen">
                    Auslösen
                    <select v-model="st.settings.vrGestureMode" class="tgl-select" @change="saveVrSettings">
                        <option value="hold">halten</option>
                        <option value="double">doppelt tippen</option>
                    </select>
                </span>
                <span v-if="st.settings.vrGestureMode === 'hold'" class="tgl"
                    title="Wie lange gehalten werden muss (ms) — länger heißt weniger Fehlauslösungen">
                    Haltezeit
                    <input v-model.number="st.settings.vrGestureHold" type="number" min="200" max="4000"
                        step="100" class="tgl-num wide" @change="saveVrSettings" />ms
                </span>
            </template>
            <span v-if="st.settings.vrPanel" class="tgl"
                title="Wo die kleine Vorschau sitzt. Kopffest und Frei lassen sich per Langdruck auf den Mini verschieben.">
                VR: Mini
                <select v-model="st.settings.vrMiniMode" class="tgl-select" @change="saveVrSettings">
                    <option value="wrist">Handgelenk</option>
                    <option value="hud">Kopffest</option>
                    <option value="world">Frei in der Welt</option>
                </select>
            </span>
            <span v-if="st.settings.vrPanel && st.settings.vrMiniMode !== 'wrist'" class="tgl"
                title="Größe der Mini-Fläche in Metern">
                Mini-Größe
                <input v-model.number="st.settings.vrMiniWidth" type="number" min="0.1" max="1.5"
                    step="0.05" class="tgl-num wide" @change="saveVrSettings" />m
            </span>
            <button v-if="st.settings.vrPanel && st.settings.vrMiniMode === 'hud'" class="btn"
                title="Kopffesten Mini wieder auf die Standardposition setzen" @click="resetMiniOffset">
                Mini zentrieren
            </button>
            <span v-if="st.settings.vrPanel" class="tgl"
                title="Wo der große Chat sitzt — unabhängig vom Mini. Kopffest lässt sich per Ziehleiste verschieben.">
                VR: Panel
                <select v-model="st.settings.vrBigMode" class="tgl-select" @change="saveVrSettings">
                    <option value="hud">Kopffest</option>
                    <option value="world">Frei in der Welt</option>
                </select>
            </span>
            <button v-if="st.settings.vrPanel && st.settings.vrBigMode === 'hud'" class="btn"
                title="Kopffestes Panel wieder mittig vor den Kopf setzen" @click="resetHudOffset">
                Panel zentrieren
            </button>
            <span v-if="st.settings.vrPanel && st.settings.vrMiniMode === 'wrist'" class="tgl"
                title="Welches Handgelenk den Mini trägt">
                VR: Hand
                <select v-model="st.settings.vrWristHand" class="tgl-select" @change="saveVrSettings">
                    <option value="auto">automatisch</option>
                    <option value="left">links</option>
                    <option value="right">rechts</option>
                </select>
            </span>
            <label v-if="st.settings.vrPanel && st.settings.vrMiniMode === 'wrist'" class="tgl"
                title="Aus: der Mini hängt dauerhaft am Handgelenk — beim Wegdrehen siehst du nur seine Rückseite, die ist naturgemäß unsichtbar. An: er erscheint erst innerhalb des Blickwinkels und bleibt danach noch die Nachleuchtzeit stehen.">
                <input type="checkbox" v-model="st.settings.vrWristGate" @change="saveVrSettings" />
                VR: nur beim Hinsehen
            </label>
            <template v-if="st.settings.vrPanel && st.settings.vrMiniMode === 'wrist' && st.settings.vrWristGate">
                <span class="tgl"
                    title="Blickwinkel-Kegel: kleiner heißt, du musst genauer hinschauen; größer heißt, der Mini erscheint früher">
                    Blickwinkel
                    <input v-model.number="st.settings.vrWristAngle" type="number" min="5" max="90"
                        class="tgl-num" @change="saveVrSettings" />°
                </span>
                <span class="tgl" title="Wie lange der Mini nach dem Wegdrehen noch stehen bleibt">
                    Nachleuchten
                    <input v-model.number="st.settings.vrWristHold" type="number" min="0" max="10"
                        step="0.2" class="tgl-num" @change="saveVrSettings" />s
                </span>
            </template>
            <span v-if="st.settings.vrPanel" class="tgl" title="Mini-Anzeigedauer bei neuer Nachricht (Sekunden)">
                Mini
                <input v-model.number="st.settings.vrFlashSec" type="number" min="2" max="120"
                    class="tgl-num" @change="saveVrSettings" />s
            </span>
            <span class="spacer"></span>
            <span v-if="st.lastError" class="err">{{ st.lastError }}</span>
        </div>
        <div v-if="soundPanel" class="sound-panel">
            <div class="sp-row">
                <strong>Töne</strong>
                <span class="sp-hint">Klick auf ▶ hört den Ton probeweise ab.</span>
                <span class="spacer"></span>
                <button class="btn" @click="soundPanel = false">schließen</button>
            </div>
            <div v-for="ev in SOUND_EVENTS" :key="ev.key" class="sp-row">
                <span class="sp-label">{{ ev.label }}</span>
                <select v-model="st.settings[ev.key]" class="tgl-select" @change="saveVrSettings">
                    <option v-for="s in BUILTIN_SOUNDS" :key="s.id" :value="s.id">{{ s.label }}</option>
                    <option value="custom" :disabled="!hasCustomSound">
                        Eigener Ton{{ customLabel }}
                    </option>
                    <option value="none">stumm</option>
                </select>
                <button class="btn" title="Anhören" @click="preview(ev.key)">▶</button>
                <span class="sp-label">Vibration</span>
                <select v-model="st.settings[ev.haptic]" class="tgl-select" @change="saveVrSettings">
                    <option v-for="p in HAPTIC_PATTERNS" :key="p.id" :value="p.id">{{ p.label }}</option>
                </select>
                <button class="btn" title="Vibration testen" @click="previewHaptic(ev.key)">≈</button>
            </div>
            <div class="sp-row">
                <span class="sp-label">Lautstärke</span>
                <input v-model.number="st.settings.soundVolume" type="range" min="0" max="1"
                    step="0.05" @change="saveVrSettings" />
                <span class="sp-val">{{ Math.round((st.settings.soundVolume ?? 0.6) * 100) }} %</span>
                <span class="sp-label">Vibrationsstärke</span>
                <input v-model.number="st.settings.vrHapticStrength" type="range" min="0.05" max="1"
                    step="0.05" @change="saveVrSettings" />
                <span class="sp-val">{{ Math.round((st.settings.vrHapticStrength ?? 0.75) * 100) }} %</span>
            </div>
            <div class="sp-row">
                <span class="sp-label">Eigener Ton</span>
                <input ref="soundFileEl" type="file" accept="audio/*" class="sp-file"
                    @change="onSoundFile" />
                <button v-if="hasCustomSound" class="btn" @click="preview('custom')">▶ anhören</button>
                <button v-if="hasCustomSound" class="btn" @click="clearCustomSound">entfernen</button>
                <span v-if="soundError" class="err">{{ soundError }}</span>
                <span v-else class="sp-hint">audio/*, max. 512 KB — wird lokal gespeichert.</span>
            </div>
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
                            <template v-else>
                                <template v-for="(part, pi) in msgParts(m.text)" :key="pi">
                                    <span v-if="part.type === 'text'">{{ part.value }}</span>
                                    <img
                                        v-else-if="part.type === 'image' && st.settings.mediaShow"
                                        :src="part.value"
                                        class="msg-media"
                                        :style="{ maxHeight: st.settings.mediaMaxPx + 'px' }"
                                        loading="lazy"
                                        @click="lightbox = part.value"
                                    />
                                    <video
                                        v-else-if="part.type === 'video' && st.settings.mediaShow && st.settings.mediaVideo"
                                        :src="part.value"
                                        class="msg-media"
                                        :style="{ maxHeight: st.settings.mediaMaxPx + 'px' }"
                                        controls
                                        loop
                                        muted
                                    ></video>
                                    <img
                                        v-else-if="part.type === 'embed' && st.settings.mediaShow && embeds[part.value]"
                                        :src="embeds[part.value].url"
                                        class="msg-media"
                                        :style="{ maxHeight: st.settings.mediaMaxPx + 'px' }"
                                        loading="lazy"
                                        @error="onEmbedError($event, part.value)"
                                        @click="lightbox = embeds[part.value].url"
                                    />
                                    <a v-else class="msg-link" @click="openUrl(part.value)">{{ part.value }}</a>
                                </template>
                            </template>
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
                <div v-if="lightbox" class="lightbox" @click="lightbox = ''">
                    <img :src="lightbox" />
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
    DEFAULT_MEDIA,
    parseMessage,
    resolveEmbed
} from './media';
import {
    BUILTIN_SOUNDS,
    DEFAULT_SOUNDS,
    isValidSoundDataUrl,
    playSound,
    readSoundFile
} from './sounds';
import {
    DEFAULT_VR_PANEL,
    GESTURE_BUTTONS,
    HAPTIC_PATTERNS,
    gestureButtonLabel,
    hapticPatternFor,
    learnGesture,
    migrateGestureButton,
    migrateLaserCalibration,
    migrateVrModes,
    refreshVrPanelConfig,
    vrHaptic
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

// P3: Medien im Chat. Die Nachricht bleibt Text mit URL — hier wird sie nur
// für die Anzeige zerlegt. Betrachter-Seiten (Tenor/Giphy) werden per oEmbed
// nachgeladen, ohne API-Key und ohne Rehosting auf dem Pool-Server.
const lightbox = ref('');
const embeds = ref({});
const partsCache = new Map();

function msgParts(text) {
    let parts = partsCache.get(text);
    if (!parts) {
        parts = parseMessage(text);
        partsCache.set(text, parts);
        if (partsCache.size > 500) {
            partsCache.delete(partsCache.keys().next().value);
        }
    }
    if (st.settings.mediaShow !== false && st.settings.mediaEmbeds !== false) {
        for (const p of parts) {
            if (p.type === 'embed' && embeds.value[p.value] === undefined) {
                embeds.value[p.value] = null; // verhindert Mehrfachabruf
                resolveEmbed(p.value)
                    .then((res) => {
                        if (res) embeds.value = { ...embeds.value, [p.value]: res };
                    })
                    .catch(() => {});
            }
        }
    }
    return parts;
}

/**
 * Die animierte Tenor-URL ist aus dem Standbild abgeleitet und damit geraten.
 * Lädt sie nicht, fällt die Anzeige auf das gesicherte Standbild zurück.
 */
function onEmbedError(ev, key) {
    const entry = embeds.value[key];
    if (!entry || !entry.still || ev.target.src === entry.still) return;
    ev.target.src = entry.still;
}

// P3: Töne und Vibration je Ereignisart. Ein einziger fester Beep ließ nicht
// erkennen, ob eine Pool-Nachricht, eine DM oder eine Einladung kam.
const soundPanel = ref(false);
const soundError = ref('');
const soundFileEl = ref(null);
const SOUND_EVENTS = [
    { key: 'soundGlobal', haptic: 'vrHapticPattern', label: 'Pool-Nachricht', event: 'global' },
    { key: 'soundDm', haptic: 'vrHapticDm', label: 'Direktnachricht', event: 'dm' },
    { key: 'soundInvite', haptic: 'vrHapticInvite', label: 'Join-Einladung', event: 'invite' }
];
const hasCustomSound = computed(() => isValidSoundDataUrl(st.settings.soundCustomData));
const customLabel = computed(() =>
    st.settings.soundCustomName ? ` (${st.settings.soundCustomName})` : ''
);

function preview(key) {
    // Über den echten Abspielpfad testen, damit die Vorschau nicht versehentlich
    // etwas anderes hört als die Benachrichtigung später spielt.
    const evSpec = SOUND_EVENTS.find((e) => e.key === key);
    if (!evSpec) {
        // 'custom': direkt den eigenen Ton, unabhängig von der Zuordnung
        playSound({ ...st.settings, soundGlobal: 'custom' }, 'global');
        return;
    }
    playSound(st.settings, evSpec.event);
}

function previewHaptic(key) {
    const evSpec = SOUND_EVENTS.find((e) => e.key === key);
    vrHaptic(
        st.settings.vrHapticHand || 'both',
        hapticPatternFor(st.settings, evSpec ? evSpec.event : 'global'),
        st.settings.vrHapticStrength
    );
}

async function onSoundFile(ev) {
    soundError.value = '';
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
        const res = await readSoundFile(file);
        st.settings.soundCustomData = res.dataUrl;
        st.settings.soundCustomName = res.name;
        await saveVrSettings();
    } catch (err) {
        soundError.value = String(err.message || err);
    } finally {
        if (soundFileEl.value) soundFileEl.value.value = '';
    }
}

async function clearCustomSound() {
    st.settings.soundCustomData = '';
    st.settings.soundCustomName = '';
    // Zuordnungen, die auf den entfernten Ton zeigten, auf den Standard holen —
    // sonst wäre das Ereignis unbeabsichtigt stumm.
    for (const e of SOUND_EVENTS) {
        if (st.settings[e.key] === 'custom') st.settings[e.key] = DEFAULT_SOUNDS[e.key];
    }
    await saveVrSettings();
}

function openUrl(url) {
    try {
        if (typeof AppApi !== 'undefined' && AppApi.OpenLink) AppApi.OpenLink(url);
        else window.open(url, '_blank', 'noopener');
    } catch (err) {
        ctx.warn('open link failed:', err);
    }
}

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
    // Altbestände (cm-Laserkalibrierung, gemeinsamer vrMode) überführen, bevor
    // Defaults greifen — sonst schreibt der nächste Toggle die veralteten Keys
    // zurück und die Migration läuft beim nächsten Start erneut.
    const laser = migrateLaserCalibration(st.settings);
    if (laser.changed) {
        Object.assign(st.settings, laser.settings);
        delete st.settings.vrLaserOffX;
        delete st.settings.vrLaserOffY;
    }
    const modes = migrateVrModes(st.settings);
    if (modes.changed) {
        Object.assign(st.settings, modes.settings);
        delete st.settings.vrMode;
    }
    const gest = migrateGestureButton(st.settings);
    if (gest.changed) Object.assign(st.settings, gest.settings);
    for (const [k, v] of Object.entries({
        ...DEFAULT_VR_PANEL,
        ...DEFAULT_MEDIA,
        ...DEFAULT_SOUNDS
    })) {
        if (st.settings[k] === undefined) st.settings[k] = v;
    }
}

/** Verschobenes kopffestes Panel auf die Standardposition zurücksetzen. */
function resetHudOffset() {
    st.settings.vrHudOffX = DEFAULT_VR_PANEL.vrHudOffX;
    st.settings.vrHudOffY = DEFAULT_VR_PANEL.vrHudOffY;
    st.settings.vrHudOffZ = DEFAULT_VR_PANEL.vrHudOffZ;
    saveVrSettings();
}

/** Verschobenen kopffesten Mini zurücksetzen. */
function resetMiniOffset() {
    st.settings.vrMiniOffX = DEFAULT_VR_PANEL.vrMiniOffX;
    st.settings.vrMiniOffY = DEFAULT_VR_PANEL.vrMiniOffY;
    st.settings.vrMiniOffZ = DEFAULT_VR_PANEL.vrMiniOffZ;
    saveVrSettings();
}

// Gesten-Taste: Auswahl aus bekannten Masken oder in VR anlernen. Das Overlay
// meldet die gelernte Maske über die normale config-Aktion zurück, deshalb
// beobachten wir hier einfach die Einstellung.
const gestureLearning = ref(false);
const knownGestureMask = computed(() =>
    GESTURE_BUTTONS.some((b) => b.mask === st.settings.vrGestureMask)
);

function startLearnGesture() {
    gestureLearning.value = true;
    learnGesture();
}

watch(
    () => st.settings.vrGestureMask,
    () => {
        gestureLearning.value = false;
    }
);
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
.sound-panel {
    border: 1px solid var(--border, #444);
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.sp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
}
.sp-label { color: var(--muted-foreground, #999); min-width: 96px; }
.sp-val { min-width: 44px; color: var(--muted-foreground, #999); }
.sp-hint { color: var(--muted-foreground, #888); font-size: 11px; }
.sp-file { font-size: 11px; color: var(--foreground, inherit); max-width: 260px; }
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
.msg-media {
    display: block;
    max-width: 100%;
    border-radius: 8px;
    margin: 4px 0;
    cursor: zoom-in;
    background: color-mix(in srgb, var(--foreground, #888) 6%, transparent);
}
.msg-link {
    color: var(--accent, #3498db);
    cursor: pointer;
    word-break: break-all;
    text-decoration: underline;
}
.lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
    cursor: zoom-out;
}
.lightbox img { max-width: 92vw; max-height: 92vh; border-radius: 8px; }
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
    background: var(--background, #1f1f24);
    color: var(--foreground, #eee);
    border: 1px solid var(--border, #4443);
    border-radius: 6px;
    font-size: 12px;
    padding: 2px 6px;
}
/* Aufgeklappte Listen zeichnet das Betriebssystem, nicht die Seite: mit
   transparentem Hintergrund und geerbter Schriftfarbe stand die Liste weiß
   auf weiß. Beide Farben müssen deshalb explizit auf den Optionen sitzen. */
.tgl-select option {
    background: #23232a;
    color: #eee;
}
.tgl-num { width: 48px; }
.tgl-num.wide { width: 62px; }
.btn.learning {
    border-color: #f1c40f;
    color: #f1c40f;
}
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
