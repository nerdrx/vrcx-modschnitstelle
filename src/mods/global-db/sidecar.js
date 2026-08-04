/**
 * Voice-Sidecar-Client (P4-Integration).
 *
 * Spricht mit dem lokalen Sidecar (ws://127.0.0.1:34710): TTS (Piper),
 * STT/Push-to-Talk (faster-whisper) und Live-Translator (Argos -> OSC an die
 * VRChat-Chatbox). Der Sidecar ist ein eigener Prozess; gestartet wird er
 * optional über AppApi.StartVoiceSidecar (Pfad kommt aus den Einstellungen,
 * nichts ist hardcodiert).
 *
 * Reine Logik (Reducer, Gating, Textaufbereitung) ist als pure Functions
 * exportiert und ohne WebSocket testbar.
 */

import { reactive } from 'vue';

export const SIDECAR_URL = 'ws://127.0.0.1:34710';

/** Voreinstellungen für alle Voice-Funktionen (leben in chat_settings). */
export const DEFAULT_VOICE = {
    voiceEnabled: false, // Hauptschalter: verbinden + ggf. Prozess starten
    voiceAutostart: true, // Sidecar-Prozess von VRCX mitstarten
    sidecarPath: '', // Ordner mit start.cmd — vom User gesetzt
    vrPtt: false, // Push-to-Talk im VR-Panel
    vrPttMask: 2, // Tastenmaske (2 = B/Y bzw. Menü), Trigger ist tabu
    vrPttHand: 'left', // 'left' | 'right' | 'both'
    ttsGlobal: false, // Pool-Nachrichten vorlesen
    ttsDm: false, // Direktnachrichten vorlesen
    ttsInvite: false, // Join-Einladungen vorlesen
    translatorEnabled: false, // Live-Translator (Mikro -> OSC-Chatbox)
    translatorTarget: 'en', // 'en' | 'ru' | 'ja'
    translatorShowOriginal: false
};

/** Verbindungs-/Fähigkeitszustand, reaktiv für die UI. */
export const sidecarState = reactive({
    connected: false,
    ttsReady: false,
    sttReady: false,
    translatorReady: false,
    translatorActive: false,
    translatorTarget: '',
    voices: [],
    lastError: ''
});

/**
 * Reducer: eine Sidecar-Nachricht auf den State anwenden. Pure — gibt den
 * Ereignistyp zurück, damit der Aufrufer reagieren kann.
 */
export function reduceSidecarMessage(state, msg) {
    if (!msg || typeof msg.type !== 'string') return 'ignore';
    switch (msg.type) {
        case 'ready':
        case 'status': {
            state.ttsReady = !!(msg.tts && msg.tts.ready);
            state.sttReady = !!(msg.stt && msg.stt.ready);
            state.voices = (msg.tts && msg.tts.voices) || [];
            const tr = msg.translator || {};
            state.translatorReady = !!tr.ready;
            state.translatorActive = !!tr.active;
            state.translatorTarget = tr.target || '';
            return 'status';
        }
        case 'stt_result':
            return 'stt';
        case 'translator_final':
            return 'translated';
        case 'tts_done':
            return 'tts';
        case 'error':
            state.lastError = msg.message || 'unbekannt';
            return 'error';
        default:
            return 'ignore';
    }
}

/** true, wenn dieses Ereignis vorgelesen werden soll. */
export function shouldTts(settings, event) {
    const s = { ...DEFAULT_VOICE, ...(settings || {}) };
    if (!s.voiceEnabled) return false;
    if (event === 'dm') return !!s.ttsDm;
    if (event === 'invite') return !!s.ttsInvite;
    return !!s.ttsGlobal;
}

/** Vorlesetext: "Absender: Kurztext", auf max Zeichen gekürzt. */
export function ttsTextFor(from, body, max = 220) {
    const t = `${from || '?'}: ${body || ''}`.trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Deutsche Stimme bevorzugen, sonst erste verfügbare. */
export function pickTtsVoice(voices, pref = 'de') {
    const list = Array.isArray(voices) ? voices : [];
    return list.find((v) => v && v.startsWith(pref)) || list[0] || '';
}

// ------------------------------------------------------------- ws client --
let ws = null;
let ctxRef = null;
let wantConnection = false;
let reconnectTimer = null;
let sttResolve = null; // wartender sttStop()-Aufrufer
let startedByUs = false;

function send(obj) {
    if (!ws || ws.readyState !== 1) return false;
    try {
        ws.send(JSON.stringify(obj));
        return true;
    } catch {
        return false;
    }
}

function scheduleReconnect() {
    if (!wantConnection || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (wantConnection) connect();
    }, 5000);
}

