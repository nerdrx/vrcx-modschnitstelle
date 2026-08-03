// ============================================================================
// Global DB mod — Benachrichtigungstöne.
// Bisher gab es genau einen fest verdrahteten 880-Hz-Beep. Eigene Töne wären
// als mitgelieferte Audiodateien teuer: jedes Asset müsste durch den
// VRCX-Build und im VR-Panel noch einmal separat geladen werden. Deshalb
// werden die eingebauten Töne weiterhin per WebAudio synthetisiert — aber
// datengetrieben: eine spec ist ein reiner Datensatz, damit Auswahl-Logik
// und Tonaufbau ohne Audio-Stack prüfbar bleiben.
// Eigene Dateien laufen bewusst über einen zweiten, getrennten Pfad
// (data-URL + <audio>), weil sie sich nicht synthetisieren lassen.
// ============================================================================

// Grundpegel aller Töne. Eine Benachrichtigung soll auffallen, nicht
// erschrecken — die spec-gain-Werte sind Verhältnisse dazu, kein Absolutpegel.
const BASE_GAIN = 0.16;

// exponentialRampToValueAtTime akzeptiert keine 0 als Ziel, deshalb ein
// hörbar stiller, aber positiver Endwert.
const SILENCE = 0.0001;

/** Standard-Limit für eigene Töne: groß genug für einen kurzen Jingle,
 *  klein genug, dass die data-URL problemlos in die Settings-KV passt. */
export const MAX_SOUND_BYTES = 512 * 1024;

/**
 * Eingebaute Töne. `spec.steps` beschreibt die Synthese:
 *   freq  Grundfrequenz in Hz
 *   dur   Dauer in Sekunden
 *   type  Oszillator-Wellenform
 *   gain  relativer Pegel (0..1) zu BASE_GAIN
 *   at    optionaler Startzeitpunkt relativ zum Tonbeginn; fehlt er, hängt
 *         der Schritt hinten an — so entstehen Sequenzen ohne Zeitrechnerei,
 *         und ein gemeinsames `at` erzeugt einen Zusammenklang.
 */
export const BUILTIN_SOUNDS = [
    {
        id: 'ping',
        label: 'Ping (kurz)',
        spec: { steps: [{ freq: 880, dur: 0.18, type: 'sine', gain: 0.5 }] }
    },
    {
        id: 'duo',
        label: 'Zweiklang (weich)',
        spec: {
            steps: [
                { freq: 523.25, dur: 0.26, type: 'sine', gain: 0.45, at: 0 },
                { freq: 659.25, dur: 0.32, type: 'sine', gain: 0.35, at: 0.06 }
            ]
        }
    },
    {
        id: 'rise',
        label: 'Aufsteigendes Trio',
        spec: {
            steps: [
                { freq: 523.25, dur: 0.1, type: 'triangle', gain: 0.45 },
                { freq: 659.25, dur: 0.1, type: 'triangle', gain: 0.45 },
                { freq: 783.99, dur: 0.16, type: 'triangle', gain: 0.5 }
            ]
        }
    },
    {
        id: 'blubb',
        label: 'Tiefer Blubb',
        spec: {
            steps: [
                { freq: 220, dur: 0.09, type: 'sine', gain: 0.6 },
                { freq: 130, dur: 0.22, type: 'sine', gain: 0.55 }
            ]
        }
    },
    {
        id: 'klick',
        label: 'Dezenter Klick',
        spec: { steps: [{ freq: 1600, dur: 0.03, type: 'square', gain: 0.16 }] }
    },
    {
        id: 'alarm',
        label: 'Doppelton (auffällig)',
        spec: {
            steps: [
                { freq: 988, dur: 0.12, type: 'sawtooth', gain: 0.4, at: 0 },
                { freq: 988, dur: 0.14, type: 'sawtooth', gain: 0.45, at: 0.2 }
            ]
        }
    }
];

// Welche Settings-Taste zu welchem Ereignis gehört. Als Tabelle statt if-Kette,
// damit ein unbekanntes Ereignis kontrolliert auf 'global' fällt.
const EVENT_KEYS = {
    global: 'soundGlobal',
    dm: 'soundDm',
    invite: 'soundInvite'
};

export const DEFAULT_SOUNDS = {
    soundEnabled: true, // Töne überhaupt abspielen
    soundVolume: 0.6, // 0..1, Gesamtlautstärke
    soundGlobal: 'ping', // builtin-id oder 'custom' (oder 'none' = stumm)
    soundDm: 'duo',
    soundInvite: 'rise',
    soundCustomData: '', // data:audio/...;base64,... der eigenen Datei
    soundCustomName: '' // nur zur Anzeige in den Einstellungen
};

