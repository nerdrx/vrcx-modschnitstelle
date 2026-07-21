<template>
    <div class="x-container" style="padding: 16px; overflow-y: auto; height: 100%">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap">
            <h2 style="margin: 0; font-size: 18px; font-weight: 600">
                {{ t('mods.statustracker.nav.mod-status-tracker') }}
            </h2>
            <div style="display: flex; gap: 4px">
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
                v-model="search"
                :placeholder="searchPlaceholder"
                class="st-search"
                type="text" />
            <span v-if="loading" style="font-size: 12px; opacity: 0.6">…</span>
        </div>

        <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 12px; flex-wrap: wrap">
            <span v-for="s in legend" :key="s.key" style="display: inline-flex; align-items: center; gap: 5px">
                <span :style="{ background: s.color }" class="st-dot"></span>{{ s.label }}
            </span>
        </div>

        <table class="st-table">
            <thead>
                <tr>
                    <th style="text-align: left; min-width: 160px">Friend</th>
                    <th style="text-align: left; width: 40%">Verteilung</th>
                    <th v-for="s in legend" :key="s.key" style="text-align: right">
                        <span :style="{ background: s.color }" class="st-dot"></span>
                    </th>
                    <th style="text-align: right">Online gesamt</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in visibleRows" :key="row.userId">
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
</template>

<script setup>
    import { computed, onActivated, onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { computeStatusTotals, TRACKED_STATUSES, UNKNOWN_STATUS } from './engine';
    import { loadEvents } from './db';
    import { getCtx } from './runtime';

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

    const visibleRows = computed(() => {
        const q = search.value.trim().toLowerCase();
        if (!q) {
            return rows.value;
        }
        return rows.value.filter((row) => row.displayName.toLowerCase().includes(q));
    });

    function setRange(days) {
        rangeDays.value = days;
        refresh();
    }

    onMounted(refresh);
    onActivated(refresh);
</script>

<style scoped>
    .st-range-btn {
        padding: 4px 10px;
        border: 1px solid var(--border, #4443);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 12px;
    }
    .st-range-btn--active {
        background: var(--primary, #409eff);
        color: #fff;
        border-color: transparent;
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
