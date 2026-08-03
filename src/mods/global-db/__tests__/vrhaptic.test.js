import { describe, expect, it } from 'vitest';
import {
    DEFAULT_VR_PANEL,
    HAPTIC_PATTERNS,
    hapticEnabledFor,
    hapticPatternFor
} from '../vrpanel';

// Der Haptik-Schalter wirkt global. Wer nur bei Pool-Nachrichten Ruhe haben,
// bei DMs aber weiter spüren will, dass etwas kam, braucht ein "aus" je
// Ereignis.
describe('Vibrationsmuster', () => {
    it('bietet ein Aus an', () => {
        expect(HAPTIC_PATTERNS.map((p) => p.id)).toContain('none');
    });

    it('unterscheidet die drei Ereignisse per Default', () => {
        const s = DEFAULT_VR_PANEL;
        const global = hapticPatternFor(s, 'global');
        const dm = hapticPatternFor(s, 'dm');
        const invite = hapticPatternFor(s, 'invite');
        expect(new Set([global, dm, invite]).size).toBe(3);
    });

    it('respektiert ein bewusst gesetztes Aus je Ereignis', () => {
        const s = { ...DEFAULT_VR_PANEL, vrHapticDm: 'none' };
        expect(hapticPatternFor(s, 'dm')).toBe('none');
        expect(hapticEnabledFor(s, 'dm')).toBe(false);
        // Die anderen Ereignisse bleiben davon unberührt
        expect(hapticEnabledFor(s, 'global')).toBe(true);
        expect(hapticEnabledFor(s, 'invite')).toBe(true);
    });

    it('behandelt ein fehlendes Muster als Rückfall, nicht als Aus', () => {
        const s = { ...DEFAULT_VR_PANEL, vrHapticDm: undefined };
        expect(hapticPatternFor(s, 'dm')).toBe(DEFAULT_VR_PANEL.vrHapticPattern);
        expect(hapticEnabledFor(s, 'dm')).toBe(true);
    });

    it('schaltet mit dem globalen Haptik-Schalter alles ab', () => {
        const s = { ...DEFAULT_VR_PANEL, vrNotyHaptic: false };
        for (const ev of ['global', 'dm', 'invite']) {
            expect(hapticEnabledFor(s, ev)).toBe(false);
        }
    });

    it('kommt ohne Einstellungen zurecht', () => {
        expect(hapticPatternFor(undefined, 'global')).toBe(DEFAULT_VR_PANEL.vrHapticPattern);
        expect(hapticEnabledFor(undefined, 'global')).toBe(true);
    });
});