/** Ton anhand seiner id, null wenn unbekannt. */
export function soundById(id) {
    return BUILTIN_SOUNDS.find((s) => s.id === id) || null;
}

function clampVolume(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return 1;
    return Math.min(1, Math.max(0, v));
}

function formatBytes(bytes) {
    return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

// Ein AudioContext pro Renderer reicht; Browser begrenzen die Anzahl und das
// Anlegen kostet spürbar Zeit. Deshalb lazy angelegt und wiederverwendet.
let sharedCtx = null;

function acquireCtx(injected) {
    if (injected) return injected;
    if (sharedCtx) return sharedCtx;
    const Ctor =
        typeof window !== 'undefined' &&
        (window.AudioContext || window.webkitAudioContext);
    if (!Ctor) return null;
    sharedCtx = new Ctor();
    return sharedCtx;
}

/** Verwirft den geteilten Context — für Tests und für den Mod-Stop. */
export function resetAudioContext() {
    try {
        if (sharedCtx && typeof sharedCtx.close === 'function') sharedCtx.close();
    } catch {
        // Ein bereits geschlossener Context wirft; das ist genau der Zustand,
        // den wir herstellen wollten.
    }
    sharedCtx = null;
}

/**
 * Spielt eine spec ab. opts: { volume (0..1), audioCtx (injizierbar) }.
 * Rückgabe true, wenn die Töne eingeplant wurden.
 *
 * Fehler werden hier bewusst abgefangen statt weitergereicht: Aufrufer ist der
 * Benachrichtigungspfad — eine gesperrte Autoplay-Policy oder ein fehlender
 * AudioContext darf niemals das Anzeigen der Nachricht verhindern. Damit das
 * kein stilles Verschlucken bleibt, meldet der Rückgabewert den Fehlschlag,
 * und der Aufrufer kann ihn loggen.
 */
export function playSpec(spec, opts = {}) {
    const steps = spec && Array.isArray(spec.steps) ? spec.steps : null;
    if (!steps || steps.length === 0) return false;
    const volume = clampVolume(opts.volume);
    if (volume <= 0) return false;
    try {
        const ctx = acquireCtx(opts.audioCtx);
        if (!ctx) return false;
        const t0 = ctx.currentTime || 0;
        let cursor = 0;
        for (const step of steps) {
            const at = Number.isFinite(step.at) ? step.at : cursor;
            const dur = Number.isFinite(step.dur) && step.dur > 0 ? step.dur : 0.15;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = step.type || 'sine';
            osc.frequency.value = Number.isFinite(step.freq) ? step.freq : 440;
            const peak = Math.max(
                SILENCE,
                (Number.isFinite(step.gain) ? step.gain : 0.4) * volume * BASE_GAIN
            );
            gain.gain.setValueAtTime(peak, t0 + at);
            gain.gain.exponentialRampToValueAtTime(SILENCE, t0 + at + dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t0 + at);
            // Kleiner Nachlauf, damit der Ausklang nicht hart abgeschnitten wird.
            osc.stop(t0 + at + dur + 0.02);
            cursor = at + dur;
        }
        return true;
    } catch {
        return false;
    }
}

// Sicherheitsgrenze: der Wert landet später unverändert in einem <audio src>.
// Erlaubt ist deshalb ausschließlich ein base64-kodierter Audio-Datenblock —
// http(s) (Tracking, Nachladen fremder Inhalte) und javascript: (Ausführung im
// selben Renderer wie VRCX) dürfen hier nicht durchrutschen. Zeichenvorrat
// bewusst eng: ein echtes FileReader-Ergebnis enthält nichts anderes.
const SOUND_DATA_URL_RE = /^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i;

/** true nur für data:audio/...;base64,... */
export function isValidSoundDataUrl(dataUrl) {
    return typeof dataUrl === 'string' && SOUND_DATA_URL_RE.test(dataUrl);
}

/**
 * Liest die vom Nutzer gewählte Datei als data-URL ein.
 * opts: { maxBytes, FileReader (injizierbar) }.
 * Rückgabe: Promise<{ name, dataUrl, bytes }>.
 *
 * Typ und Größe werden vor dem Lesen geprüft, damit eine versehentlich
 * gewählte 40-MB-WAV gar nicht erst in den Speicher (und in die Settings-KV)
 * wandert.
 */
export function readSoundFile(file, opts = {}) {
    const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : MAX_SOUND_BYTES;
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('Keine Datei ausgewählt.'));
            return;
        }
        const type = file.type || '';
        if (!/^audio\//i.test(type)) {
            reject(
                new Error(
                    `Nur Audiodateien werden unterstützt (erkannt: ${type || 'unbekannter Typ'}).`
                )
            );
            return;
        }
        if (Number.isFinite(file.size) && file.size > maxBytes) {
            reject(
                new Error(
                    `Die Datei ist zu groß: ${formatBytes(file.size)} — erlaubt sind höchstens ${formatBytes(maxBytes)}.`
                )
            );
            return;
        }
        const Reader =
            opts.FileReader || (typeof FileReader !== 'undefined' ? FileReader : null);
        if (!Reader) {
            reject(new Error('Kein FileReader verfügbar.'));
            return;
        }
        const reader = new Reader();
        reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            if (!isValidSoundDataUrl(dataUrl)) {
                reject(new Error('Die Datei ergab keinen gültigen Audio-Datenblock.'));
                return;
            }
            resolve({
                name: file.name || 'Eigener Ton',
                dataUrl,
                bytes: Number.isFinite(file.size) ? file.size : dataUrl.length
            });
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Spielt eine data-URL über ein <audio>-Element ab.
 * opts: { volume, audio (injizierbares Element) }.
 * false bei ungültiger URL — geprüft wird vor dem Setzen von src, damit eine
 * manipulierte Einstellung nie im DOM landet.
 */
