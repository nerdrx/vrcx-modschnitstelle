import { describe, expect, it } from 'vitest';
import {
    DEFAULT_VR_PANEL,
    GESTURE_BUTTONS,
    STICK_MASK,
    gestureButtonLabel,
    migrateGestureButton
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

    it('bietet keinen Stick-Klick an — Legacy-Input meldet dort schon das Kippen', () => {
        const masks = GESTURE_BUTTONS.map((b) => b.mask);
        expect(masks).not.toContain(4294967296);
    });

    it('ist standardmäßig aus, weil der Wrist-Mini das Antippen erlaubt', () => {
        expect(DEFAULT_VR_PANEL.vrGesture).toBe(false);
    });

    it('jede Maske ist genau ein gesetztes Bit', () => {
        for (const b of GESTURE_BUTTONS) {
            expect(b.mask & (b.mask - 1)).toBe(0);
            expect(b.mask).toBeGreaterThan(0);
        }
    });

    it('benennt auch die nicht mehr wählbare Stick-Maske im Klartext', () => {
        // Sonst stand in der UI nur "Taste 4294967296".
        expect(gestureButtonLabel(STICK_MASK)).toContain('Stick-Klick');
    });

    it('setzt eine gespeicherte Stick-Belegung auf B/Y zurück', () => {
        const { settings, changed } = migrateGestureButton({ vrGestureMask: STICK_MASK });
        expect(changed).toBe(true);
        expect(settings.vrGestureMask).toBe(2);
    });

    it('lässt eine gültige Belegung in Ruhe', () => {
        const { settings, changed } = migrateGestureButton({ vrGestureMask: 4 });
        expect(changed).toBe(false);
        expect(settings.vrGestureMask).toBe(4);
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
