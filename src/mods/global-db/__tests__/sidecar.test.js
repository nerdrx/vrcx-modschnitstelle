import { describe, expect, it } from 'vitest';
import {
    DEFAULT_VOICE,
    pickTtsVoice,
    reduceSidecarMessage,
    shouldTts,
    ttsTextFor
} from '../sidecar';

const freshState = () => ({
    connected: false,
    ttsReady: false,
    sttReady: false,
    translatorReady: false,
    translatorActive: false,
    translatorTarget: '',
    voices: [],
    lastError: ''
});

describe('reduceSidecarMessage', () => {
    it('übernimmt ready-Status inkl. Translator', () => {
        const s = freshState();
        const kind = reduceSidecarMessage(s, {
            type: 'ready',
            tts: { ready: true, voices: ['de_DE-thorsten-medium', 'en_US-lessac-medium'] },
            stt: { ready: true, model: 'small' },
            translator: { ready: true, active: true, target: 'en' }
        });
        expect(kind).toBe('status');
        expect(s.ttsReady).toBe(true);
        expect(s.sttReady).toBe(true);
        expect(s.translatorReady).toBe(true);
        expect(s.translatorActive).toBe(true);
        expect(s.translatorTarget).toBe('en');
        expect(s.voices).toHaveLength(2);
    });

    it('P4-Server ohne translator-Feld bleibt kompatibel', () => {
        const s = freshState();
        reduceSidecarMessage(s, { type: 'status', tts: { ready: true }, stt: { ready: false } });
        expect(s.translatorReady).toBe(false);
        expect(s.ttsReady).toBe(true);
        expect(s.sttReady).toBe(false);
    });

    it('klassifiziert stt_result/translator_final/error', () => {
        const s = freshState();
        expect(reduceSidecarMessage(s, { type: 'stt_result', text: 'hi' })).toBe('stt');
        expect(reduceSidecarMessage(s, { type: 'translator_final' })).toBe('translated');
        expect(reduceSidecarMessage(s, { type: 'error', message: 'kaputt' })).toBe('error');
        expect(s.lastError).toBe('kaputt');
        expect(reduceSidecarMessage(s, { type: 'unbekannt' })).toBe('ignore');
        expect(reduceSidecarMessage(s, null)).toBe('ignore');
    });
});

describe('shouldTts', () => {
    it('aus, solange voiceEnabled fehlt', () => {
        expect(shouldTts({ ttsGlobal: true }, 'global')).toBe(false);
    });
    it('gated je Ereignisart', () => {
        const s = { voiceEnabled: true, ttsGlobal: true, ttsDm: false, ttsInvite: true };
        expect(shouldTts(s, 'global')).toBe(true);
        expect(shouldTts(s, 'dm')).toBe(false);
        expect(shouldTts(s, 'invite')).toBe(true);
    });
    it('Defaults: alles aus', () => {
        expect(shouldTts({ voiceEnabled: true }, 'global')).toBe(
            DEFAULT_VOICE.ttsGlobal
        );
    });
});

describe('ttsTextFor', () => {
    it('baut "Absender: Text" und kürzt lange Texte', () => {
        expect(ttsTextFor('nerdrx', 'hallo')).toBe('nerdrx: hallo');
        const long = ttsTextFor('a', 'x'.repeat(500));
        expect(long.length).toBeLessThanOrEqual(220);
        expect(long.endsWith('…')).toBe(true);
    });
    it('robust bei fehlenden Feldern', () => {
        expect(ttsTextFor(null, null)).toBe('?:');
    });
});

describe('pickTtsVoice', () => {
    const voices = ['en_US-lessac-medium', 'de_DE-thorsten-medium'];
    it('bevorzugt die gewünschte Sprache', () => {
        expect(pickTtsVoice(voices, 'de')).toBe('de_DE-thorsten-medium');
        expect(pickTtsVoice(voices, 'en')).toBe('en_US-lessac-medium');
    });
    it('fällt auf die erste Stimme bzw. leer zurück', () => {
        expect(pickTtsVoice(voices, 'ja')).toBe('en_US-lessac-medium');
        expect(pickTtsVoice([], 'de')).toBe('');
        expect(pickTtsVoice(null, 'de')).toBe('');
    });
});
