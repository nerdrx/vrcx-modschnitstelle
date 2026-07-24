// ============================================================================
// Global DB mod — P1.5 onboarding: eligibility check, one-click join and
// friend-hash upload. Friend lists NEVER leave the PC in plaintext — only
// SHA-256 hashes of the VRChat user ids are uploaded (replace-set).
// ============================================================================

import { DEFAULT_SERVER, apiFetch } from './sync';

// ------------------------------------------------------------ sha256 (JS) ---
// Pure-JS SHA-256 (hex). Deliberately not crypto.subtle: the CEF app://
// scheme is not guaranteed to be a secure context.
/* eslint-disable no-bitwise */
const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256Hex(input) {
    const bytes = new TextEncoder().encode(String(input));
    const bitLen = bytes.length * 8;
    const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 4, bitLen >>> 0);
    dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));

    const h = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f,
        0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    const w = new Int32Array(64);
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            hh = g; g = f; f = e; e = (d + t1) | 0;
            d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0;
        h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0;
        h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
/* eslint-enable no-bitwise */

// ----------------------------------------------------------------- public ---
const base = (settings) => (settings?.serverUrl || DEFAULT_SERVER).replace(/\/$/, '');

/**
 * Public endpoint — no token required.
 * Returns { eligible, member } (member:true = already in the pool, e.g.
 * second PC without local token).
 */
export async function checkEligible(settings, userId) {
    if (!userId) return { eligible: false, member: false };
    const res = await fetch(
        `${base(settings)}/v1/eligible?user=${encodeURIComponent(userId)}`
    );
    if (!res.ok) return { eligible: false, member: false };
    const data = await res.json().catch(() => null);
    return {
        eligible: data?.eligible === true,
        member: data?.member === true
    };
}

/**
 * Public endpoint — one-click join. Returns the pool token (shown exactly
 * once by the server; the server only stores its hash).
 * Throws with a German message on failure.
 */
export async function joinPool(settings, userId, displayName) {
    const res = await fetch(`${base(settings)}/v1/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: userId, display_name: displayName })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
        throw new Error(
            'Du bist bereits Mitglied. Token vom anderen PC übernehmen (Dashboard → „Token anzeigen") oder Pool-Admin fragen.'
        );
    }
    if (res.status === 403) {
        throw new Error(
            data.error === 'banned'
                ? 'Beitritt nicht möglich (gesperrt).'
                : 'Nicht berechtigt — kein Pool-Mitglied hat dich als Freund.'
        );
    }
    if (!res.ok || !data.token) {
        throw new Error('Beitritt fehlgeschlagen: ' + (data.error || res.status));
    }
    return data.token;
}

/** Collect the local VRChat friend ids from the friend store. */
export function collectFriendIds(ctx) {
    const ids = new Set();
    try {
        const map = ctx.stores.friends?.friends;
        if (map?.keys) for (const id of map.keys()) ids.add(id);
    } catch {}
    try {
        for (const id of ctx.stores.user?.currentUser?.friends || []) ids.add(id);
    } catch {}
    return [...ids].filter((id) => typeof id === 'string' && id.startsWith('usr_'));
}

/** Upload the SHA-256 hashes of all friend ids (replace-set). */
export async function uploadFriendHashes(ctx, settings) {
    const ids = collectFriendIds(ctx);
    const hashes = ids.map((id) => sha256Hex(id));
    const resp = await apiFetch(settings, 'v1/friends', {
        method: 'POST',
        body: JSON.stringify({ hashes })
    });
    return resp.count || 0;
}
