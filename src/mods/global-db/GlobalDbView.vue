<template>
    <div class="x-container" style="padding: 16px; height: 100%; display: flex; flex-direction: column; overflow: hidden">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap">
            <h2 style="margin: 0; font-size: 18px; font-weight: 600">
                {{ t('mods.globaldb.nav.mod-global-db') }}
            </h2>
            <span class="gdb-badge" :class="settings.token && connected ? 'gdb-badge--on' : ''">
                {{ settings.token && connected ? 'Verbunden' : 'Nicht verbunden' }}
            </span>
            <span v-if="busy && !init.running" style="font-size: 12px; opacity: 0.7">{{ progress }}</span>
        </div>

        <div class="gdb-scroll">
            <!-- ============================================= Opt-in (kein Token) -->
            <div v-if="!settings.token" class="gdb-section">
                <h3>Freundes-Pool beitreten</h3>
                <p style="font-size: 13px; margin: 0 0 10px">
                    <b>Ich teile:</b> Status, Bio, Online/Offline, Instanzen, Begegnungen.
                </p>
                <p class="gdb-privacy">
                    Memos, Authentifizierung und Configs verlassen deinen PC niemals.
                </p>
                <div class="gdb-row" style="margin-top: 12px">
                    <button
                        class="gdb-btn gdb-btn--primary"
                        :disabled="busy || eligible !== true"
                        @click="joinNow"
                    >
                        Pool beitreten
                    </button>
                    <span v-if="eligible === null" style="font-size: 12px; opacity: 0.7">Prüfe Berechtigung…</span>
                    <span v-else-if="isMember" style="font-size: 12px; opacity: 0.7">
                        Du bist bereits Mitglied — Token vom anderen PC unter „Erweitert" eintragen.
                    </span>
                    <span v-else-if="eligible === false" style="font-size: 12px; opacity: 0.7">
                        Nicht berechtigt — ein Pool-Mitglied muss dich als VRChat-Freund haben.
                    </span>
                </div>
                <p v-if="joinError" class="gdb-error">{{ joinError }}</p>

                <details class="gdb-details">
                    <summary>Erweitert (Zweit-PC / Token manuell eintragen)</summary>
                    <div class="gdb-row" style="margin-top: 10px">
                        <label>Server</label>
                        <input v-model="settings.serverUrl" class="gdb-input" style="min-width: 320px" />
                    </div>
                    <div class="gdb-row">
                        <label>Token</label>
                        <input v-model="manualToken" type="password" class="gdb-input" style="min-width: 320px"
                            placeholder="Token vom anderen PC einfügen" />
                    </div>
                    <div class="gdb-row">
                        <button class="gdb-btn" :disabled="busy || !manualToken" @click="applyManualToken">Übernehmen</button>
                    </div>
                </details>
            </div>

            <!-- ============================================ Mitglied (Token da) -->
            <template v-else>
                <div v-if="init.running" class="gdb-section">
                    <h3>Erst-Sync läuft…</h3>
                    <div class="gdb-progress"><div class="gdb-progress-bar" :class="{ paused: init.paused }"></div></div>
                    <div class="gdb-row" style="margin-top: 8px">
                        <button class="gdb-btn" @click="init.paused = !init.paused">
                            {{ init.paused ? 'Weiter' : 'Pausieren' }}
                        </button>
                        <span style="font-size: 12px; opacity: 0.8">
                            {{ init.uploaded }} hochgeladen · {{ init.downloaded }} empfangen
                        </span>
                    </div>
                    <p class="gdb-note">{{ init.label }}</p>
                </div>

                <div class="gdb-section">
                    <h3>Sync-Status</h3>
                    <div class="gdb-row">
                        <button class="gdb-btn" :disabled="busy" @click="syncNow">Jetzt syncen</button>
                        <button class="gdb-btn" :disabled="busy" @click="testConnection">Verbindung testen</button>
                    </div>
                    <div class="gdb-row"><label>Letzter Sync</label><span>{{ lastSync || '—' }}</span></div>
                    <div class="gdb-row" style="align-items: flex-start">
                        <label>Pool-Daten lokal</label>
                        <div style="display: flex; gap: 16px; flex-wrap: wrap">
                            <span v-for="(count, key) in counts" :key="key" class="gdb-stat">
                                {{ TABLE_LABELS[key] || key }}: <b>{{ count }}</b>
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
                    <p class="gdb-note">
                        Geteilt werden nur Feed-/Gamelog-Daten von Pool-Mitgliedern.
                        <span class="gdb-privacy-inline">Memos, Authentifizierung und Configs verlassen deinen PC niemals.</span>
                    </p>
                    <div v-if="log.length" class="gdb-log">
                        <div v-for="(line, i) in log" :key="i">{{ line }}</div>
                    </div>
                </div>

                <div class="gdb-section">
                    <h3>Konto</h3>
                    <div class="gdb-row">
                        <label>Token</label>
                        <template v-if="!tokenVisible">
                            <span style="letter-spacing: 2px; opacity: 0.6">••••••••••••</span>
                            <button class="gdb-btn" @click="tokenVisible = true">Anzeigen</button>
                        </template>
                        <template v-else>
                            <input :value="settings.token" readonly class="gdb-input" style="min-width: 320px"
                                @focus="$event.target.select()" />
                            <button class="gdb-btn" @click="tokenVisible = false">Verbergen</button>
                        </template>
                        <button class="gdb-btn" @click="copyToken">Kopieren</button>
                        <span style="font-size: 12px; opacity: 0.6">(für Zweit-PC)</span>
                    </div>
                    <div class="gdb-row">
                        <label>Benachrichtigung</label>
                        <button class="gdb-btn" @click="testNoty">Test-Noty (Desktop + VR)</button>
                        <span style="font-size: 12px; opacity: 0.6">prüft Windows-Toast, XSOverlay &amp; VRCX-VR-Overlay</span>
                    </div>
                    <div class="gdb-row">
                        <button class="gdb-btn gdb-btn--danger" :disabled="busy" @click="leavePool">
                            Pool verlassen &amp; meine Daten löschen
                        </button>
                    </div>

                    <details class="gdb-details">
                        <summary>Erweitert</summary>
                        <div class="gdb-row" style="margin-top: 10px">
                            <label>Server</label>
                            <input v-model="settings.serverUrl" class="gdb-input" style="min-width: 320px" />
                        </div>
                        <div class="gdb-row">
                            <label>Auto-Sync</label>
                            <input v-model="settings.enabled" type="checkbox" />
                            <span style="opacity:.7">alle</span>
                            <input v-model.number="settings.intervalMin" type="number" min="1" class="gdb-input" style="width: 60px" />
                            <span style="opacity:.7">Minuten</span>
                        </div>
                        <div class="gdb-row">
                            <button class="gdb-btn gdb-btn--primary" :disabled="busy" @click="saveSettings">Speichern</button>
                        </div>
                    </details>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
    import { onActivated, onMounted, reactive, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { kvGet, kvSet, poolCounts, clearPool } from './db';
    import { DEFAULT_SERVER, apiFetch, fullSync } from './sync';
    import { checkEligible, joinPool, uploadFriendHashes } from './join';
    import { ensureChatReady, restartTimer, startChatIfConfigured } from './index';
    import { getCtx } from './runtime';

    const { t } = useI18n();

    const TABLE_LABELS = {
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
        intervalMin: 5
    });
    const busy = ref(false);
    const progress = ref('');
    const lastSync = ref('');
    const counts = ref({});
    const members = ref([]);
    const log = ref([]);
    const connected = ref(false); // abgeleitet aus erfolgreichen API-Calls
    const eligible = ref(null); // null = checking
    const isMember = ref(false); // Mitglied ohne lokalen Token (Zweit-PC)
    const joinError = ref('');
    const manualToken = ref('');
    const tokenVisible = ref(false);
    const init = reactive({ running: false, paused: false, label: '', uploaded: 0, downloaded: 0 });

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const pushLog = (line) => {
        log.value = [new Date().toLocaleTimeString('de-AT') + '  ' + line, ...log.value].slice(0, 8);
        progress.value = line;
    };

    async function loadState() {
        const ctx = getCtx();
        const stored = await kvGet(ctx, 'settings', null);
        if (stored) {
            const { shares, ...rest } = stored; // alte shares-Settings ignorieren
            Object.assign(settings, rest);
        }
        lastSync.value = (await kvGet(ctx, 'last_sync', '')) || '';
        counts.value = await poolCounts(ctx);
        if (settings.token) {
            // Stiller Members-Fetch: füllt Mitgliederliste + Verbunden-Badge.
            apiFetch(settings, 'v1/members')
                .then((data) => {
                    members.value = data.members;
                    connected.value = true;
                })
                .catch(() => {
                    connected.value = false;
                });
        }
        if (!settings.token) {
            eligible.value = null;
            isMember.value = false;
            try {
                const uid = ctx.stores.user.currentUser?.id;
                const state = await checkEligible(settings, uid);
                eligible.value = state.eligible;
                isMember.value = state.member;
            } catch {
                eligible.value = false;
            }
        }
    }

    async function saveSettings() {
        const ctx = getCtx();
        await kvSet(ctx, 'settings', JSON.parse(JSON.stringify(settings)));
        restartTimer(ctx, settings.intervalMin);
        startChatIfConfigured(ctx).catch(() => {});
        pushLog('Einstellungen gespeichert.');
    }

    // ---------------------------------------------------- P1.5 opt-in flow --
    // Ein Klick: join → Token speichern → Freundes-Hashes hochladen →
    // Erst-Sync mit voller Bandbreite (pausierbar) → Delta-Sync gedrosselt.
    async function joinNow() {
        const ctx = getCtx();
        joinError.value = '';
        busy.value = true;
        try {
            const me = ctx.stores.user.currentUser;
            if (!me?.id) throw new Error('VRChat-Login nicht bereit.');
            const token = await joinPool(settings, me.id, me.displayName || me.username || me.id);
            settings.token = token;
            settings.enabled = true;
            await kvSet(ctx, 'settings', JSON.parse(JSON.stringify(settings)));
            pushLog('Beigetreten — Token gespeichert.');
            try {
                const n = await uploadFriendHashes(ctx, settings);
                pushLog(`Freundes-Hashes hochgeladen (${n}).`);
            } catch (err) {
                pushLog('Freundes-Hashes fehlgeschlagen: ' + (err.message || err));
            }
            await runInitialSync();
            restartTimer(ctx, settings.intervalMin);
            ensureChatReady(ctx).catch(() => {});
        } catch (err) {
            joinError.value = String(err.message || err);
        } finally {
            busy.value = false;
        }
    }

    async function runInitialSync() {
        const ctx = getCtx();
        init.running = true;
        init.paused = false;
        init.uploaded = 0;
        init.downloaded = 0;
        init.label = 'Starte Erst-Sync…';
        const gate = async () => {
            while (init.paused) await sleep(300);
        };
        try {
            const result = await fullSync(
                ctx,
                settings,
                (label, res) => {
                    init.label = label;
                    if (res?.uploaded !== undefined) init.uploaded = res.uploaded;
                    if (res?.downloaded !== undefined) init.downloaded = res.downloaded;
                },
                { batch: 5000, throttleMs: 0, gate }
            );
            members.value = result.members || [];
            connected.value = true;
            counts.value = await poolCounts(ctx);
            lastSync.value = (await kvGet(ctx, 'last_sync', '')) || '';
            if (result.ok) {
                pushLog(`Erst-Sync fertig: ${result.uploaded} hochgeladen, ${result.downloaded} empfangen.`);
            } else {
                pushLog(`Erst-Sync unvollständig (${Object.keys(result.errors).join(', ')}) — nächster Sync setzt fort.`);
            }
        } catch (err) {
            pushLog('Erst-Sync unterbrochen: ' + (err.message || err) + ' — läuft beim nächsten Sync weiter.');
        } finally {
            init.running = false;
        }
    }

    async function applyManualToken() {
        const ctx = getCtx();
        busy.value = true;
        try {
            settings.token = manualToken.value.trim();
            settings.enabled = true;
            await kvSet(ctx, 'settings', JSON.parse(JSON.stringify(settings)));
            await apiFetch(settings, 'v1/members'); // Token validieren
            connected.value = true;
            manualToken.value = '';
            pushLog('Token übernommen — starte Sync (Chat folgt nach erstem erfolgreichen Sync).');
            restartTimer(ctx, settings.intervalMin);
            busy.value = false;
            await syncNow();
            return;
        } catch (err) {
            settings.token = '';
            pushLog('Token ungültig: ' + (err.message || err));
        } finally {
            busy.value = false;
        }
    }

    async function testNoty() {
        const ctx = getCtx();
        await ctx.ui.notify({
            title: 'Pool-Chat',
            body: 'Test-Benachrichtigung ' + new Date().toLocaleTimeString('de-AT'),
            desktop: true,
            xs: true,
            vr: true
        });
        pushLog('Test-Noty gesendet (Desktop + XSOverlay + VR-Overlay).');
    }

    function copyToken() {
        try {
            navigator.clipboard.writeText(settings.token);
            pushLog('Token kopiert.');
        } catch {
            tokenVisible.value = true;
            pushLog('Kopieren fehlgeschlagen — Token manuell markieren.');
        }
    }

    async function testConnection() {
        busy.value = true;
        try {
            const data = await apiFetch(settings, 'v1/members');
            members.value = data.members;
            connected.value = true;
            pushLog(`Verbunden — ${data.members.length} Mitglied(er) im Pool.`);
        } catch (err) {
            connected.value = false;
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
            connected.value = true;
            counts.value = await poolCounts(ctx);
            lastSync.value = (await kvGet(ctx, 'last_sync', '')) || '';
            if (result.ok) {
                pushLog(`Fertig: ${result.uploaded} hochgeladen, ${result.downloaded} empfangen, ${result.filtered} gefiltert.`);
                ensureChatReady(ctx).catch(() => {});
            } else {
                pushLog(`Sync mit Fehlern (${Object.keys(result.errors).join(', ')}): ${Object.values(result.errors)[0]}`);
            }
        } catch (err) {
            connected.value = false;
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
            connected.value = false;
            tokenVisible.value = false;
            await kvSet(ctx, 'settings', JSON.parse(JSON.stringify(settings)));
            await kvSet(ctx, 'first_sync_done', false);
            startChatIfConfigured(ctx).catch(() => {}); // stoppt Chat + VR-Panel
            counts.value = await poolCounts(ctx);
            members.value = [];
            pushLog('Pool verlassen — Serverdaten gelöscht, lokale Pool-Kopie geleert.');
            await loadState();
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
    .gdb-privacy { color: #e64a4a; font-size: 13px; font-weight: 600; margin: 0; }
    .gdb-privacy-inline { color: #e64a4a; }
    .gdb-error { color: #e64a4a; font-size: 12px; margin: 6px 0 0; }
    .gdb-details { margin-top: 12px; font-size: 13px; }
    .gdb-details summary { cursor: pointer; color: var(--muted-foreground, #9f9fa5); }
    .gdb-progress {
        height: 8px;
        border-radius: 4px;
        border: 1px solid var(--border, #4443);
        overflow: hidden;
        position: relative;
    }
    .gdb-progress-bar {
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(
            45deg,
            var(--accent, #3f3f46) 0 12px,
            transparent 12px 24px
        );
        animation: gdb-slide 1s linear infinite;
    }
    .gdb-progress-bar.paused { animation-play-state: paused; opacity: 0.4; }
    @keyframes gdb-slide {
        from { background-position: 0 0; }
        to { background-position: 34px 0; }
    }
    .gdb-log {
        margin-top: 8px;
        font-size: 11px;
        font-family: monospace;
        opacity: 0.75;
        border-top: 1px solid var(--border, #4442);
        padding-top: 8px;
    }
</style>
