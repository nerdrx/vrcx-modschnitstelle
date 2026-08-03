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
    loadHistory,
    markRead,
    sendMessage,
    sendTyping
} from './chat';
import { kvGet, kvSet } from './db';

export const DEFAULT_VR_PANEL = {
    vrPanel: false, // Panel aktiv
    // Mini und großes Panel sind unabhängig positionierbar — sonst liesse sich
    // "Mini am Handgelenk + großes Panel frei in der Welt" nicht kombinieren.
    vrMiniMode: 'wrist', // 'wrist' | 'hud' (kopffest) | 'world' (frei abgelegt)
    vrBigMode: 'hud', // 'hud' (kopffest, per Dragbar verschiebbar) | 'world'
    vrHudOffX: 0, // kopffestes Panel: Offset in cm (HMD-lokal)
    vrHudOffY: -15,
    vrHudOffZ: -85,
    vrMiniOffX: 0, // kopffester Mini: Offset in cm (HMD-lokal)
    vrMiniOffY: -22,
    vrMiniOffZ: -60,
    vrMiniWidth: 0.26, // Mini-Breite in Metern (hud/world)
    vrAlpha: 0.9,
    vrCurvature: 0.08,
    vrWidth: 0.6,
    vrAutoShow: true, // neue Nachricht: Mini-Flash (wrist) bzw. aufklappen
    // Controller-Geste öffnet/schließt den großen Chat. Taste, Hand, Haltezeit
    // und Auslöseart sind einstellbar — Grip ist im Spiel eine Alltagsbewegung
    // und öffnet den Chat sonst ständig ungewollt.
    vrGesture: true,
    vrGestureMask: 2, // Tastenmaske (2 = B/Y bzw. Menü, 4 = Grip, 128 = A/X)
    vrGestureHand: 'both', // 'both' | 'left' | 'right'
    vrGestureHold: 1000, // Haltezeit in ms (Modus 'hold')
    vrGestureMode: 'hold', // 'hold' | 'double' (Doppeltipp)
    // Laser-Kalibrierung in GRAD. Ein cm-Offset der Strahlquelle erzeugt einen
    // distanzabhängigen Bildversatz und "wandert" über die Panelfläche; eine
    // Winkelkorrektur bleibt überall konstant.
    vrLaserPitch: 41.5, // Laser-Neigung nach unten (Grad, Index-kalibriert)
    vrLaserYaw: 5.9, // Laser seitlich (Grad, Index-kalibriert)
    vrFlashSec: 10, // Mini-Anzeigedauer bei neuer Nachricht
    vrWristLock: false, // Wrist-Mini verschieben gesperrt
    vrWristGate: false, // true = Mini nur beim Blick aufs Handgelenk, false = dauerhaft
    // 'auto' folgt der VRCX-Overlay-Hand, 'left'/'right' überstimmen sie.
    vrWristHand: 'auto',
    vrWristAngle: 30, // Blickwinkel-Kegel in Grad (kleiner = später sichtbar)
    vrWristHold: 1.2, // Nachleuchten nach dem Wegdrehen in Sekunden
    vrWristOffX: 0, // Wrist-Mini-Offset (cm, Controller-lokal)
    vrWristOffY: 0,
    vrWristOffZ: 0,
    // Benachrichtigungen (bei DND alle stumm):
    vrNotySound: true,
    vrNotyVisual: true,
    vrNotyHaptic: true,
    vrHapticHand: 'both' // 'left' | 'right' | 'both'
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

/**
 * Migration der Laser-Kalibrierung: bis P2-Runde 5 wurden H/V als cm-Offset
 * der Strahlquelle gespeichert. Das ist ein Parallaxe-Fehler (wandert über
 * die Panelfläche), deshalb jetzt Winkel. Umrechnung bei ~1 m Panel-Distanz:
 * 1 cm entspricht atan(0.01) ≈ 0,573°.
 *   H  (+ = außen)     -> vrLaserYaw   (+ = außen)
 *   V  (+ = oben)      -> vrLaserPitch (Pitch kippt nach unten => Vorzeichen dreht)
 * Pure Funktion, damit sie testbar bleibt.
 */
export const CM_PER_DEG = 0.5729578; // atan(0.01) in Grad

export function migrateLaserCalibration(cs) {
    const out = { ...cs };
    let changed = false;
    if (out.vrLaserYaw === undefined && typeof out.vrLaserOffX === 'number') {
        out.vrLaserYaw = Math.round(out.vrLaserOffX * CM_PER_DEG * 10) / 10;
        changed = true;
    }
    if (typeof out.vrLaserOffY === 'number') {
        const base = typeof out.vrLaserPitch === 'number'
            ? out.vrLaserPitch
            : DEFAULT_VR_PANEL.vrLaserPitch;
        out.vrLaserPitch = Math.round((base - out.vrLaserOffY * CM_PER_DEG) * 10) / 10;
        changed = true;
    }
    if (changed) {
        delete out.vrLaserOffX;
        delete out.vrLaserOffY;
    }
    return { settings: out, changed };
}

/**
 * Bis P2-Runde 6 gab es einen einzigen vrMode für Mini UND großes Panel —
 * damit war "Mini am Handgelenk + Panel frei in der Welt" nicht möglich.
 * Jetzt zwei unabhängige Felder. Abbildung des alten Werts:
 *   wrist -> Mini am Handgelenk, Panel kopffest
 *   hud   -> beides kopffest
 *   world -> Mini kopffest, Panel frei in der Welt
 * Pure Funktion (testbar).
 */
export function migrateVrModes(cs) {
    if (cs.vrMode === undefined) return { settings: { ...cs }, changed: false };
    const out = { ...cs };
    if (out.vrMiniMode === undefined) {
        out.vrMiniMode = out.vrMode === 'wrist' ? 'wrist' : 'hud';
    }
    if (out.vrBigMode === undefined) {
        out.vrBigMode = out.vrMode === 'world' ? 'world' : 'hud';
    }
    delete out.vrMode;
    return { settings: out, changed: true };
}

async function pushConfig(ctx) {
    const stored = await kvGet(ctx, 'chat_settings', {});
    const laser = migrateLaserCalibration(stored);
    const modes = migrateVrModes(laser.settings);
    const cs = modes.settings;
    if (laser.changed || modes.changed) {
        await kvSet(ctx, 'chat_settings', cs);
        if (laser.changed) {
            ctx.log(
                `Laser-Kalibrierung migriert: Yaw ${cs.vrLaserYaw}°, Pitch ${cs.vrLaserPitch}°`
            );
        }
        if (modes.changed) {
            ctx.log(
                `VR-Positionen migriert: Mini ${cs.vrMiniMode}, Panel ${cs.vrBigMode}`
            );
        }
    }
    const s = { ...DEFAULT_VR_PANEL, ...cs };
    vrCall('config', {
        enabled: !!s.vrPanel && chatState.enabled,
        miniMode: s.vrMiniMode,
        bigMode: s.vrBigMode,
        hudOffX: s.vrHudOffX,
        hudOffY: s.vrHudOffY,
        hudOffZ: s.vrHudOffZ,
        miniOffX: s.vrMiniOffX,
        miniOffY: s.vrMiniOffY,
        miniOffZ: s.vrMiniOffZ,
        miniWidth: s.vrMiniWidth,
        gestureMask: s.vrGestureMask,
        gestureHand: s.vrGestureHand,
        gestureHold: s.vrGestureHold,
        gestureMode: s.vrGestureMode,
        alpha: s.vrAlpha,
        curvature: s.vrCurvature,
        width: s.vrWidth,
        autoShow: s.vrAutoShow,
        gesture: s.vrGesture,
        laserPitch: s.vrLaserPitch,
        laserYaw: s.vrLaserYaw,
        flashSec: s.vrFlashSec,
        wristLock: s.vrWristLock,
        wristGate: s.vrWristGate,
        wristHand: s.vrWristHand,
        wristAngle: s.vrWristAngle,
        wristHold: s.vrWristHold,
        wristOffX: s.vrWristOffX,
        wristOffY: s.vrWristOffY,
        wristOffZ: s.vrWristOffZ,
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
            ctx.log('vr action:', a.type, a.channel || ''); // Diagnose Send-Pfad
            if (a.type === 'send' && a.channel && a.text) {
                const ok = sendMessage(a.channel, a.text);
                if (!ok) ctx.warn('vr send failed: WS nicht verbunden');
            } else if (a.type === 'read' && a.channel) {
                markRead(a.channel);
            } else if (a.type === 'typing' && a.channel) {
                sendTyping(a.channel);
            } else if (a.type === 'refresh') {
                // Panel neu geladen: Config + kompletten State erneut pushen
                lastPayload = '';
                await pushConfig(ctx);
                pushState();
            } else if (a.type === 'history' && a.channel) {
                await loadHistory(a.channel);
                lastPayload = '';
                pushState();
            } else if (a.type === 'config') {
                // Panel-seitige Änderungen persistieren
                const cs = await kvGet(ctx, 'chat_settings', {});
                if (a.miniMode !== undefined) cs.vrMiniMode = a.miniMode;
                if (a.bigMode !== undefined) cs.vrBigMode = a.bigMode;
                if (a.hudOffX !== undefined) cs.vrHudOffX = a.hudOffX;
                if (a.hudOffY !== undefined) cs.vrHudOffY = a.hudOffY;
                if (a.hudOffZ !== undefined) cs.vrHudOffZ = a.hudOffZ;
                if (a.miniOffX !== undefined) cs.vrMiniOffX = a.miniOffX;
                if (a.miniOffY !== undefined) cs.vrMiniOffY = a.miniOffY;
                if (a.miniOffZ !== undefined) cs.vrMiniOffZ = a.miniOffZ;
                if (a.miniWidth !== undefined) cs.vrMiniWidth = a.miniWidth;
                if (a.gestureMask !== undefined) cs.vrGestureMask = a.gestureMask;
                if (a.gestureHand !== undefined) cs.vrGestureHand = a.gestureHand;
                if (a.gestureHold !== undefined) cs.vrGestureHold = a.gestureHold;
                if (a.gestureMode !== undefined) cs.vrGestureMode = a.gestureMode;
                if (a.wristAngle !== undefined) cs.vrWristAngle = a.wristAngle;
                if (a.wristHold !== undefined) cs.vrWristHold = a.wristHold;
                if (a.alpha !== undefined) cs.vrAlpha = a.alpha;
                if (a.curvature !== undefined) cs.vrCurvature = a.curvature;
                if (a.width !== undefined) cs.vrWidth = a.width;
                if (a.laserPitch !== undefined) cs.vrLaserPitch = a.laserPitch;
                if (a.laserYaw !== undefined) cs.vrLaserYaw = a.laserYaw;
                if (a.wristLock !== undefined) cs.vrWristLock = a.wristLock;
                if (a.wristGate !== undefined) cs.vrWristGate = a.wristGate;
                if (a.wristHand !== undefined) cs.vrWristHand = a.wristHand;
                if (a.wristOffX !== undefined) cs.vrWristOffX = a.wristOffX;
                if (a.wristOffY !== undefined) cs.vrWristOffY = a.wristOffY;
                if (a.wristOffZ !== undefined) cs.vrWristOffZ = a.wristOffZ;
                await kvSet(ctx, 'chat_settings', cs);
                // Auch den reaktiven State nachziehen, sonst zeigt die
                // Desktop-UI weiter die alten Werte (z. B. die in VR
                // angelernte Gesten-Taste).
                Object.assign(chatState.settings, cs);
            }
        } catch (err) {
            ctx.warn('vr panel action failed:', err.message || err);
        }
    };
}

/** Haptik-Puls im Overlay-Prozess auslösen (Hand laut Settings). */
export function vrHaptic(hand) {
    vrCall('haptic', { hand: hand || 'both' });
}

/** Nach initChat aufrufen. Läuft passiv (1s-Poll + Diff), bis stopVrPanel. */
export async function startVrPanel(ctx) {
    modCtx = ctx;
    window.__vrcxChatAction = onAction(ctx);
    // Global-Historie vorladen — Panel soll nicht leer starten
    loadHistory('global').catch(() => {});
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

/**
 * Lernmodus starten: die nächste im VR gedrückte Controller-Taste wird zur
 * Gesten-Taste. Das Overlay meldet die Maske über die normale config-Aktion
 * zurück, deshalb reicht hier der Anstoß.
 */
export function learnGesture() {
    vrCall('learnGesture', {});
}

/** Bekannte Tastenmasken für die Auswahl in der Desktop-UI. */
export const GESTURE_BUTTONS = [
    { mask: 2, label: 'B / Y (Menü)' },
    { mask: 4, label: 'Grip' },
    { mask: 128, label: 'A / X' },
    { mask: 4294967296, label: 'Stick-Klick' }
];

export function gestureButtonLabel(mask) {
    const hit = GESTURE_BUTTONS.find((b) => b.mask === mask);
    return hit ? hit.label : `Taste ${mask}`;
}
