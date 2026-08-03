import { describe, expect, it } from 'vitest';
import { DEFAULT_VR_PANEL, migrateLaserCalibration } from '../vrpanel';

// P2: die Laser-Kalibrierung war bis Runde 5 ein cm-Offset auf die Ray-Quelle
// (Parallaxe — der Korrekturbedarf wanderte über die Panelfläche). Jetzt sind
// es Winkel; Bestandseinstellungen müssen verlustfrei mitwandern.
describe('migrateLaserCalibration', () => {
    it('rechnet cm-Offsets eines Bestandsnutzers in Grad um', () => {
        const { settings, changed } = migrateLaserCalibration({
            vrLaserOffX: -8,
            vrLaserOffY: -3.5,
            vrLaserPitch: 40
        });
        expect(changed).toBe(true);
        expect(settings.vrLaserYaw).toBeCloseTo(-4.6, 1);
        // -3,5 cm nach unten entspricht ~2° mehr Neigung
        expect(settings.vrLaserPitch).toBeCloseTo(42.0, 1);
        expect(settings.vrLaserOffX).toBeUndefined();
        expect(settings.vrLaserOffY).toBeUndefined();
    });

    it('nimmt den Default-Pitch als Basis, wenn keiner gespeichert ist', () => {
        const { settings } = migrateLaserCalibration({ vrLaserOffY: 3.5 });
        expect(settings.vrLaserPitch).toBeCloseTo(
            DEFAULT_VR_PANEL.vrLaserPitch - 2.0,
            1
        );
    });

    it('lässt bereits migrierte Einstellungen unverändert', () => {
        const input = { vrLaserYaw: -4.6, vrLaserPitch: 42, vrWristGate: true };
        const { settings, changed } = migrateLaserCalibration(input);
        expect(changed).toBe(false);
        expect(settings).toEqual(input);
    });

    it('fasst frische Einstellungen ohne Kalibrierung nicht an', () => {
        const { settings, changed } = migrateLaserCalibration({ vrPanel: true });
        expect(changed).toBe(false);
        expect(settings).toEqual({ vrPanel: true });
    });

    it('überschreibt einen vorhandenen Yaw nicht mit dem alten cm-Wert', () => {
        const { settings } = migrateLaserCalibration({
            vrLaserYaw: -2,
            vrLaserOffX: -8
        });
        expect(settings.vrLaserYaw).toBe(-2);
    });
});

describe('DEFAULT_VR_PANEL', () => {
    it('zeigt den Wrist-Mini standardmäßig dauerhaft (Gate aus)', () => {
        expect(DEFAULT_VR_PANEL.vrWristGate).toBe(false);
        // 'auto' folgt der VRCX-Overlay-Hand; sie darf aber nicht filtern.
        expect(DEFAULT_VR_PANEL.vrWristHand).toBe('auto');
        expect(DEFAULT_VR_PANEL.vrMiniMode).toBe('wrist');
    });

    it('kalibriert den Laser in Grad, nicht mehr in cm', () => {
        expect(DEFAULT_VR_PANEL.vrLaserYaw).toBeDefined();
        expect(DEFAULT_VR_PANEL.vrLaserOffX).toBeUndefined();
        expect(DEFAULT_VR_PANEL.vrLaserOffY).toBeUndefined();
    });
});
