<template>
    <div>
        <div style="display: flex; gap: 10px; margin-bottom: 12px; font-size: 12px; flex-wrap: wrap; align-items: center">
            <input v-model="search" placeholder="Suche…" class="st-search" type="text" />
            <span style="opacity: 0.65">{{ visibleEntries.length }} Einträge</span>
            <button
                class="st-tool-btn"
                :disabled="checking"
                title="Belegung aller angezeigten Instanzen prüfen (2 Anfragen / s)"
                @click="checkOccupancy">
                Belegung prüfen
            </button>
            <span v-if="checking" style="opacity: 0.7">
                prüfe… {{ checkProgress }}
                <button class="st-tool-btn" style="margin-left: 4px" @click="stopChecking = true">Stopp</button>
            </span>
            <span v-if="lastCheckedAt" style="opacity: 0.5">zuletzt geprüft: {{ lastCheckedAt }}</span>
            <span v-if="loading" style="opacity: 0.6">…</span>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 12px; font-size: 12px; flex-wrap: wrap; align-items: center">
            <button
                v-for="s in statusFilters"
                :key="s.key"
                class="st-chip"
                :class="{ 'st-chip--active': selectedStatuses.has(s.key) }"
                type="button"
                title="Nach aktuellem Status filtern (Mehrfachauswahl möglich)"
                @click="toggleStatusFilter(s.key)">
                <span :style="{ background: s.color }" class="st-dot"></span>{{ s.label }} ({{ statusCount(s.key) }})
            </button>
            <button
                v-if="selectedStatuses.size"
                class="st-chip st-chip--clear"
                type="button"
                @click="selectedStatuses = new Set()">
                ✕ Zurücksetzen
            </button>
        </div>

        <div class="st-scroll">
            <table class="st-table" style="min-width: 720px">
                <thead>
                    <tr>
                        <th style="text-align: left; min-width: 160px">Friend</th>
                        <th style="text-align: left">Status</th>
                        <th style="text-align: left">Welt</th>
                        <th style="text-align: left">Dort seit</th>
                        <th style="text-align: right">Belegung</th>
                        <th style="text-align: right"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="entry in visibleEntries" :key="entry.userId" :title="entry.userId">
                        <td style="font-weight: 500">
                            <a class="st-name-link" title="Profil öffnen" @click.stop="openUser(entry.userId)">
                                {{ entry.displayName }}
                            </a>
                        </td>
                        <td>
                            <span
                                :style="{ background: statusColor(entry.userId) }"
                                class="st-dot"
                                :title="statusText(entry.userId)"></span>
                        </td>
                        <td class="st-loc">
                            <a
                                class="st-world-link"
                                :title="entry.location + ' — klicken für World-Dialog'"
                                @click.stop="openWorld(entry.location)">
                                {{ entry.worldName || entry.location }}
                            </a>
                        </td>
                        <td style="white-space: nowrap">{{ formatAgo(entry.tsMs) }}</td>
                        <td style="text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums">
                            <template v-if="occOf(entry)">
                                <span :style="occOf(entry).users === 0 ? 'opacity:.5' : ''">
                                    {{ occOf(entry).users }}/{{ occOf(entry).capacity || '?' }}
                                </span>
                            </template>
                            <span v-else-if="occErrorOf(entry)" title="Instanz nicht abfragbar (privat/geschlossen?)">?</span>
                            <span v-else style="opacity: 0.4">–</span>
                        </td>
                        <td style="text-align: right">
                            <button
                                class="st-tool-btn"
                                title="Eintrag entfernen (bleibt entfernt)"
                                @click="dismiss(entry)">
                                ✕
                            </button>
                        </td>
                    </tr>
                    <tr v-if="!loading && visibleEntries.length === 0">
                        <td colspan="6" style="text-align: center; opacity: 0.6; padding: 24px">
                            Keine bekannten Instanzen. (Einträge entstehen aus GPS-Feed-Ereignissen.)
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div style="margin-top: 12px; font-size: 11px; opacity: 0.6; max-width: 720px">
            Merkt sich pro Freund die letzte bekannte Instanz (auch nach Statuswechsel auf Orange/Rot oder
            „Private"). „Belegung prüfen" fragt die Instanzen einzeln mit 0,5 s Abstand ab — Einträge mit
            bestätigter Belegung 0 werden automatisch entfernt. Läuft zusätzlich automatisch alle 5 Minuten,
            solange dieser Tab geöffnet ist.
        </div>
    </div>
</template>

<script setup>
    import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue';

    import {
        dismissInstance,
        initDismissedTable,
        loadDismissed,
        loadLastGpsPerFriend
    } from './db';
    import { getCtx } from './runtime';

    const STATUS_COLORS = {
        'join me': '#42caff',
        active: '#51e57e',
        'ask me': '#e8a838',
        busy: '#e64a4a',
        offline: '#8a8a8a'
    };

    const STATUS_FILTERS = [
        { key: 'join me', color: '#42caff', label: 'Join Me' },
        { key: 'active', color: '#51e57e', label: 'Active' },
        { key: 'ask me', color: '#e8a838', label: 'Ask Me' },
        { key: 'busy', color: '#e64a4a', label: 'Busy' }
    ];
    const statusFilters = STATUS_FILTERS;

    const loading = ref(false);
    const search = ref('');
    const selectedStatuses = ref(new Set());
    const entries = ref(new Map()); // userId -> {userId, displayName, location, worldName, tsMs}
    const occ = ref(new Map()); // location -> {users, capacity, fetchedAt} | {error:true}
    const checking = ref(false);
    const checkProgress = ref('');
    const stopChecking = ref(false);
    const lastCheckedAt = ref('');
    let dismissed = new Set();
    let unsubscribers = [];
    let autoTimer = null;
    let disposed = false;

    function keyOf(userId, location) {
        return `${userId}|${location}`;
    }

    function friendRef(userId) {
        try {
            return getCtx().stores.friends.friends.get(userId)?.ref || null;
        } catch {
            return null;
        }
    }

    function statusText(userId) {
        return friendRef(userId)?.status || 'unbekannt';
    }

    function statusColor(userId) {
        return STATUS_COLORS[statusText(userId)] || '#666';
    }

    function isOffline(userId) {
        const ref = friendRef(userId);
        if (!ref) {
            return false;
        }
        return ref.state === 'offline' || ref.status === 'offline';
    }

    function occOf(entry) {
        const o = occ.value.get(entry.location);
        return o && !o.error ? o : null;
    }

    function occErrorOf(entry) {
        return occ.value.get(entry.location)?.error === true;
    }

    function formatAgo(tsMs) {
        const mins = Math.floor((Date.now() - tsMs) / 60000);
        if (mins < 1) {
            return 'gerade eben';
        }
        if (mins < 60) {
            return `vor ${mins} min`;
        }
        const h = Math.floor(mins / 60);
        if (h < 24) {
            return `vor ${h} h ${mins % 60} min`;
        }
        return `vor ${Math.floor(h / 24)} d ${h % 24} h`;
    }

    function openWorld(location) {
        try {
            getCtx().ui.showWorldDialog(location);
        } catch (err) {
            getCtx().error('showWorldDialog failed:', err);
        }
    }

    function openUser(userId) {
        try {
            getCtx().ui.showUserDialog(userId);
        } catch (err) {
            getCtx().error('showUserDialog failed:', err);
        }
    }

    function toggleStatusFilter(key) {
        const next = new Set(selectedStatuses.value);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        selectedStatuses.value = next;
    }

    const baseEntries = computed(() =>
        [...entries.value.values()].filter((entry) => !isOffline(entry.userId))
    );

    function statusCount(key) {
        return baseEntries.value.reduce(
            (n, entry) => (statusText(entry.userId) === key ? n + 1 : n),
            0
        );
    }

    const visibleEntries = computed(() => {
        const q = search.value.trim().toLowerCase();
        let list = baseEntries.value;
        if (selectedStatuses.value.size > 0) {
            list = list.filter((entry) => selectedStatuses.value.has(statusText(entry.userId)));
        }
        if (q) {
            list = list.filter(
                (entry) =>
                    entry.displayName.toLowerCase().includes(q) ||
                    (entry.worldName || '').toLowerCase().includes(q)
            );
        }
        return [...list].sort((a, b) => b.tsMs - a.tsMs);
    });

    function upsertEntry({ userId, displayName, location, worldName, tsMs }) {
        if (dismissed.has(keyOf(userId, location))) {
            return;
        }
        const next = new Map(entries.value);
        next.set(userId, { userId, displayName, location, worldName, tsMs });
        entries.value = next;
    }

    function removeEntry(userId) {
        if (!entries.value.has(userId)) {
            return;
        }
        const next = new Map(entries.value);
        next.delete(userId);
        entries.value = next;
    }

    async function dismiss(entry) {
        const ctx = getCtx();
        try {
            await dismissInstance(ctx, entry.userId, entry.location);
            dismissed.add(keyOf(entry.userId, entry.location));
        } catch (err) {
            ctx.error('dismiss failed:', err);
        }
        removeEntry(entry.userId);
    }

    async function load() {
        const ctx = getCtx();
        loading.value = true;
        try {
            await initDismissedTable(ctx);
            dismissed = await loadDismissed(ctx);
            const gpsRows = await loadLastGpsPerFriend(ctx);
            const friendStore = ctx.stores.friends;
            const next = new Map();
            for (const row of gpsRows) {
                if (!friendStore.friends.has(row.userId)) {
                    continue; // no longer a friend
                }
                if (dismissed.has(keyOf(row.userId, row.location))) {
                    continue;
                }
                next.set(row.userId, {
                    userId: row.userId,
                    displayName:
                        friendStore.friends.get(row.userId)?.ref?.displayName ||
                        row.displayName ||
                        row.userId,
                    location: row.location,
                    worldName: row.worldName,
                    tsMs: new Date(row.lastDt).getTime()
                });
            }
            entries.value = next;
        } catch (err) {
            getCtx().error('last instance load failed:', err);
        } finally {
            loading.value = false;
        }
    }

    /**
     * Query occupancy for all visible instances, one API call per 2 s.
     * Entries whose instance is confirmed empty (0 users) are auto-removed
     * (persisted as dismissed).
     */
    async function checkOccupancy() {
        if (checking.value) {
            return;
        }
        const ctx = getCtx();
        const locations = [...new Set(visibleEntries.value.map((entry) => entry.location))];
        if (locations.length === 0) {
            return;
        }
        checking.value = true;
        stopChecking.value = false;
        try {
            for (let i = 0; i < locations.length; i++) {
                if (stopChecking.value || disposed) {
                    break;
                }
                checkProgress.value = `${i + 1}/${locations.length}`;
                const location = locations[i];
                try {
                    const json = await ctx.api.getInstance(location);
                    const users = json?.userCount ?? json?.n_users;
                    if (typeof users === 'number') {
                        const next = new Map(occ.value);
                        next.set(location, {
                            users,
                            capacity: json?.capacity || 0,
                            fetchedAt: Date.now()
                        });
                        occ.value = next;
                        if (users === 0) {
                            for (const entry of [...entries.value.values()]) {
                                if (entry.location === location) {
                                    await dismiss(entry);
                                }
                            }
                        }
                    } else {
                        const next = new Map(occ.value);
                        next.set(location, { error: true });
                        occ.value = next;
                    }
                } catch {
                    const next = new Map(occ.value);
                    next.set(location, { error: true });
                    occ.value = next;
                }
                if (i < locations.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
            }
            lastCheckedAt.value = new Date().toLocaleTimeString('de-AT', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } finally {
            checking.value = false;
            checkProgress.value = '';
        }
    }

    function installLiveUpdates() {
        const ctx = getCtx();
        unsubscribers.push(
            ctx.on('feed:GPS', (feed) => {
                if (feed.location && feed.location.startsWith('wrld_')) {
                    upsertEntry({
                        userId: feed.userId,
                        displayName: feed.displayName,
                        location: feed.location,
                        worldName: feed.worldName || '',
                        tsMs: Date.now()
                    });
                }
                // GPS to 'private'/'traveling' keeps the last known instance
            })
        );
        unsubscribers.push(
            ctx.on('feed:Offline', (feed) => {
                removeEntry(feed.userId);
            })
        );
    }

    onMounted(() => {
        load();
        installLiveUpdates();
        autoTimer = setInterval(() => {
            if (!checking.value) {
                checkOccupancy();
            }
        }, 5 * 60 * 1000);
    });
    onActivated(load);
    onBeforeUnmount(() => {
        disposed = true;
        stopChecking.value = true;
        clearInterval(autoTimer);
        for (const unsubscribe of unsubscribers) {
            try {
                unsubscribe();
            } catch {
                /* noop */
            }
        }
        unsubscribers = [];
    });
</script>

<style scoped>
    .st-search {
        padding: 4px 10px;
        border: 1px solid var(--border, #4443);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font-size: 12px;
        min-width: 160px;
    }
    .st-tool-btn {
        padding: 3px 9px;
        border: 1px solid var(--border, #4443);
        border-radius: 6px;
        background: transparent;
        color: var(--muted-foreground, #9f9fa5);
        cursor: pointer;
        font-size: 12px;
    }
    .st-tool-btn:hover {
        color: var(--foreground, #fafafa);
    }
    .st-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
    }
    .st-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border: 1px solid var(--border, #4443);
        border-radius: 12px;
        background: transparent;
        color: var(--muted-foreground, #9f9fa5);
        cursor: pointer;
        font-size: 12px;
    }
    .st-chip--active {
        border-color: var(--muted-foreground, #9f9fa5);
        background: var(--accent, #3f3f46);
        color: var(--foreground, #fafafa);
    }
    .st-chip--clear {
        opacity: 0.7;
    }
    .st-scroll {
        overflow-x: auto;
    }
    .st-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }
    .st-table th,
    .st-table td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--border, #4442);
    }
    .st-loc {
        max-width: 320px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .st-world-link,
    .st-name-link {
        cursor: pointer;
        text-decoration: none;
    }
    .st-world-link:hover,
    .st-name-link:hover {
        color: var(--foreground, #fafafa);
        text-decoration: underline;
    }
</style>
