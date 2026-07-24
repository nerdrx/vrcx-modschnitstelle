import { describe, expect, it } from 'vitest';
import {
    ampel,
    canonDm,
    dmPeer,
    emptyChannel,
    isDnd,
    wsUrl
} from '../chat';

describe('wsUrl', () => {
    it('converts https base to wss and appends token', () => {
        expect(wsUrl('https://example.org/vrcx-pool', 'abc')).toBe(
            'wss://example.org/vrcx-pool/ws?token=abc'
        );
    });
    it('strips trailing slash and encodes token', () => {
        expect(wsUrl('http://x.y/', 'a b')).toBe('ws://x.y/ws?token=a%20b');
    });
});

describe('canonDm / dmPeer', () => {
    it('sorts pair deterministically', () => {
        expect(canonDm('usr_b', 'usr_a')).toBe('dm:usr_a:usr_b');
        expect(canonDm('usr_a', 'usr_b')).toBe('dm:usr_a:usr_b');
    });
    it('dmPeer returns the other side', () => {
        expect(dmPeer('dm:usr_a:usr_b', 'usr_a')).toBe('usr_b');
        expect(dmPeer('dm:usr_a:usr_b', 'usr_b')).toBe('usr_a');
        expect(dmPeer('global', 'usr_a')).toBeNull();
    });
});

describe('isDnd / ampel (DND-Ampel)', () => {
    it('manual DND always wins', () => {
        expect(isDnd({ dndManual: true, dndAuto: false }, 'active')).toBe(true);
        expect(ampel({ dndManual: true }, 'active')).toBe('red');
    });
    it('auto DND couples to VRC status busy', () => {
        expect(isDnd({ dndAuto: true }, 'busy')).toBe(true);
        expect(isDnd({ dndAuto: true }, 'active')).toBe(false);
        expect(isDnd({ dndAuto: false }, 'busy')).toBe(false);
    });
    it('auto defaults to on when unset', () => {
        expect(isDnd({}, 'busy')).toBe(true);
    });
    it('ampel yellow on ask me, green otherwise', () => {
        expect(ampel({ dndAuto: false }, 'ask me')).toBe('yellow');
        expect(ampel({ dndAuto: false }, 'join me')).toBe('green');
        expect(ampel({ dndAuto: true }, 'busy')).toBe('red');
    });
});

describe('emptyChannel', () => {
    it('starts clean', () => {
        const ch = emptyChannel('global');
        expect(ch.messages).toEqual([]);
        expect(ch.unread).toBe(0);
        expect(ch.historyLoaded).toBe(false);
    });
});
