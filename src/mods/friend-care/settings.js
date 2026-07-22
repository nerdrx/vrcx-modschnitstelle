// ============================================================================
// Friend Care — user settings (colors + thresholds), persisted in an own
// mod table per VRCX account.
// ============================================================================

import { DEFAULT_INACTIVITY_THRESHOLDS, DEFAULT_SEEN_THRESHOLDS } from './engine';

export const DEFAULT_SETTINGS = {
    seen: {
        thresholds: { ...DEFAULT_SEEN_THRESHOLDS }, // months
        colors: {
            green: '#3498DB', // Frisch (blau)
            neutral: '#2ECC71', // Okay (grün)
            orange: '#E67E22', // Grenzwertig
            red: '#E74C3C', // Überfällig
            never: '#7F8C8D' // Nie gesehen (grau)
        }
    },
    inactivity: {
        thresholds: { ...DEFAULT_INACTIVITY_THRESHOLDS }, // months
        colors: {
            active: '#2ECC71', // Aktiv (grün)
            green: '#E67E22', // Inaktiv (orange)
            orange: '#E74C3C', // Lange weg (rot)
            red: '#7F8C8D', // Verschollen (grau)
            nodata: '#95A5A6' // Keine Daten (grau)
        }
    }
};

function settingsTable(ctx) {
    return `${ctx.db.prefix()}_settings`;
}

function deepMergeDefaults(defaults, stored) {
    const out = {};
    for (const [key, value] of Object.entries(defaults)) {
        if (value && typeof value === 'object') {
            out[key] = deepMergeDefaults(value, stored?.[key]);
        } else if (stored != null && typeof stored[key] === typeof value) {
            out[key] = stored[key];
        } else {
            out[key] = value;
        }
    }
    return out;
}

export async function initSettingsTable(ctx) {
    await ctx.db.exec(
        `CREATE TABLE IF NOT EXISTS ${settingsTable(ctx)} (
            key TEXT PRIMARY KEY,
            value TEXT
        )`
    );
}

/** Load settings, merged over defaults (unknown/missing keys fall back). */
export async function loadSettings(ctx) {
    await initSettingsTable(ctx);
    try {
        const rows = await ctx.db.query(
            `SELECT value FROM ${settingsTable(ctx)} WHERE key = @key`,
            { '@key': 'v1' }
        );
        if (rows.length > 0 && rows[0][0]) {
            return deepMergeDefaults(DEFAULT_SETTINGS, JSON.parse(rows[0][0]));
        }
    } catch (err) {
        ctx.warn('settings load failed, using defaults:', err);
    }
    return deepMergeDefaults(DEFAULT_SETTINGS, null);
}

export async function saveSettings(ctx, settings) {
    await initSettingsTable(ctx);
    await ctx.db.exec(
        `INSERT OR REPLACE INTO ${settingsTable(ctx)} (key, value) VALUES (@key, @value)`,
        { '@key': 'v1', '@value': JSON.stringify(settings) }
    );
}
