import { describe, expect, it } from 'vitest';
import {
    BUILTIN_SOUNDS,
    DEFAULT_SOUNDS,
    MAX_SOUND_BYTES,
    isValidSoundDataUrl,
    playDataUrl,
    playSpec,
    readSoundFile,
    resolveSound,
    soundById
} from '../sounds';

const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZF';

/** Minimaler AudioContext-Ersatz, der nur protokolliert statt zu klingen. */
function fakeAudioCtx() {
    const log = { oscillators: [], gains: [], started: [], stopped: [] };
    return {
        log,
        currentTime: 5,
        destination: { id: 'dest' },
        createOscillator() {
            const osc = {
                type: 'sine',
                frequency: { value: 0 },
                connect: (node) => node,
                start: (t) => log.started.push(t),
                stop: (t) => log.stopped.push(t)
            };
            log.oscillators.push(osc);
            return osc;
        },
        createGain() {
            const gain = {
                gain: {
                    setValueAtTime: () => {},
                    exponentialRampToValueAtTime: () => {}
                },
                connect: (node) => node
            };
            log.gains.push(gain);
            return gain;
        }
    };
}

/** FileReader-Ersatz: liefert synchron, was die Datei vorgibt. */
function fakeReaderClass(result, fail) {
    return class {
        readAsDataURL() {
            if (fail) {
                this.onerror(new Error('boom'));
                return;
            }
            this.result = result;
            this.onload();
        }
    };
}

function soundFile(extra = {}) {
    return { name: 'ton.wav', type: 'audio/wav', size: 1024, ...extra };
}

