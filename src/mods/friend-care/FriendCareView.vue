<template>
    <div
        class="x-container"
        style="padding: 16px; height: 100%; display: flex; flex-direction: column; overflow: hidden">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap">
            <h2 style="margin: 0; font-size: 18px; font-weight: 600">
                {{ t('mods.friendcare.nav.mod-friend-care') }}
            </h2>
            <div class="fc-seg">
                <button
                    class="fc-tab-btn"
                    :class="{ 'fc-tab-btn--active': tab === 'seen' }"
                    @click="setTab('seen')">
                    Zuletzt getroffen
                </button>
                <button
                    class="fc-tab-btn"
                    :class="{ 'fc-tab-btn--active': tab === 'inactivity' }"
                    @click="setTab('inactivity')">
                    Inaktivität
                </button>
            </div>
            <input v-model="search" placeholder="Suche…" class="fc-search" type="text" />
            <span style="font-size: 12px; opacity: 0.65">{{ visibleRows.length }} / {{ rows.length }}</span>
            <button class="fc-tool-btn" title="Neu laden" @click="refresh">↻</button>
            <button class="fc-tool-btn" title="Sichtbare Liste als CSV exportieren" @click="exportCsv">CSV</button>
            <button
                v-if="tab === 'seen' && missingWorldCount > 0 && !resolving"
                class="fc-tool-btn"
                title="Fehlende Weltnamen einzeln über die VRChat-API laden (1 Anfrage / 1,5 s, kein Rate-Limit-Risiko)"
                @click="resolveMissingWorlds">
                Namen laden ({{ missingWorldCount }})
            </button>
            <span v-if="resolving" style="font-size: 12px; opacity: 0.7">
                lade Weltnamen… {{ resolveProgress }}
                <button class="fc-tool-btn" style="margin-left: 4px" @click="stopResolving = true">Stopp</button>
            </span>
            <span v-if="loading" style="font-size: 12px; opacity: 0.6">…</span>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 12px; font-size: 12px; flex-wrap: wrap; align-items: center">
            <button
                class="fc-chip"
                :class="{ 'fc-chip--active': filterCat === null }"
                @click="filterCat = null">
                Alle
            </button>
            <button
                v-for="c in categories"
                :key="c.key"
                class="fc-chip"
                :class="{ 'fc-chip--active': filterCat === c.key }"
                :title="c.hint"
                @click="filterCat = filterCat === c.key ? null : c.key">
                <span :style="{ background: c.color }" class="fc-dot"></span>
                {{ c.label }} ({{ countFor(c.key) }})
            </button>
        </div>

        <div class="fc-scroll">
        <table class="fc-table" style="min-width: 700px">
            <thead>
                <tr>
                    <th class="fc-th-sort" style="text-align: left; min-width: 180px" @click="setSort('name')">
                        Friend<span v-if="sortBy === 'name'" class="fc-sort-arrow">{{ sortDir > 0 ? '▲' : '▼' }}</span>
                    </th>
                    <th class="fc-th-sort" style="text-align: left" @click="setSort('date')">
                        {{ tab === 'seen' ? 'Zuletzt in gemeinsamer Instanz' : 'Letzte Aktivität' }}
                        <span v-if="sortBy === 'date'" class="fc-sort-arrow">{{ sortDir > 0 ? '▲' : '▼' }}</span>
                    </th>
                    <th style="text-align: left">Kategorie</th>
                    <th v-if="tab === 'seen'" style="text-align: left">Ort (letztes Treffen)</th>
                    <th v-else style="text-align: left">Quelle</th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="row in visibleRows"
                    :key="row.userId"
                    :style="{ background: rowColor(row) }"
                    :title="row.userId">
                    <td style="font-weight: 500">
                        <a class="fc-name-link" title="Profil öffnen" @click.stop="openUser(row.userId)">
                            {{ row.displayName }}
                        </a>
                    </td>
                    <td>
                        <template v-if="row.tsMs">
                            {{ formatDate(row.tsMs) }}
                            <span style="opacity: 0.7">· {{ formatAgo(row.days) }}</span>
                        </template>
                        <span v-else style="opacity: 0.6">—</span>
                    </td>
                    <td>
                        <span class="fc-badge" :style="{ borderColor: catMeta(row.category).color }">
                            {{ catMeta(row.category).label }}
                        </span>
                    </td>
                    <td v-if="tab === 'seen'" class="fc-loc">
                        <a
                            v-if="row.location"
                            class="fc-world-link"
                            :title="row.location + ' — klicken für World-Dialog'"
                            @click.stop="openWorld(row.location)">
                            {{ worldLabel(row.location) }}
                        </a>
                        <span v-else>—</span>
                    </td>
                    <td v-else style="opacity: 0.75">{{ sourceLabel(row.source) }}</td>
                </tr>
                <tr v-if="!loading && visibleRows.length === 0">
                    <td colspan="4" style="text-align: center; opacity: 0.6; padding: 24px">Keine Einträge.</td>
                </tr>
            </tbody>
        </table>
        </div>

        <div style="margin-top: 14px; font-size: 11px; opacity: 0.65; display: flex; gap: 14px; flex-wrap: wrap">
            <span v-for="c in categories" :key="c.key" style="display: inline-flex; align-items: center; gap: 5px">
                <span :style="{ background: c.color }" class="fc-dot"></span>{{ c.label }}: {{ c.hint }}
            </span>
        </div>
    </div>
