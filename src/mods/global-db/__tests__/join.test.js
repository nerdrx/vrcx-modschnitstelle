import { describe, expect, it } from 'vitest';

import { collectFriendIds, sha256Hex } from '../join';

// Reference hashes precomputed with Python hashlib (server-compatible).
const REF = {
    'usr_d5e878ff-971a-499b-96ef-8d33c3896f15':
        '2a7f10c13f16bc23f6eb345a7d7e947e020bfd16b2dc013796048229c0db35e8',
    'usr_00000000-0000-4000-8000-00000000bbbb':
        '562d0617b33ac40734e3e658a1c334062ed16d89a4cd4dad726db630164b793b',
    ['x'.repeat(200)]:
        'aa20c23e3201834050679e1d88941b9a6fed0557c9a705cb2c315e2e63fd486d'
};

describe('sha256Hex', () => {
    it('matches known vectors', () => {
        expect(sha256Hex('')).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        );
        expect(sha256Hex('abc')).toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        );
    });
    it('matches server-side hashes for VRChat user ids', () => {
        for (const [input, expected] of Object.entries(REF)) {
            expect(sha256Hex(input)).toBe(expected);
        }
    });
});

describe('collectFriendIds', () => {
    it('merges friend store map keys and currentUser.friends, usr_ only', () => {
        const ctx = {
            stores: {
                friends: { friends: new Map([['usr_a', {}], ['usr_b', {}]]) },
                user: { currentUser: { friends: ['usr_b', 'usr_c', 'grp_nope'] } }
            }
        };
        expect(collectFriendIds(ctx).sort()).toEqual(['usr_a', 'usr_b', 'usr_c']);
    });
    it('survives missing stores', () => {
        expect(collectFriendIds({ stores: {} })).toEqual([]);
    });
});
