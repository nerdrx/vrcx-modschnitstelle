<template>
    <div class="x-container" style="padding: 16px; overflow-y: auto; height: 100%">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap">
            <h2 style="margin: 0; font-size: 18px; font-weight: 600">
                {{ t('mods.statustracker.nav.mod-status-tracker') }}
            </h2>
            <div class="st-seg">
                <button
                    class="st-range-btn"
                    :class="{ 'st-range-btn--active': view === 'times' }"
                    @click="view = 'times'">
                    Status-Zeiten
                </button>
                <button
                    class="st-range-btn"
                    :class="{ 'st-range-btn--active': view === 'instances' }"
                    @click="view = 'instances'">
                    Letzte Instanz
                </button>
            </div>
            <div v-if="view === 'times'" class="st-seg">
                <button
                    v-for="option in rangeOptions"
                    :key="option.days"
                    class="st-range-btn"
                    :class="{ 'st-range-btn--active': rangeDays === option.days }"
                    @click="setRange(option.days)">
                    {{ option.label }}
                </button>
            </div>
            <input
                v-if="view === 'times'"
                v-model="search"
                :placeholder="searchPlaceholder"
                class="st-search"
                type="text" />
            <span v-if="loading" style="font-size: 12px; opacity: 0.6">…</span>
        </div>

        <div
            v-if="view === 'times'"
            style="display: flex; gap: 8px; margin-bottom: 12px; font-size: 12px; flex-wrap: wrap; align-items: center">
            <button
                v-for="s in legend"
                :key="s.key"
                class="st-chip"
                :class="{ 'st-chip--active': selectedKeys.has(s.key) }"
                type="button"
                title="Klicken: nach diesem Status sortieren (Mehrfachauswahl möglich)"
                @click="toggleStatus(s.key)">
                <span :style="{ background: s.color }" class="st-dot"></span>{{ s.label }}
            </button>
            <button v-if="selectedKeys.size" class="st-chip st-chip--clear" type="button" @click="clearSelection">
                ✕ Zurücksetzen
            </button>
        </div>

        <div v-if="view === 'times'" class="st-scroll">
        <table class="st-table" style="min-width: 760px">
            <thead>
                <tr>
                    <th style="text-align: left; min-width: 160px">Friend</th>
                    <th style="text-align: left; width: 40%">Verteilung</th>
                    <th
                        v-for="s in legend"
                        :key="s.key"
                        class="st-th-sort"
                        :class="{ 'st-th-sort--active': sortKey === s.key }"
                        style="text-align: right"
                        :title="'Sortieren nach ' + s.label"
                        @click="setSort(s.key)">
                        <span :style="{ background: s.color }" class="st-dot"></span
                        ><span v-if="sortKey === s.key" class="st-sort-arrow">▼</span>
                    </th>
                    <th
                        class="st-th-sort"
                        :class="{ 'st-th-sort--active': sortKey === 'total' }"
                        style="text-align: right"
                        title="Sortieren nach Online gesamt"
                        @click="setSort('total')">
                        Online gesamt<span v-if="sortKey === 'total'" class="st-sort-arrow">▼</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in visibleRows" :key="row.userId" :class="{ 'st-row--dim': isDimmed(row) }">
                    <td>{{ row.displayName }}</td>
                    <td>
                        <div class="st-bar">
                            <div
                                v-for="seg in row.segments"
                                :key="seg.key"
                                :style="{ width: seg.percent + '%', background: seg.color }"
                                :title="seg.title"></div>
                        </div>
                    </td>
                    <td v-for="s in legend" :key="s.key" class="st-num">
                        {{ formatMs(row.totals[s.key]) }}
                    </td>
                    <td class="st-num" style="font-weight: 600">{{ formatMs(row.totals.totalOnlineMs) }}</td>
                </tr>
                <tr v-if="!loading && visibleRows.length === 0">
                    <td colspan="8" style="text-align: center; opacity: 0.6; padding: 24px">
                        Keine Daten im gewählten Zeitraum.
                    </td>
                </tr>
            </tbody>
        </table>
        </div>

        <LastInstanceSection v-if="view === 'instances'" />
    </div>
</template>

