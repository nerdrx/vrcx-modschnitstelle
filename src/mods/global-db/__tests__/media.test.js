import { describe, expect, it } from 'vitest';
import {
    classifyUrl,
    clearEmbedCache,
    isMediaOnly,
    isSafeUrl,
    mediaSummary,
    parseMessage,
    resolveEmbed,
    tenorAnimatedFrom,
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

describe('Tenor: animierte Variante ableiten', () => {
    // Tenors oEmbed liefert nur ein statisches PNG. Die animierte Datei liegt
    // unter derselben Id mit anderem Suffix-Zeichen und Endung .gif.
    it('macht aus dem Standbild-PNG die GIF-URL', () => {
        expect(
            tenorAnimatedFrom('https://media.tenor.com/sz6RV3BjrDcAAAAN/katze.png')
        ).toBe('https://media.tenor.com/sz6RV3BjrDcAAAAC/katze.gif');
    });

    it('lässt eine bereits animierte URL unverändert', () => {
        const gif = 'https://media.tenor.com/xAAAAC/a.gif';
        expect(tenorAnimatedFrom(gif)).toBe(gif);
    });

    it('fasst fremde Hosts nicht an', () => {
        expect(tenorAnimatedFrom('https://example.com/a.png')).toBeNull();
    });

    it('gibt null zurück, wenn nichts zu ersetzen ist', () => {
        expect(tenorAnimatedFrom('')).toBeNull();
        expect(tenorAnimatedFrom(null)).toBeNull();
    });
});

describe('oEmbed-Aufloesung', () => {
    it('nimmt bei Giphy die direkte url — dort ist sie schon animiert', async () => {
        clearEmbedCache();
        const fake = async () => ({
            ok: true,
            json: async () => ({ url: 'https://media0.giphy.com/media/abc/giphy.gif' })
        });
        const out = await resolveEmbed('https://giphy.com/gifs/abc', fake);
        expect(out.url).toBe('https://media0.giphy.com/media/abc/giphy.gif');
    });

    it('leitet bei Tenor die Animation ab und merkt sich das Standbild', async () => {
        clearEmbedCache();
        // Genau die Form, die Tenor laut Live-Abruf zurückgibt: kein url-Feld.
        const fake = async () => ({
            ok: true,
            json: async () => ({
                type: 'video',
                html: '<iframe src="https://tenor.com/embed/123"></iframe>',
                thumbnail_url: 'https://media.tenor.com/sz6RV3BjrDcAAAAN/katze.png'
            })
        });
        const out = await resolveEmbed('https://tenor.com/view/katze-gif-123', fake);
        expect(out.url).toBe('https://media.tenor.com/sz6RV3BjrDcAAAAC/katze.gif');
        expect(out.still).toBe('https://media.tenor.com/sz6RV3BjrDcAAAAN/katze.png');
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

    it('nutzt das Standbild, wenn sich nichts ableiten lässt', async () => {
        clearEmbedCache();
        const fake = async () => ({
            ok: true,
            json: async () => ({ thumbnail_url: 'https://example.com/still.png' })
        });
        const out = await resolveEmbed('https://tenor.com/view/x-5', fake);
        expect(out.url).toBe('https://example.com/still.png');
        expect(out.still).toBe('https://example.com/still.png');
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