function connect() {
    if (ws) return;
    try {
        ws = new WebSocket(SIDECAR_URL);
    } catch {
        ws = null;
        scheduleReconnect();
        return;
    }
    ws.onopen = () => {
        send({ type: 'hello', version: 1 });
    };
    ws.onmessage = (e) => {
        let msg;
        try {
            msg = JSON.parse(e.data);
        } catch {
            return;
        }
        const kind = reduceSidecarMessage(sidecarState, msg);
        if (kind === 'status' && !sidecarState.connected) {
            sidecarState.connected = true;
            ctxRef?.log('Voice-Sidecar verbunden (TTS:', sidecarState.ttsReady,
                'STT:', sidecarState.sttReady, 'Übersetzer:', sidecarState.translatorReady + ')');
        } else if (kind === 'stt' && sttResolve) {
            const r = sttResolve;
            sttResolve = null;
            r(typeof msg.text === 'string' ? msg.text.trim() : '');
        } else if (kind === 'error') {
            ctxRef?.warn('Sidecar-Fehler:', sidecarState.lastError);
        }
    };
    ws.onclose = () => {
        ws = null;
        const was = sidecarState.connected;
        sidecarState.connected = false;
        sidecarState.translatorActive = false;
        if (was) ctxRef?.log('Voice-Sidecar getrennt');
        if (sttResolve) {
            const r = sttResolve;
            sttResolve = null;
            r('');
        }
        scheduleReconnect();
    };
    ws.onerror = () => {
        try {
            ws?.close();
        } catch {}
    };
}

// ------------------------------------------------------------ public api --
/**
 * Verbindung sicherstellen. Startet bei Bedarf den Sidecar-Prozess über
 * AppApi (wenn voiceAutostart und ein Pfad gesetzt sind) und verbindet.
 */
export async function ensureSidecar(ctx, settings) {
    const s = { ...DEFAULT_VOICE, ...(settings || {}) };
    ctxRef = ctx;
    if (!s.voiceEnabled) {
        stopSidecar();
        return;
    }
    wantConnection = true;
    if (
        s.voiceAutostart &&
        s.sidecarPath &&
        typeof AppApi !== 'undefined' &&
        AppApi.StartVoiceSidecar
    ) {
        try {
            const r = await AppApi.StartVoiceSidecar(s.sidecarPath);
            if (r === 'ok') {
                startedByUs = true;
                ctx.log('Voice-Sidecar-Prozess gestartet');
            } else if (r !== 'already-running') {
                ctx.warn('Sidecar-Start:', r);
            }
        } catch (err) {
            ctx.warn('Sidecar-Start fehlgeschlagen:', err.message || err);
        }
    }
    connect();
}

/** Verbindung trennen; von uns gestartete Prozesse beenden. */
export function stopSidecar() {
    wantConnection = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try {
        ws?.close();
    } catch {}
    ws = null;
    sidecarState.connected = false;
    sidecarState.translatorActive = false;
    if (startedByUs && typeof AppApi !== 'undefined' && AppApi.StopVoiceSidecar) {
        try {
            AppApi.StopVoiceSidecar();
        } catch {}
        startedByUs = false;
    }
}

export function ttsSpeak(text, voice) {
    if (!sidecarState.connected || !sidecarState.ttsReady || !text) return false;
    const cmd = { type: 'tts', id: 'noty-' + Date.now(), text };
    if (voice) cmd.voice = voice;
    return send(cmd);
}

export function sttStart(language = 'de') {
    if (!sidecarState.connected || !sidecarState.sttReady) return false;
    return send({ type: 'stt_start', language });
}

/** Aufnahme beenden; Promise mit erkanntem Text ('' bei Timeout/Fehler). */
export function sttStop(timeoutMs = 10000) {
    return new Promise((resolve) => {
        if (!sidecarState.connected || !send({ type: 'stt_stop' })) {
            resolve('');
            return;
        }
        sttResolve = resolve;
        setTimeout(() => {
            if (sttResolve === resolve) {
                sttResolve = null;
                resolve('');
            }
        }, timeoutMs);
    });
}

/** Translator gemäß Einstellungen starten/stoppen (idempotent). */
export function applyTranslator(settings) {
    const s = { ...DEFAULT_VOICE, ...(settings || {}) };
    if (!sidecarState.connected) return;
    if (s.voiceEnabled && s.translatorEnabled) {
        send({
            type: 'translator_start',
            target: s.translatorTarget || 'en',
            source: 'de',
            show_original: !!s.translatorShowOriginal
        });
    } else if (sidecarState.translatorActive) {
        send({ type: 'translator_stop' });
    }
}
