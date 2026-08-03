// ============================================================================
// Global DB mod — P3: Medien im Chat.
// Bewusst OHNE Fremd-API und OHNE Rehosting: eine Nachricht bleibt normaler
// Text, der eine URL enthält. Der Server speichert nur diesen Text (er
// normalisiert ohnehin jedes kind außer 'invite' zu 'text'), jeder Client
// erkennt die URL selbst und zeigt das Medium an. Damit kostet ein GIF auf
// dem Pool-Server exakt so viel Platz wie seine URL, und der Bild-Cache ist
// der ohnehin vorhandene Browser-Cache.
// ============================================================================

// Nur diese Endungen werden inline gerendert. SVG fehlt absichtlich: es darf
// Skripte enthalten und liefe im selben Renderer wie VRCX.
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'apng', 'bmp', 'avif'];
const VIDEO_EXT = ['mp4', 'webm'];

// Seiten, die statt einer Datei eine Betrachter-Seite verlinken. Sie lassen
// sich über oEmbed ohne API-Key auflösen (siehe resolveEmbed).
const EMBED_HOSTS = [
    { host: /(^|\.)tenor\.com$/i, endpoint: 'https://tenor.com/oembed?url=' },
    { host: /(^|\.)giphy\.com$/i, endpoint: 'https://giphy.com/services/oembed?url=' }
];

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

export const DEFAULT_MEDIA = {
    mediaShow: true, // Bilder/GIFs inline anzeigen
    mediaVideo: true, // mp4/webm ebenfalls einbetten
    mediaEmbeds: true, // Tenor-/Giphy-Seiten per oEmbed auflösen (ohne API-Key)
    mediaMaxPx: 320, // Anzeigehöhe im Desktop-Chat
    mediaInVr: true // Medien auch im VR-Panel zeigen
};

/** Endung ohne Query/Fragment. */
export function urlExtension(url) {
    try {
        const u = new URL(url);
        const last = u.pathname.split('/').pop() || '';
        const dot = last.lastIndexOf('.');
        return dot > 0 ? last.slice(dot + 1).toLowerCase() : '';
    } catch {
        return '';
    }
}

/** Nur http/https — data:, file: und javascript: bleiben draußen. */
export function isSafeUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

export function embedHostFor(url) {
    try {
        const host = new URL(url).hostname;
        return EMBED_HOSTS.find((e) => e.host.test(host)) || null;
    } catch {
        return null;
    }
}

/**
 * Klassifiziert eine einzelne URL.
 *  image | video  — direkt einbettbar
 *  embed          — Betrachter-Seite, muss erst aufgelöst werden
 *  link           — alles andere
 */
export function classifyUrl(url) {
    if (!isSafeUrl(url)) return 'link';
    const ext = urlExtension(url);
    if (IMAGE_EXT.includes(ext)) return 'image';
    if (VIDEO_EXT.includes(ext)) return 'video';
    if (embedHostFor(url)) return 'embed';
    return 'link';
}

/**
 * Zerlegt einen Nachrichtentext in Teile: {type:'text'|'image'|'video'|'embed'|'link'}.
 * Reine Funktion — die Anzeige (Desktop wie VR-Panel) baut daraus ihr Markup.
 */
export function parseMessage(text) {
    const parts = [];
    const src = text || '';
    let last = 0;
    for (const m of src.matchAll(URL_RE)) {
        // Satzzeichen am Ende gehören nicht zur URL
        let url = m[0].replace(/[),.;:!?]+$/, '');
        const start = m.index;
        const end = start + url.length;
        if (start > last) {
            parts.push({ type: 'text', value: src.slice(last, start) });
        }
        parts.push({ type: classifyUrl(url), value: url });
        last = end;
    }
    if (last < src.length) {
        parts.push({ type: 'text', value: src.slice(last) });
    }
    if (parts.length === 0) parts.push({ type: 'text', value: src });
    return parts;
}

/** true, wenn die Nachricht ausschließlich aus Medien besteht (kein Fließtext). */
export function isMediaOnly(text) {
    return parseMessage(text).every(
        (p) =>
            (p.type !== 'text' && p.type !== 'link') ||
            (p.type === 'text' && !p.value.trim())
    );
}

/** Kurzform für Vorschauen (Mini-Panel, Benachrichtigungen). */
export function mediaSummary(text) {
    const parts = parseMessage(text);
    const media = parts.filter((p) => p.type === 'image' || p.type === 'embed');
    const video = parts.filter((p) => p.type === 'video');
    const rest = parts
        .filter((p) => p.type === 'text')
        .map((p) => p.value)
        .join('')
        .trim();
    if (rest) return rest;
    if (media.length) return media.length > 1 ? `🖼️ ${media.length} Bilder` : '🖼️ Bild';
    if (video.length) return '🎬 Video';
    return text || '';
}

/**
 * Tenors oEmbed liefert KEIN url-Feld, sondern nur ein iframe-html und ein
 * statisches PNG als thumbnail_url — deshalb wurde bisher ein Standbild
 * statt des animierten GIFs angezeigt.
 *
 * Die Medien-URLs folgen dem Muster
 *   https://media.tenor.com/<id>AAAA<X>/<name>.<ext>
 * wobei <X> das Format codiert: N = statisches PNG, C = volles GIF.
 * Das Schema ist reverse-engineered und nicht dokumentiert, kann sich also
 * ändern — deshalb wird die abgeleitete URL nur als Kandidat behandelt und
 * das Standbild als Rückfallebene mitgeführt.
 */
export function tenorAnimatedFrom(thumbUrl) {
    if (!thumbUrl || !/(^|\.)tenor\.com/i.test(thumbUrl)) return null;
    if (/\.gif($|\?)/i.test(thumbUrl)) return thumbUrl;
    const swapped = thumbUrl
        .replace(/(AAAA)[A-Za-z0-9](\/)/, '$1C$2')
        .replace(/\.(png|jpe?g|webp)($|\?)/i, '.gif$2');
    return swapped !== thumbUrl && isSafeUrl(swapped) ? swapped : null;
}

/**
 * Betrachter-Seite (Tenor/Giphy) in eine direkte Medien-URL auflösen — über
 * oEmbed, das keinen API-Key braucht. Schlägt der Abruf fehl, bleibt es bei
 * einem normalen Link; das ist kein Fehlerfall, sondern der Normalzustand
 * ohne Netz.
 *
 * Rückgabe: { url, still } — url ist die beste Vermutung (bei Tenor die
 * abgeleitete Animation), still das gesicherte Standbild für den
 * onerror-Fallback der Anzeige. null, wenn nichts Brauchbares kam.
 */
const embedCache = new Map();

export async function resolveEmbed(url, fetchImpl) {
    if (embedCache.has(url)) return embedCache.get(url);
    const spec = embedHostFor(url);
    if (!spec) return null;
    const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return null;
    try {
        const res = await doFetch(spec.endpoint + encodeURIComponent(url));
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        // Giphy liefert in url bereits das animierte GIF, Tenor gar kein url.
        const direct = isSafeUrl(data.url || '') ? data.url : null;
        const still = isSafeUrl(data.thumbnail_url || '') ? data.thumbnail_url : null;
        const animated = direct || tenorAnimatedFrom(still);
        const best = animated || still;
        const out = best ? { url: best, still: still || best } : null;
        embedCache.set(url, out);
        return out;
    } catch {
        embedCache.set(url, null);
        return null;
    }
}

export function clearEmbedCache() {
    embedCache.clear();
}