describe('Eingebaute Töne', () => {
    it('bietet genug unterscheidbare Töne zur Auswahl an', () => {
        expect(BUILTIN_SOUNDS.length).toBeGreaterThanOrEqual(6);
    });

    it('vergibt eindeutige ids, damit Einstellungen nicht kollidieren', () => {
        const ids = BUILTIN_SOUNDS.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('beschreibt jeden Ton vollständig und abspielbar', () => {
        for (const snd of BUILTIN_SOUNDS) {
            expect(typeof snd.id).toBe('string');
            expect(snd.label.length).toBeGreaterThan(0);
            expect(snd.spec.steps.length).toBeGreaterThan(0);
            for (const step of snd.spec.steps) {
                expect(step.freq).toBeGreaterThan(0);
                expect(step.dur).toBeGreaterThan(0);
            }
        }
    });

    it('reserviert keine id, die als Sonderwert dient', () => {
        const ids = BUILTIN_SOUNDS.map((s) => s.id);
        expect(ids).not.toContain('custom');
        expect(ids).not.toContain('none');
    });

    it('findet Töne über ihre id und meldet unbekannte sauber', () => {
        expect(soundById('ping').label).toBeTruthy();
        expect(soundById('gibtsnicht')).toBeNull();
    });

    it('verweist mit allen Standardwerten auf existierende Töne', () => {
        expect(soundById(DEFAULT_SOUNDS.soundGlobal)).not.toBeNull();
        expect(soundById(DEFAULT_SOUNDS.soundDm)).not.toBeNull();
        expect(soundById(DEFAULT_SOUNDS.soundInvite)).not.toBeNull();
    });
});

describe('Auswahl des Tons', () => {
    it('nutzt ohne Einstellungen je Ereignis den passenden Standardton', () => {
        expect(resolveSound({}, 'global').id).toBe(DEFAULT_SOUNDS.soundGlobal);
        expect(resolveSound({}, 'dm').id).toBe(DEFAULT_SOUNDS.soundDm);
        expect(resolveSound({}, 'invite').id).toBe(DEFAULT_SOUNDS.soundInvite);
        expect(resolveSound(undefined, 'global').kind).toBe('builtin');
    });

    it('spielt je Ereignis den gewählten Ton', () => {
        const settings = { soundGlobal: 'klick', soundDm: 'alarm', soundInvite: 'blubb' };
        expect(resolveSound(settings, 'global').id).toBe('klick');
        expect(resolveSound(settings, 'dm').id).toBe('alarm');
        expect(resolveSound(settings, 'invite').id).toBe('blubb');
        expect(resolveSound(settings, 'global').spec).toBe(soundById('klick').spec);
    });

    it('schweigt komplett, wenn Töne abgeschaltet sind', () => {
        expect(resolveSound({ soundEnabled: false }, 'global')).toBeNull();
        expect(resolveSound({ soundEnabled: false }, 'dm')).toBeNull();
        expect(resolveSound({ soundEnabled: false }, 'invite')).toBeNull();
    });

    it('schaltet einzelne Ereignisse per none stumm', () => {
        const settings = { soundDm: 'none' };
        expect(resolveSound(settings, 'dm')).toBeNull();
        expect(resolveSound(settings, 'global')).not.toBeNull();
    });

    it('fällt bei veralteter id auf den Standardton zurück statt zu verstummen', () => {
        const res = resolveSound({ soundDm: 'entfernter-ton' }, 'dm');
        expect(res.kind).toBe('builtin');
        expect(res.id).toBe(DEFAULT_SOUNDS.soundDm);
    });

    it('behandelt ein unbekanntes Ereignis wie den Global-Chat', () => {
        expect(resolveSound({ soundGlobal: 'alarm' }, 'irgendwas').id).toBe('alarm');
    });
});

describe('Eigener Ton in der Auswahl', () => {
    it('liefert die eigene Datei, wenn custom gewählt und hinterlegt ist', () => {
        const res = resolveSound(
            { soundDm: 'custom', soundCustomData: WAV, soundCustomName: 'ton.wav' },
            'dm'
        );
        expect(res.kind).toBe('custom');
        expect(res.dataUrl).toBe(WAV);
        expect(res.name).toBe('ton.wav');
    });

    it('fällt auf den Standardton zurück, wenn die eigene Datei fehlt', () => {
        const res = resolveSound({ soundGlobal: 'custom' }, 'global');
        expect(res.kind).toBe('builtin');
        expect(res.id).toBe(DEFAULT_SOUNDS.soundGlobal);
    });

    it('ignoriert eine untergeschobene fremde URL als eigenen Ton', () => {
        const res = resolveSound(
            { soundGlobal: 'custom', soundCustomData: 'https://boese.tld/x.mp3' },
            'global'
        );
        expect(res.kind).toBe('builtin');
    });
});

describe('Lautstärke', () => {
    it('reicht die eingestellte Lautstärke mit durch', () => {
        expect(resolveSound({ soundVolume: 0.25 }, 'global').volume).toBe(0.25);
    });

    it('begrenzt unsinnige Werte auf 0..1', () => {
        expect(resolveSound({ soundVolume: 5 }, 'global').volume).toBe(1);
        expect(resolveSound({ soundVolume: -3 }, 'global').volume).toBe(0);
        expect(resolveSound({ soundVolume: 'laut' }, 'global').volume).toBe(1);
    });

    it('nutzt ohne Angabe die Standardlautstärke', () => {
        expect(resolveSound({}, 'global').volume).toBe(DEFAULT_SOUNDS.soundVolume);
    });
});

describe('Datei-URL als Sicherheitsgrenze', () => {
    it('akzeptiert base64-kodierte Audio-Daten', () => {
        expect(isValidSoundDataUrl(WAV)).toBe(true);
        expect(isValidSoundDataUrl('data:audio/mpeg;base64,SUQzAwA=')).toBe(true);
    });

    it('lässt keine nachladbaren Fremd-URLs durch', () => {
        expect(isValidSoundDataUrl('https://boese.tld/ton.mp3')).toBe(false);
        expect(isValidSoundDataUrl('http://boese.tld/ton.mp3')).toBe(false);
        expect(isValidSoundDataUrl('//boese.tld/ton.mp3')).toBe(false);
    });

    it('lässt kein ausführbares Schema durch', () => {
        expect(isValidSoundDataUrl('javascript:alert(1)')).toBe(false);
        expect(isValidSoundDataUrl(' javascript:alert(1)')).toBe(false);
    });

    it('lässt keine anderen data-Typen durch', () => {
        expect(isValidSoundDataUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
        expect(isValidSoundDataUrl('data:image/png;base64,AAAA')).toBe(false);
        expect(isValidSoundDataUrl('data:audio/wav,rohtext')).toBe(false);
    });

    it('weist Nicht-Zeichenketten und Leeres ab', () => {
        expect(isValidSoundDataUrl('')).toBe(false);
        expect(isValidSoundDataUrl(undefined)).toBe(false);
        expect(isValidSoundDataUrl(null)).toBe(false);
        expect(isValidSoundDataUrl({ toString: () => WAV })).toBe(false);
    });
});

describe('Eigene Datei einlesen', () => {
    it('liefert Name, Datenblock und Größe zurück', async () => {
        const res = await readSoundFile(soundFile(), {
            FileReader: fakeReaderClass(WAV)
        });
        expect(res).toEqual({ name: 'ton.wav', dataUrl: WAV, bytes: 1024 });
    });

    it('lehnt Dateien ab, die kein Audio sind', async () => {
        await expect(
            readSoundFile(soundFile({ type: 'image/png' }), {
                FileReader: fakeReaderClass(WAV)
            })
        ).rejects.toThrow(/Nur Audiodateien/);
    });

    it('lehnt Dateien ohne erkannten Typ ab', async () => {
        await expect(
            readSoundFile(soundFile({ type: '' }), { FileReader: fakeReaderClass(WAV) })
        ).rejects.toThrow(/unbekannter Typ/);
    });

    it('lehnt zu große Dateien ab, bevor sie gelesen werden', async () => {
        await expect(
            readSoundFile(soundFile({ size: MAX_SOUND_BYTES + 1 }), {
                FileReader: fakeReaderClass(WAV)
            })
        ).rejects.toThrow(/zu groß/);
    });

    it('erlaubt ein eigenes Größenlimit', async () => {
        await expect(
            readSoundFile(soundFile({ size: 2048 }), {
                maxBytes: 1024,
                FileReader: fakeReaderClass(WAV)
            })
        ).rejects.toThrow(/1 KB/);
        const ok = await readSoundFile(soundFile({ size: 900 }), {
            maxBytes: 1024,
            FileReader: fakeReaderClass(WAV)
        });
        expect(ok.bytes).toBe(900);
    });

    it('meldet einen Lesefehler statt still zu scheitern', async () => {
        await expect(
            readSoundFile(soundFile(), { FileReader: fakeReaderClass(null, true) })
        ).rejects.toThrow(/nicht gelesen/);
    });

    it('verwirft ein Ergebnis, das keine Audio-data-URL ist', async () => {
        await expect(
            readSoundFile(soundFile(), {
                FileReader: fakeReaderClass('data:text/html;base64,PHA+')
            })
        ).rejects.toThrow(/Audio-Datenblock/);
    });

    it('verlangt überhaupt eine Datei', async () => {
        await expect(readSoundFile(null, {})).rejects.toThrow(/Keine Datei/);
    });
});

describe('Synthese der eingebauten Töne', () => {
    it('erzeugt und startet je Schritt genau einen Oszillator', () => {
        const ctx = fakeAudioCtx();
        const spec = soundById('rise').spec;
        expect(playSpec(spec, { volume: 0.5, audioCtx: ctx })).toBe(true);
        expect(ctx.log.oscillators.length).toBe(spec.steps.length);
        expect(ctx.log.gains.length).toBe(spec.steps.length);
        expect(ctx.log.started.length).toBe(spec.steps.length);
        expect(ctx.log.stopped.length).toBe(spec.steps.length);
    });

    it('übernimmt Frequenz und Wellenform aus der spec', () => {
        const ctx = fakeAudioCtx();
        playSpec(soundById('klick').spec, { volume: 1, audioCtx: ctx });
        expect(ctx.log.oscillators[0].frequency.value).toBe(1600);
        expect(ctx.log.oscillators[0].type).toBe('square');
    });

    it('reiht Schritte ohne at nacheinander, rechnet ab der Context-Zeit', () => {
        const ctx = fakeAudioCtx();
        playSpec(
            { steps: [{ freq: 400, dur: 0.1 }, { freq: 500, dur: 0.1 }] },
            { volume: 1, audioCtx: ctx }
        );
        expect(ctx.log.started[0]).toBeCloseTo(5);
        expect(ctx.log.started[1]).toBeCloseTo(5.1);
    });

    it('lässt Schritte mit gleichem at zusammen erklingen', () => {
        const ctx = fakeAudioCtx();
        playSpec(
            {
                steps: [
                    { freq: 400, dur: 0.2, at: 0 },
                    { freq: 600, dur: 0.2, at: 0 }
                ]
            },
            { volume: 1, audioCtx: ctx }
        );
        expect(ctx.log.started[0]).toBe(ctx.log.started[1]);
    });

    it('spielt nichts bei leerer oder fehlender spec', () => {
        const ctx = fakeAudioCtx();
        expect(playSpec(null, { audioCtx: ctx })).toBe(false);
        expect(playSpec({}, { audioCtx: ctx })).toBe(false);
        expect(playSpec({ steps: [] }, { audioCtx: ctx })).toBe(false);
        expect(ctx.log.oscillators.length).toBe(0);
    });

    it('spielt nichts bei Lautstärke 0', () => {
        const ctx = fakeAudioCtx();
        expect(playSpec(soundById('ping').spec, { volume: 0, audioCtx: ctx })).toBe(false);
        expect(ctx.log.oscillators.length).toBe(0);
    });

    it('wirft nie — eine Benachrichtigung darf am Ton nicht scheitern', () => {
        const kaputt = {
            currentTime: 0,
            destination: null,
            createOscillator() {
                throw new Error('AudioContext gesperrt');
            },
            createGain() {
                throw new Error('AudioContext gesperrt');
            }
        };
        expect(() => playSpec(soundById('ping').spec, { audioCtx: kaputt })).not.toThrow();
        expect(playSpec(soundById('ping').spec, { audioCtx: kaputt })).toBe(false);
    });
});

describe('Abspielen eigener Töne', () => {
    function fakeAudio(playImpl) {
        return {
            src: '',
            volume: 1,
            play: playImpl || (() => Promise.resolve())
        };
    }

    it('setzt Quelle und Lautstärke und startet die Wiedergabe', () => {
        const el = fakeAudio();
        expect(playDataUrl(WAV, { volume: 0.3, audio: el })).toBe(true);
        expect(el.src).toBe(WAV);
        expect(el.volume).toBe(0.3);
    });

    it('setzt eine unerlaubte URL gar nicht erst als Quelle', () => {
        const el = fakeAudio();
        expect(playDataUrl('https://boese.tld/x.mp3', { audio: el })).toBe(false);
        expect(playDataUrl('javascript:alert(1)', { audio: el })).toBe(false);
        expect(el.src).toBe('');
    });

    it('bleibt ruhig, wenn der Browser das Abspielen verweigert', () => {
        const el = fakeAudio(() => Promise.reject(new Error('autoplay blocked')));
        expect(() => playDataUrl(WAV, { audio: el })).not.toThrow();
        const werfend = fakeAudio(() => {
            throw new Error('kein Codec');
        });
        expect(playDataUrl(WAV, { audio: werfend })).toBe(false);
    });
});
