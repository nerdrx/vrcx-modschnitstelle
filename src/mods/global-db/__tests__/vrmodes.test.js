import { describe, expect, it } from 'vitest';
import { DEFAULT_VR_PANEL, migrateVrModes } from '../vrpanel';

// Bis P2-Runde 6 steuerte ein einziger vrMode Mini UND großes Panel. Damit war
// "Mini am Handgelenk + Panel frei in der Welt" nicht kombinierbar.
describe('migrateVrModes', () => {
    it('behält den Handgelenk-Mini und stellt das Panel kopffest', () => {
        const { settings, changed } = migrateVrModes({ vrMode: 'wrist' });
        expect(changed).toBe(true);
        expect(settings.vrMiniMode).toBe('wrist');
        expect(settings.vrBigMode).toBe('hud');
        expect(settings.vrMode).toBeUndefined();
    });

    it('macht aus dem alten world-Modus ein freies Panel mit Kopf-Mini', () => {
        const { settings } = migrateVrModes({ vrMode: 'world' });
        expect(settings.vrMiniMode).toBe('hud');
        expect(settings.vrBigMode).toBe('world');
    });

    it('bildet hud auf beides kopffest ab', () => {
        const { settings } = migrateVrModes({ vrMode: 'hud' });
        expect(settings.vrMiniMode).toBe('hud');
        expect(settings.vrBigMode).toBe('hud');
    });

    it('überschreibt bereits gesetzte Einzelmodi nicht', () => {
        const { settings } = migrateVrModes({
            vrMode: 'world',
            vrMiniMode: 'wrist',
            vrBigMode: 'world'
        });
        expect(settings.vrMiniMode).toBe('wrist');
        expect(settings.vrBigMode).toBe('world');
    });

    it('fasst bereits migrierte Einstellungen nicht an', () => {
        const input = { vrMiniMode: 'wrist', vrBigMode: 'world' };
        const { settings, changed } = migrateVrModes(input);
        expect(changed).toBe(false);
        expect(settings).toEqual(input);
    });
});

describe('DEFAULT_VR_PANEL Positionen', () => {
    it('kombiniert Handgelenk-Mini mit kopffestem Panel', () => {
        expect(DEFAULT_VR_PANEL.vrMiniMode).toBe('wrist');
        expect(DEFAULT_VR_PANEL.vrBigMode).toBe('hud');
        expect(DEFAULT_VR_PANEL.vrMode).toBeUndefined();
    });

    it('hat einen verschiebbaren Offset für das kopffeste Panel', () => {
        expect(DEFAULT_VR_PANEL.vrHudOffZ).toBeLessThan(0); // vor dem Kopf
        expect(DEFAULT_VR_PANEL.vrHudOffX).toBe(0);
    });
});
