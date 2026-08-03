import { describe, expect, it } from 'vitest';
import {
    DEFAULT_VR_PANEL,
    GESTURE_BUTTONS,
    gestureButtonLabel
} from '../vrpanel';

// Grip auf beiden Händen ist im Spiel eine Alltagsbewegung und öffnete den
// Chat ständig ungewollt — deshalb muss die Taste umbelegbar sein.
describe('Gesten-Tasten', () => {
    it('bietet mehrere bekannte Tasten an', () => {
        expect(GESTURE_BUTTONS.length).toBeGreaterThanOrEqual(3);
        const masks = GESTURE_BUTTONS.map((b) => b.mask);
        expect(new Set(masks).size).toBe(masks.length); // keine Dubletten
        expect(masks).toContain(4); // Grip
        expect(masks).toContain(2); // B/Y
    });

    it('jede Maske ist genau ein gesetztes Bit', () => {
        for (const b of GESTURE_BUTTONS) {
            expect(b.mask & (b.mask - 1)).toBe(0);
            expect(b.mask).toBeGreaterThan(0);
        }
    });

    it('benennt bekannte Tasten und fällt sonst auf die Maske zurück', () => {
        expect(gestureButtonLabel(4)).toBe('Grip');
        expect(gestureButtonLabel(999)).toContain('999');
    });

    it('nutzt standardmäßig nicht mehr den Grip', () => {
        expect(DEFAULT_VR_PANEL.vrGestureMask).not.toBe(4);
        expect(DEFAULT_VR_PANEL.vrGestureMode).toBe('hold');
        expect(DEFAULT_VR_PANEL.vrGestureHand).toBe('both');
        expect(DEFAULT_VR_PANEL.vrGestureHold).toBeGreaterThanOrEqual(200);
    });
});

describe('Blickwinkel und Mini-Positionen', () => {
    it('hat einen einstellbaren Blickwinkel in Grad', () => {
        expect(DEFAULT_VR_PANEL.vrWristAngle).toBeGreaterThanOrEqual(5);
        expect(DEFAULT_VR_PANEL.vrWristAngle).toBeLessThanOrEqual(90);
    });

    it('kennt einen Offset und eine Größe für den freien Mini', () => {
        expect(DEFAULT_VR_PANEL.vrMiniOffZ).toBeLessThan(0); // vor dem Kopf
        expect(DEFAULT_VR_PANEL.vrMiniWidth).toBeGreaterThan(0);
    });
});
