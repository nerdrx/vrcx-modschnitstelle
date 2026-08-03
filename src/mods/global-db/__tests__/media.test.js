import { describe, expect, it } from 'vitest';
import {
    classifyUrl,
    clearEmbedCache,
    isMediaOnly,
    isSafeUrl,
    mediaSummary,
    parseMessage,
    resolveEmbed,
    urlExtension
} from '../media';

describe('URL-Klassifizierung', () => {
    it('erkennt Bild-Endungen, auch mit Query', () => {
        expect(classifyUrl('https://x.tld/a.gif')).toBe('image');
        expect(classifyUrl('https://x.tld/pfad/b.PNG?w=100&h=2')).toBe('image');
        expect(classifyUrl('https://x.tld/c.webp#frag')).toBe('image');
    });

    it('erkennt Videos', () => {
        expect(classifyUrl('https://x.tld/clip.mp4')).toBe('video');
        expect(classifyUrl('https://x.tld/clip.webm')).toBe('video');
    });

    it('behandelt SVG als reinen Link — es darf Skripte enthalten', () => {
        expect(classifyUrl('https://x.tld/böse.svg')).toBe('link');
    });

    it('erkennt Tenor- und Giphy-Seiten als aufloesbares Embed', () => {
        expect(classifyUrl('https://tenor.com/view/katze-12345')).toBe('embed');
        expect(classifyUrl('https://media.giphy.com/gifs/abc')).toBe('embed');
    });

    it('lässt gefährliche Schemata nicht durch', () => {
        expect(isSafeUrl('javascript:alert(1)')).toBe(false);
        expect(isSafeUrl('data:image/png;base64,AAA')).toBe(false);
        expect(isSafeUrl('file:///C:/x.png')).toBe(false);
        expect(isSafeUrl('https://x.tld/a.png')).toBe(true);
        expect(classifyUrl('data:image/gif;base64,AAAA')).toBe('link');
    });

    it('liefert Endungen robust', () => {
        expect(urlExtension('https://x.tld/a.b.c.jpeg')).toBe('jpeg');
        expect(urlExtension('https://x.tld/ohne')).toBe('');
        expect(urlExtension('kaputt')).toBe('');
    });
});

describe('Nachricht zerlegen', () => {
    it('trennt Text und Medien', () => {
        const parts = parseMessage('schau mal https://x.tld/a.gif nice');
        expect(parts.map((p) => p.type)).toEqual(['text', 'image', 'text']);
        expect(parts[1].value).toBe('https://x.tld/a.gif');
    });

    it('nimmt Satzzeichen nicht in die URL', () => {
        const parts = parseMessage('hier: https://x.tld/a.png.');
        expect(parts.find((p) => p.type === 'image').value).toBe('https://x.tld/a.png');
    });

    it('kommt mit mehreren URLs klar', () => {
        const parts = parseMessage('https://x.tld/a.png https://x.tld/b.gif');
        expect(parts.filter((p) => p.type === 'image')).toHaveLength(2);
    });

    it('gibt reinen Text unverändert zurück', () => {
        const parts = parseMessage('nur text');
        expect(parts).toEqual([{ type: 'text', value: 'nur text' }]);
    });

    it('verträgt leere Eingaben', () => {
        expect(parseMessage('')).toEqual([{ type: 'text', value: '' }]);
        expect(parseMessage(null)).toEqual([{ type: 'text', value: '' }]);
    });

    it('erkennt reine Medien-Nachrichten', () => {
        expect(isMediaOnly('https://x.tld/a.gif')).toBe(true);
        expect(isMediaOnly('  https://x.tld/a.gif  ')).toBe(true);
        expect(isMediaOnly('guck mal https://x.tld/a.gif')).toBe(false);
        expect(isMediaOnly('https://x.tld/seite')).toBe(false); // reiner Link
    });
});

describe('Vorschau-Text', () => {
    it('bevorzugt vorhandenen Fließtext', () => {
        expect(mediaSummary('guck mal https://x.tld/a.gif')).toBe('guck mal');
    });

    it('fasst reine Medien zusammen', () => {
        expect(mediaSummary('https://x.tld/a.gif')).toContain('Bild');
        expect(mediaSummary('https://x.tld/a.gif https://x.tld/b.png')).toContain('2 Bilder');
        expect(mediaSummary('https://x.tld/c.mp4')).toContain('Video');
    });
});

describe('oEmbed-Aufloesung', () => {
    it('loest eine Tenor-Seite in eine direkte URL auf', async () => {
        clearEmbedCache();
        const fake = async () => ({
            ok: true,
            json: async () => ({ url: 'https://media.tenor.com/abc.gif' })
        });
        const out = await resolveEmbed('https://tenor.com/view/x-1', fake);
        expect(out).toBe('https://media.tenor.com/abc.gif');
    });

    it('gibt null zurück statt zu werfen, wenn der Abruf scheitert', async () => {
        clearEmbedCache();
        const fake = async () => {
            throw new Error('offline');
        };
        await expect(resolveEmbed('https://tenor.com/view/x-2', fake)).resolves.toBeNull();
    });

    it('fragt dieselbe URL nur einmal ab', async () => {
        clearEmbedCache();
        let calls = 0;
        const fake = async () => {
            calls++;
            return { ok: true, json: async () => ({ url: 'https://media.tenor.com/z.gif' }) };
        };
        await resolveEmbed('https://tenor.com/view/x-3', fake);
        await resolveEmbed('https://tenor.com/view/x-3', fake);
        expect(calls).toBe(1);
    });

    it('ignoriert unsichere Zieladressen aus der Antwort', async () => {
        clearEmbedCache();
        const fake = async () => ({
            ok: true,
            json: async () => ({ url: 'javascript:alert(1)' })
        });
        await expect(resolveEmbed('https://tenor.com/view/x-4', fake)).resolves.toBeNull();
    });

    it('fasst Nicht-Embed-Hosts nicht an', async () => {
        clearEmbedCache();
        await expect(resolveEmbed('https://x.tld/a.gif', async () => {
            throw new Error('darf nicht aufgerufen werden');
        })).resolves.toBeNull();
    });
});