<script setup>
    import { computed, onActivated, onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { computeStatusTotals, TRACKED_STATUSES, UNKNOWN_STATUS } from './engine';
    import { loadEvents } from './db';
    import { getCtx } from './runtime';
    import LastInstanceSection from './LastInstanceSection.vue';

    const { t } = useI18n();

    const STATUS_META = {
        'join me': { color: '#42caff', label: 'Join Me (Blau)' },
        active: { color: '#51e57e', label: 'Active (Grün)' },
        'ask me': { color: '#e8a838', label: 'Ask Me (Gelb/Orange)' },
        busy: { color: '#e64a4a', label: 'Busy (Rot)' },
        [UNKNOWN_STATUS]: { color: '#8a8a8a', label: 'Unbekannt' }
    };
    const ALL_KEYS = [...TRACKED_STATUSES, UNKNOWN_STATUS];

    const legend = ALL_KEYS.map((key) => ({ key, ...STATUS_META[key] }));

    const rangeOptions = [
        { days: 7, label: '7 Tage' },
        { days: 30, label: '30 Tage' },
        { days: 90, label: '90 Tage' },
        { days: 365, label: '1 Jahr' }
    ];

    const view = ref('times');
    const rangeDays = ref(30);
    const loading = ref(false);
    const search = ref('');
    const rows = ref([]);
    const searchPlaceholder = 'Suche…';

    function formatMs(ms) {
        if (!ms || ms < 1000) {
            return '–';
        }
        const totalMinutes = Math.floor(ms / 60000);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        if (h >= 24) {
            const d = Math.floor(h / 24);
            return `${d}d ${h % 24}h`;
        }
        if (h > 0) {
            return `${h}h ${m}m`;
        }
        return `${m}m`;
    }

    async function refresh() {
        const ctx = getCtx();
        loading.value = true;
        try {
            const rangeEndMs = Date.now();
            const rangeStartMs = rangeEndMs - rangeDays.value * 86400000;
            // load a little more history so the initial state is known
            const sinceIso = new Date(rangeStartMs - 30 * 86400000).toJSON();
            const { statusEvents, presenceEvents, snapshots, names } = await loadEvents(ctx, sinceIso);
            const totalsByUser = computeStatusTotals({
                statusEvents,
                presenceEvents,
                snapshots,
                rangeStartMs,
                rangeEndMs
            });

            const friendStore = ctx.stores.friends;
            const list = [];
            for (const [userId, totals] of totalsByUser) {
                const displayName =
                    friendStore.friends.get(userId)?.ref?.displayName || names.get(userId) || userId;
                const segments = ALL_KEYS.filter((key) => totals[key] > 0).map((key) => ({
                    key,
                    color: STATUS_META[key].color,
                    percent: (totals[key] / totals.totalOnlineMs) * 100,
                    title: `${STATUS_META[key].label}: ${formatMs(totals[key])}`
                }));
                list.push({ userId, displayName, totals, segments });
            }
            list.sort((a, b) => b.totals.totalOnlineMs - a.totals.totalOnlineMs);
            rows.value = list;
        } catch (err) {
            getCtx().error('refresh failed:', err);
        } finally {
            loading.value = false;
        }
    }

    const selectedKeys = ref(new Set());

    function toggleStatus(key) {
        const next = new Set(selectedKeys.value);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        selectedKeys.value = next;
    }

    function clearSelection() {
        selectedKeys.value = new Set();
    }

    function selectedTotal(row) {
        let sum = 0;
        for (const key of selectedKeys.value) {
            sum += row.totals[key] || 0;
        }
        return sum;
    }

    function isDimmed(row) {
        return selectedKeys.value.size > 0 && selectedTotal(row) === 0;
    }

    const sortKey = ref('total');

    function setSort(key) {
        sortKey.value = key;
    }

    const visibleRows = computed(() => {
        const q = search.value.trim().toLowerCase();
        let list = rows.value;
        if (q) {
            list = list.filter((row) => row.displayName.toLowerCase().includes(q));
        }
        if (sortKey.value !== 'total') {
            const key = sortKey.value;
            list = [...list].sort(
                (a, b) =>
                    (b.totals[key] || 0) - (a.totals[key] || 0) ||
                    b.totals.totalOnlineMs - a.totals.totalOnlineMs
            );
        } else if (selectedKeys.value.size > 0) {
            list = [...list].sort(
                (a, b) =>
                    selectedTotal(b) - selectedTotal(a) ||
                    b.totals.totalOnlineMs - a.totals.totalOnlineMs
            );
        }
        return list;
    });

    function setRange(days) {
        rangeDays.value = days;
        refresh();
    }

    onMounted(refresh);
    onActivated(refresh);
</script>

<style scoped>
    .st-seg {
        display: inline-flex;
        gap: 2px;
        padding: 2px;
        border: 1px solid var(--border, #4443);
        border-radius: 8px;
    }
    .st-range-btn {
        padding: 4px 10px;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--muted-foreground, #9f9fa5);
        cursor: pointer;
        font-size: 12px;
    }
    .st-range-btn--active {
        background: var(--accent, #3f3f46);
        color: var(--foreground, #fafafa);
        border-color: var(--border, #4443);
    }
    .st-scroll {
        overflow-x: auto;
    }
    .st-search {
        padding: 4px 10px;
        border: 1px solid var(--border, #4443);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font-size: 12px;
        min-width: 160px;
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
    .st-row--dim {
        opacity: 0.35;
    }
    .st-th-sort {
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
    }
    .st-th-sort--active {
        color: var(--foreground, #fafafa);
        text-decoration: underline;
    }
    .st-sort-arrow {
        font-size: 9px;
        margin-left: 3px;
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
    .st-num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .st-bar {
        display: flex;
        height: 12px;
        border-radius: 6px;
        overflow: hidden;
        background: #4441;
        min-width: 120px;
    }
</style>