export function playDataUrl(dataUrl, opts = {}) {
    if (!isValidSoundDataUrl(dataUrl)) return false;
    try {
        const el = opts.audio || (typeof Audio !== 'undefined' ? new Audio() : null);
        if (!el) return false;
        el.src = dataUrl;
        el.volume = clampVolume(opts.volume);
        const p = el.play();
        // play() liefert im Browser ein Promise, das bei blockiertem Autoplay
        // ablehnt — unbehandelt wäre das ein Unhandled Rejection im Renderer.
        if (p && typeof p.catch === 'function') p.catch(() => {});
        return true;
    } catch {
        return false;
    }
}

function builtinResult(id, volume, fallbackId) {
    // Eine gespeicherte id kann veralten (Ton umbenannt/entfernt). Dann lieber
    // der Standardton DIESES Ereignisses als plötzlich Stille — Stille wäre
    // nicht von einem kaputten Ton zu unterscheiden.
    const snd = soundById(id) || soundById(fallbackId) || BUILTIN_SOUNDS[0];
    return { kind: 'builtin', id: snd.id, spec: snd.spec, volume };
}

/**
 * Entscheidet, was für ein Ereignis abzuspielen ist.
 * event: 'global' | 'dm' | 'invite'.
 * Rückgabe: { kind: 'builtin', id, spec, volume }
 *         | { kind: 'custom', dataUrl, name, volume }
 *         | null (stumm).
 * Reine Funktion — kein Audio, damit die Auswahl testbar bleibt.
 */
export function resolveSound(settings, event) {
    const s = settings || {};
    if (s.soundEnabled === false) return null;
    const key = EVENT_KEYS[event] || EVENT_KEYS.global;
    const choice = s[key] || DEFAULT_SOUNDS[key];
    const volume = clampVolume(
        s.soundVolume === undefined || s.soundVolume === null
            ? DEFAULT_SOUNDS.soundVolume
            : s.soundVolume
    );
    // Ein einzelnes Ereignis gezielt stummschalten (z. B. nur DMs hörbar).
    if (choice === 'none') return null;
    if (choice === 'custom') {
        if (isValidSoundDataUrl(s.soundCustomData)) {
            return {
                kind: 'custom',
                dataUrl: s.soundCustomData,
                name: s.soundCustomName || '',
                volume
            };
        }
        // 'custom' gewählt, aber die Datei fehlt oder ist unbrauchbar.
        return builtinResult(DEFAULT_SOUNDS[key], volume, DEFAULT_SOUNDS[key]);
    }
    return builtinResult(choice, volume, DEFAULT_SOUNDS[key]);
}

/**
 * Bequemer Einstiegspunkt für den Benachrichtigungspfad: auflösen und
 * abspielen in einem Schritt. Rückgabe false, wenn nichts erklang.
 */
export function playSound(settings, event, opts = {}) {
    const resolved = resolveSound(settings, event);
    if (!resolved) return false;
    const volume = opts.volume === undefined ? resolved.volume : opts.volume;
    return resolved.kind === 'custom'
        ? playDataUrl(resolved.dataUrl, { ...opts, volume })
        : playSpec(resolved.spec, { ...opts, volume });
}