</template>

<script setup>
    import { computed, onActivated, onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import {
        daysBetween,
        inactivityCategory,
        matchLastSeen,
        pickLastActive,
        seenCategory
    } from './engine';
    import { getLastFeedActivity, getLastSeenRows, getWorldNames } from './db';
    import { getCtx } from './runtime';

    const { t } = useI18n();

    const SEEN_META = {
        green: { color: '#2ECC71', label: 'Frisch', hint: 'unter 1 Monat' },
        neutral: { color: '#95A5A6', label: 'Okay', hint: '1–3 Monate' },
        orange: { color: '#E67E22', label: 'Grenzwertig', hint: 'ab 3 Monaten' },
        red: { color: '#E74C3C', label: 'Überfällig', hint: 'ab 6 Monaten' },
        never: { color: '#7F8C8D', label: 'Nie gesehen', hint: 'kein gemeinsamer Instanz-Besuch protokolliert' }
    };
    const INACT_META = {
        active: { color: '#95A5A6', label: 'Aktiv', hint: 'unter 6 Monaten' },
        green: { color: '#2ECC71', label: 'Ruhig', hint: 'ab 6 Monaten inaktiv' },
        orange: { color: '#E67E22', label: 'Lange weg', hint: 'ab 9 Monaten inaktiv' },
        red: { color: '#E74C3C', label: 'Verschollen', hint: 'ab 12 Monaten inaktiv' },
        nodata: { color: '#7F8C8D', label: 'Keine Daten', hint: 'weder API- noch Feed-Daten vorhanden' }
    };

    const tab = ref('seen');
    const loading = ref(false);
    const search = ref('');
    const filterCat = ref(null);
    const sortBy = ref('date');
    const sortDir = ref(-1); // date: -1 = am längsten her zuerst
    const seenRows = ref([]);
    const inactRows = ref([]);
    const worldNames = ref(new Map()); // worldId -> name (DB first, API on demand)
    const resolving = ref(false);
    const resolveProgress = ref('');
    const stopResolving = ref(false);

    const rows = computed(() => (tab.value === 'seen' ? seenRows.value : inactRows.value));
    const metaMap = computed(() => (tab.value === 'seen' ? SEEN_META : INACT_META));
    const categories = computed(() =>
        Object.entries(metaMap.value).map(([key, m]) => ({ key, ...m }))
    );

    function catMeta(key) {
        return metaMap.value[key] || { color: '#888', label: key, hint: '' };
    }

    function rowColor(row) {
        return catMeta(row.category).color + '38'; // ~22 % Alpha
    }

    function countFor(key) {
        return rows.value.reduce((n, row) => (row.category === key ? n + 1 : n), 0);
    }

    function worldIdOf(location) {
        return (location || '').split(':')[0];
    }

    function worldLabel(location) {
        return worldNames.value.get(worldIdOf(location)) || location;
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

    const missingWorldCount = computed(() => {
        const missing = new Set();
        for (const row of seenRows.value) {
            const id = worldIdOf(row.location);
            if (id && !worldNames.value.has(id)) {
                missing.add(id);
            }
        }
        return missing.size;
    });

    /**
     * Resolve missing world names one by one through VRCX's request layer,
     * throttled to one API call per 1.5 s so we never hit rate limits.
     */
    async function resolveMissingWorlds() {
        const ctx = getCtx();
        const missing = [];
        const seen = new Set();
        for (const row of seenRows.value) {
            const id = worldIdOf(row.location);
            if (id && !worldNames.value.has(id) && !seen.has(id)) {
                seen.add(id);
                missing.push(id);
            }
        }
        if (missing.length === 0) {
            return;
        }
        resolving.value = true;
        stopResolving.value = false;
        try {
            for (let i = 0; i < missing.length; i++) {
                if (stopResolving.value) {
                    break;
                }
                resolveProgress.value = `${i + 1}/${missing.length}`;
                try {
                    const name = await ctx.api.getWorldName(missing[i]);
                    if (name) {
                        const next = new Map(worldNames.value);
                        next.set(missing[i], name);
                        worldNames.value = next;
                    }
                } catch (err) {
                    ctx.warn('world name lookup failed:', missing[i], err);
                }
                if (i < missing.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                }
            }
        } finally {
            resolving.value = false;
            resolveProgress.value = '';
        }
    }

    function sourceLabel(source) {
        if (source === 'api') {
            return 'VRChat-API (live)';
        }
        if (source === 'none') {
            return '—';
        }
        return `Feed (${source})`;
    }

    function formatDate(tsMs) {
        return new Date(tsMs).toLocaleDateString('de-AT', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    function formatAgo(days) {
        if (days == null) {
            return '';
        }
        if (days < 1) {
            return 'heute';
        }
        if (days < 60) {
            return `vor ${Math.floor(days)} Tagen`;
        }
        return `vor ${(days / 30.44).toFixed(1)} Monaten`;
    }

    async function refresh() {
        const ctx = getCtx();
        loading.value = true;
        try {
            const nowMs = Date.now();
            const friendStore = ctx.stores.friends;
            const friends = [];
            for (const [userId, friend] of friendStore.friends) {
                friends.push({
                    userId,
                    displayName: friend?.ref?.displayName || friend?.name || userId,
                    ref: friend?.ref || null
                });
            }

            // ---- Tab 1: last seen in shared instance -----------------------
            // world names known from own visits (no API calls needed)
            const dbNames = await getWorldNames(ctx);
            // keep names already resolved via API on top of the DB set
            for (const [id, name] of worldNames.value) {
                if (!dbNames.has(id)) {
                    dbNames.set(id, name);
                }
            }
            worldNames.value = dbNames;

            const gamelogRows = await getLastSeenRows(ctx);
            const seenHits = matchLastSeen(friends, gamelogRows);
            seenRows.value = friends.map((friend) => {
                const hit = seenHits.get(friend.userId);
                const tsMs = hit ? new Date(hit.lastDt).getTime() : null;
                const days = daysBetween(tsMs, nowMs);
                return {
                    userId: friend.userId,
                    displayName: friend.displayName,
                    tsMs,
                    days,
                    category: seenCategory(days),
                    location: hit?.location || ''
                };
            });

            // ---- Tab 2: inactivity ----------------------------------------
            const feedFallback = await getLastFeedActivity(ctx);
            inactRows.value = friends.map((friend) => {
                const { tsMs, source } = pickLastActive({
                    lastActivityIso: friend.ref?.last_activity,
                    lastLoginIso: friend.ref?.last_login,
                    feedFallbackIso: feedFallback.get(friend.userId)?.lastDt
                });
                const realSource =
                    source === 'feed' ? feedFallback.get(friend.userId)?.source : source;
                const days = daysBetween(tsMs, nowMs);
                return {
                    userId: friend.userId,
                    displayName: friend.displayName,
                    tsMs,
                    days,
                    category: inactivityCategory(days),
                    source: realSource || 'none'
                };
            });
        } catch (err) {
            getCtx().error('friend care refresh failed:', err);
        } finally {
            loading.value = false;
        }
    }

    const visibleRows = computed(() => {
        const q = search.value.trim().toLowerCase();
        let list = rows.value;
        if (q) {
            list = list.filter((row) => row.displayName.toLowerCase().includes(q));
        }
        if (filterCat.value) {
            list = list.filter((row) => row.category === filterCat.value);
        }
        const dir = sortDir.value;
        return [...list].sort((a, b) => {
            if (sortBy.value === 'name') {
                return a.displayName.localeCompare(b.displayName) * dir;
            }
            // date sort: rows without data always go to the end
            if (a.tsMs == null && b.tsMs == null) {
                return a.displayName.localeCompare(b.displayName);
            }
            if (a.tsMs == null) {
                return 1;
            }
            if (b.tsMs == null) {
                return -1;
            }
            return (b.tsMs - a.tsMs) * dir;
        });
    });

    function setTab(next) {
        tab.value = next;
        filterCat.value = null;
    }

    function setSort(key) {
        if (sortBy.value === key) {
            sortDir.value = -sortDir.value;
        } else {
            sortBy.value = key;
            sortDir.value = key === 'name' ? 1 : -1;
        }
    }

    function exportCsv() {
        const header =
            tab.value === 'seen'
                ? 'user_id;display_name;last_seen;days_ago;category;location;world_name'
                : 'user_id;display_name;last_active;days_ago;category;source';
        const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
        const lines = visibleRows.value.map((row) => {
            const cols = [
                row.userId,
                row.displayName,
                row.tsMs ? new Date(row.tsMs).toJSON() : '',
                row.days != null ? row.days.toFixed(1) : '',
                row.category
            ];
            if (tab.value === 'seen') {
                cols.push(row.location, worldNames.value.get(worldIdOf(row.location)) || '');
            } else {
                cols.push(row.source);
            }
            return cols.map(esc).join(';');
        });
        const blob = new Blob(['﻿' + [header, ...lines].join('\r\n')], {
            type: 'text/csv;charset=utf-8'
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `friend-care-${tab.value}-${new Date().toJSON().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    onMounted(refresh);
    onActivated(refresh);
</script>

<style scoped>
    .fc-seg {
        display: inline-flex;
        gap: 2px;
        padding: 2px;
        border: 1px solid var(--border, #4443);
        border-radius: 8px;
    }
    .fc-tab-btn {
        padding: 4px 10px;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--muted-foreground, #9f9fa5);
        cursor: pointer;
        font-size: 12px;
    }
    .fc-tab-btn--active {
        background: var(--accent, #3f3f46);
        color: var(--foreground, #fafafa);
        border-color: var(--border, #4443);
    }
    .fc-tool-btn {
        padding: 4px 10px;
        border: 1px solid var(--border, #4443);
        border-radius: 6px;
        background: transparent;
        color: var(--muted-foreground, #9f9fa5);
        cursor: pointer;
        font-size: 12px;
    }
    .fc-tool-btn:hover {
        color: var(--foreground, #fafafa);
    }
    .fc-scroll {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
    }
    .fc-table thead th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--background, #18181b);
    }
    .fc-search {
        padding: 4px 10px;
        border: 1px solid var(--border, #4443);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font-size: 12px;
        min-width: 160px;
    }
    .fc-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border: 1px solid var(--border, #4443);
        border-radius: 12px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 12px;
    }
    .fc-chip--active {
        border-color: var(--muted-foreground, #9f9fa5);
        background: var(--accent, #3f3f46);
        color: var(--foreground, #fafafa);
    }
    .fc-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
    }
    .fc-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }
    .fc-table th,
    .fc-table td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--border, #4442);
        text-align: left;
    }
    .fc-th-sort {
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
    }
    .fc-sort-arrow {
        font-size: 9px;
        margin-left: 3px;
    }
    .fc-badge {
        display: inline-block;
        padding: 1px 8px;
        border: 1px solid;
        border-radius: 10px;
        font-size: 11px;
        white-space: nowrap;
    }
    .fc-loc {
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.75;
        font-size: 12px;
    }
    .fc-world-link,
    .fc-name-link {
        cursor: pointer;
        text-decoration: none;
    }
    .fc-world-link:hover,
    .fc-name-link:hover {
        color: var(--foreground, #fafafa);
        text-decoration: underline;
    }
</style>
