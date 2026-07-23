<template>
    <div class="x-container" style="padding: 16px; height: 100%; display: flex; flex-direction: column; overflow: hidden">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap">
            <h2 style="margin: 0; font-size: 18px; font-weight: 600">
                {{ t('mods.globaldb.nav.mod-global-db') }}
            </h2>
            <span class="gdb-badge" :class="settings.enabled && settings.token ? 'gdb-badge--on' : ''">
                {{ settings.enabled && settings.token ? 'Sync aktiv' : 'Nicht verbunden' }}
            </span>
            <button class="gdb-btn" :disabled="busy" @click="testConnection">Verbindung testen</button>
            <button class="gdb-btn" :disabled="busy || !settings.token" @click="syncNow">Jetzt syncen</button>
            <span v-if="busy" style="font-size: 12px; opacity: 0.7">{{ progress }}</span>
        </div>

        <div class="gdb-scroll">
            <div class="gdb-section">
                <h3>Einstellungen</h3>
                <div class="gdb-row">
                    <label>Server</label>
                    <input v-model="settings.serverUrl" class="gdb-input" style="min-width: 320px" />
                </div>
                <div class="gdb-row">
                    <label>Token</label>
                    <input v-model="settings.token" type="password" class="gdb-input" style="min-width: 320px"
                        placeholder="Pool-Token einfügen" />
                </div>
                <div class="gdb-row">
                    <label>Auto-Sync</label>
                    <input v-model="settings.enabled" type="checkbox" />
                    <span style="opacity:.7">alle</span>
                    <input v-model.number="settings.intervalMin" type="number" min="1" class="gdb-input" style="width: 60px" />
                    <span style="opacity:.7">Minuten</span>
                </div>
                <div class="gdb-row" style="align-items: flex-start">
                    <label>Ich teile</label>
                    <div style="display: flex; gap: 14px; flex-wrap: wrap">
                        <label v-for="(name, key) in SHARE_LABELS" :key="key" class="gdb-check">
                            <input v-model="settings.shares[key]" type="checkbox" /> {{ name }}
                        </label>
                    </div>
                </div>
                <div class="gdb-row">
                    <button class="gdb-btn gdb-btn--primary" :disabled="busy" @click="saveSettings">Speichern</button>
                    <button class="gdb-btn gdb-btn--danger" :disabled="busy || !settings.token" @click="leavePool">
                        Pool verlassen &amp; meine Daten löschen
                    </button>
                </div>
                <p class="gdb-note">
                    Erst-Beitritt: DB-Kopie über die <b>Onboarding-Seite</b>
                    (<code>{{ (settings.serverUrl || '').replace(/\/$/, '') }}/onboard</code>) hochladen —
                    danach hält dieser Mod alles automatisch aktuell. Geteilt werden nur
                    Feed-/Gamelog-Daten von Pool-Mitgliedern. Auth, Memos und Configs nie.
                </p>
            </div>

            <div class="gdb-section">
                <h3>Status</h3>
                <div class="gdb-row"><label>Letzter Sync</label><span>{{ lastSync || '—' }}</span></div>
                <div class="gdb-row" style="align-items: flex-start">
                    <label>Pool-Daten lokal</label>
                    <div style="display: flex; gap: 16px; flex-wrap: wrap">
                        <span v-for="(count, key) in counts" :key="key" class="gdb-stat">
                            {{ SHARE_LABELS[key] || key }}: <b>{{ count }}</b>
                        </span>
                    </div>
                </div>
                <div class="gdb-row" style="align-items: flex-start">
                    <label>Mitglieder</label>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap">
                        <span v-for="m in members" :key="m.user_id" class="gdb-member" :title="m.user_id">
                            {{ m.display_name || m.user_id }}
                        </span>
                        <span v-if="members.length === 0" style="opacity: 0.6">— (Verbindung testen)</span>
                    </div>
                </div>
                <div v-if="log.length" class="gdb-log">
                    <div v-for="(line, i) in log" :key="i">{{ line }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { onActivated, onMounted, reactive, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { kvGet, kvSet, poolCounts, clearPool } from './db';
    import { DEFAULT_SERVER, apiFetch, fullSync } from './sync';
    import { restartTimer } from './index';
    import { getCtx } from './runtime';

    const { t } = useI18n();

    const SHARE_LABELS = {
        status: 'Status',
        bio: 'Bio',
        online_offline: 'Online/Offline',
        gps: 'Instanzen (GPS)',
        join_leave: 'Begegnungen (Join/Leave)'
    };

    const settings = reactive({
        serverUrl: DEFAULT_SERVER,
        token: '',
        enabled: false,
        intervalMin: 5,
        shares: { status: true, bio: true, online_offline: true, gps: true, join_leave: true }
    });
    const busy = ref(false);
    const progress = ref('');
    const lastSync = ref('');
    const counts = ref({});
    const members = ref([]);
    const log = ref([]);

    const pushLog = (line) => {
        log.value = [new Date().toLocaleTimeString('de-AT') + '  ' + line, ...log.value].slice(0, 8);
        progress.value = line;
    };

    async function loadState() {
        const ctx = getCtx();
        const stored = await kvGet(ctx, 'settings', null);
        if (stored) Object.assign(settings, { shares: settings.shares, ...stored });
        if (!settings.shares) settings.shares = {};
        lastSync.value = (await kvGet(ctx, 'last_sync', '')) || '';
        counts.value = await poolCounts(ctx);
    }

    async function saveSettings() {
        const ctx = getCtx();
        await kvSet(ctx, 'settings', JSON.parse(JSON.stringify(settings)));
        restartTimer(ctx, settings.intervalMin);
        pushLog('Einstellungen gespeichert.');
    }

    async function testConnection() {
        busy.value = true;
        try {
            const data = await apiFetch(settings, 'v1/members');
            members.value = data.members;
            pushLog(`Verbunden — ${data.members.length} Mitglied(er) im Pool.`);
        } catch (err) {
            pushLog('Fehler: ' + (err.message || err));
        } finally {
            busy.value = false;
        }
    }

    async function syncNow() {
        const ctx = getCtx();
        busy.value = true;
        try {
            await saveSettings();
            const result = await fullSync(ctx, settings, pushLog);
            members.value = result.members || [];
            counts.value = await poolCounts(ctx);
            lastSync.value = (await kvGet(ctx, 'last_sync', '')) || '';
            pushLog(`Fertig: ${result.uploaded} hochgeladen, ${result.downloaded} empfangen, ${result.filtered} gefiltert.`);
        } catch (err) {
            pushLog('Sync-Fehler: ' + (err.message || err));
        } finally {
            busy.value = false;
        }
    }

    async function leavePool() {
        if (!window.confirm('Pool wirklich verlassen? Alle deine Beiträge und Daten über dich werden auf dem Server gelöscht.')) {
            return;
        }
        const ctx = getCtx();
        busy.value = true;
        try {
            await apiFetch(settings, 'v1/leave', { method: 'POST' });
            await clearPool(ctx);
            settings.enabled = false;
            settings.token = '';
            await saveSettings();
            counts.value = await poolCounts(ctx);
            members.value = [];
            pushLog('Pool verlassen — Serverdaten gelöscht, lokale Pool-Kopie geleert.');
        } catch (err) {
            pushLog('Fehler beim Verlassen: ' + (err.message || err));
        } finally {
            busy.value = false;
        }
    }

    onMounted(loadState);
    onActivated(loadState);
</script>

<style scoped>
    .gdb-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
    .gdb-section {
        border: 1px solid var(--border, #4443);
        border-radius: 10px;
        padding: 14px 16px;
        margin-bottom: 14px;
    }
    .gdb-section h3 { margin: 0 0 10px; font-size: 14px; }
    .gdb-row {
        display: flex;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
        font-size: 13px;
        flex-wrap: wrap;
    }
    .gdb-row > label:first-child {
        width: 110px;
        flex-shrink: 0;
        color: var(--muted-foreground, #9f9fa5);
    }
    .gdb-input {
        padding: 5px 10px;
        border: 1px solid var(--border, #4443);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font-size: 13px;
    }
    .gdb-check { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; }
    .gdb-btn {
        padding: 5px 12px;
        border: 1px solid var(--border, #4443);
        border-radius: 6px;
        background: transparent;
        color: var(--muted-foreground, #9f9fa5);
        cursor: pointer;
        font-size: 13px;
    }
    .gdb-btn:hover { color: var(--foreground, #fafafa); }
    .gdb-btn--primary {
        background: var(--accent, #3f3f46);
        color: var(--foreground, #fafafa);
    }
    .gdb-btn--danger { border-color: #e64a4a80; color: #e64a4a; }
    .gdb-badge {
        font-size: 12px;
        padding: 2px 10px;
        border-radius: 10px;
        border: 1px solid var(--border, #4443);
        color: var(--muted-foreground, #9f9fa5);
    }
    .gdb-badge--on { border-color: #51e57e80; color: #51e57e; }
    .gdb-stat, .gdb-member {
        font-size: 12px;
        padding: 2px 10px;
        border-radius: 10px;
        border: 1px solid var(--border, #4443);
    }
    .gdb-note { font-size: 12px; color: var(--muted-foreground, #9f9fa5); margin: 4px 0 0; }
    .gdb-log {
        margin-top: 8px;
        font-size: 11px;
        font-family: monospace;
        opacity: 0.75;
        border-top: 1px solid var(--border, #4442);
        padding-top: 8px;
    }
</style>
