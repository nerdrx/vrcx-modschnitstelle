import { describe, expect, it } from 'vitest';
import { DEFAULT_VR_PANEL } from '../vrpanel';

/**
 * Nachbau der Entwurfslogik aus vr-chat.html (die Seite ist statisch und
 * self-contained, deshalb hier als reine Funktion gespiegelt).
 *
 * Hintergrund: GetKeyboardText der SteamVR-Minimal-Tastatur ist unbrauchbar.
 * Es lieferte erst ein NUL, nach dem Filter dann nur noch das ERSTE getippte
 * Zeichen (Log: 12x char input, danach "Done, raw len 1"). Beides hat den
 * Entwurf zerstört. Regel: der Zeichenstrom gewinnt, Done darf nie kürzen.
 */
const CTRL = /[\u0000-\u001f\u007f]/g;
const printable = (s) => (s || '').replace(CTRL, '');

export function applyKeyboardDone(state, text) {
    const t = printable(text).trim();
    if (!t) return state;
    if (state.kbStreamed > 0) return state;
    if (t.length < state.draft.length) return state;
    return { ...state, draft: t };
}

export function applyKeyboardChar(state, text) {
    let draft = state.draft;
    let streamed = state.kbStreamed;
    let submit = false;
    for (const ch of text || '') {
        streamed++;
        if (ch === '\b' || ch === '\u007f') draft = draft.slice(0, -1);
        else if (ch === '\n' || ch === '\r') submit = true;
        else if (ch >= ' ') draft += ch;
    }
    return { draft, kbStreamed: streamed, submit };
}

const fresh = (draft = '', kbStreamed = 0) => ({ draft, kbStreamed });

describe('SteamVR-Tastatur: Entwurf', () => {
    it('verwirft das NUL aus GetKeyboardText', () => {
        const out = applyKeyboardDone(fresh('Hallo Welt'), '\u0000');
        expect(out.draft).toBe('Hallo Welt');
    });

    it('lässt den Entwurf stehen, wenn Done nur das erste Zeichen liefert', () => {
        let s = fresh();
        s = { ...s, ...applyKeyboardChar(s, 'Servus') };
        expect(s.draft).toBe('Servus');
        const out = applyKeyboardDone(s, 'S'); // genau der beobachtete Fall
        expect(out.draft).toBe('Servus');
    });

    it('kürzt auch ohne Zeichenstrom nicht', () => {
        const out = applyKeyboardDone(fresh('Servus', 0), 'S');
        expect(out.draft).toBe('Servus');
    });

    it('übernimmt Done, wenn nichts gestreamt wurde und der Text länger ist', () => {
        const out = applyKeyboardDone(fresh('', 0), 'Guten Abend');
        expect(out.draft).toBe('Guten Abend');
    });

    it('behandelt Backspace und Enter im Zeichenstrom', () => {
        let s = fresh();
        s = { ...s, ...applyKeyboardChar(s, 'Hallp') };
        s = { ...s, ...applyKeyboardChar(s, '\b') };
        s = { ...s, ...applyKeyboardChar(s, 'o') };
        expect(s.draft).toBe('Hallo');
        const r = applyKeyboardChar(s, '\n');
        expect(r.submit).toBe(true);
    });

    it('filtert Steuerzeichen aus dem Zeichenstrom', () => {
        const r = applyKeyboardChar(fresh(), 'A\u0000B\u0001C');
        expect(r.draft).toBe('ABC');
    });
});

describe('Blickwinkel-Gate', () => {
    it('hat Winkel und Nachleuchtzeit als eigene Einstellungen', () => {
        expect(DEFAULT_VR_PANEL.vrWristAngle).toBe(30);
        expect(DEFAULT_VR_PANEL.vrWristHold).toBeGreaterThan(0);
        expect(DEFAULT_VR_PANEL.vrWristGate).toBe(false);
    });
});
