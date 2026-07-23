import { describe, expect, it } from 'vitest';

import { rowAllowed, toObjects } from '../sync';

const ids = new Set(['usr_a', 'usr_b']);
const names = new Set(['Alice']);

describe('rowAllowed', () => {
    it('accepts rows about members', () => {
        expect(rowAllowed('status', { user_id: 'usr_a' }, ids, names)).toBe(true);
    });
    it('rejects rows about non-members (privacy filter)', () => {
        expect(rowAllowed('status', { user_id: 'usr_fremd' }, ids, names)).toBe(false);
        expect(rowAllowed('gps', { user_id: '' }, ids, names)).toBe(false);
    });
    it('join_leave falls back to display_name only without user_id', () => {
        expect(rowAllowed('join_leave', { user_id: '', display_name: 'Alice' }, ids, names)).toBe(true);
        expect(rowAllowed('join_leave', { user_id: '', display_name: 'Mallory' }, ids, names)).toBe(false);
        expect(rowAllowed('status', { user_id: '', display_name: 'Alice' }, ids, names)).toBe(false);
    });
});

describe('toObjects', () => {
    it('maps positional rows to named objects', () => {
        const rows = toObjects([['2026-01-01', 'usr_a', 'active']], ['created_at', 'user_id', 'status']);
        expect(rows[0]).toEqual({ created_at: '2026-01-01', user_id: 'usr_a', status: 'active' });
    });
});
