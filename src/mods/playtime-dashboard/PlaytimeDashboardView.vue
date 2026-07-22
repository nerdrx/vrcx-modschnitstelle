<template>
    <div class="pt-container">
        <!-- Top Control & Header Bar -->
        <header class="pt-header">
            <div class="pt-title-group">
                <div class="pt-icon-badge">
                    <i class="ri-dashboard-3-line"></i>
                </div>
                <div>
                    <h2 class="pt-title">
                        {{ t('mods.playtimedashboard.nav.mod-playtime-dashboard', 'Spielzeit-Dashboard') }}
                    </h2>
                    <p class="pt-subtitle">VRChat Playtime Analytics & Session Overview</p>
                </div>
            </div>

            <div class="pt-header-actions">
                <!-- Time Range Segmented Control -->
                <div class="pt-seg">
                    <button
                        v-for="opt in rangeOptions"
                        :key="opt.days"
                        class="pt-seg-btn"
                        :class="{ 'pt-seg-btn--active': rangeDays === opt.days }"
                        @click="setRange(opt.days)">
                        {{ opt.label }}
                    </button>
                </div>

                <div class="pt-action-btns">
                    <button class="pt-btn" title="Neu laden" @click="refresh">
                        <i class="ri-refresh-line" :class="{ 'spin-icon': loading }"></i>
                        <span>Aktualisieren</span>
                    </button>

                    <button class="pt-btn pt-btn--primary" title="Als CSV exportieren" @click="exportCsv">
                        <i class="ri-download-2-line"></i>
                        <span>CSV Export</span>
                    </button>
                </div>
            </div>
        </header>

        <!-- KPI Metric Glass Cards Grid -->
        <div class="pt-kpi-grid">
            <!-- Total Playtime Card -->
            <div class="pt-kpi-card pt-kpi-card--violet">
                <div class="pt-kpi-header">
                    <span class="pt-kpi-title">Gesamte Spielzeit</span>
                    <div class="pt-kpi-icon"><i class="ri-time-line"></i></div>
                </div>
                <div class="pt-kpi-value">{{ metrics.formattedTotalPlaytime }}</div>
                <div class="pt-kpi-footer">
                    <span class="pt-badge pt-badge--violet">{{ rangeLabel }}</span>
                    <span class="pt-kpi-subtext">Aus {{ metrics.sessionCount }} Sitzungen</span>
                </div>
            </div>

            <!-- Today's Playtime Card -->
            <div class="pt-kpi-card pt-kpi-card--emerald">
                <div class="pt-kpi-header">
                    <span class="pt-kpi-title">Heute gespielt</span>
                    <div class="pt-kpi-icon"><i class="ri-calendar-check-line"></i></div>
                </div>
                <div class="pt-kpi-value">{{ metrics.formattedTodayPlaytime }}</div>
                <div class="pt-kpi-footer">
                    <span class="pt-badge pt-badge--emerald">Heute</span>
                    <span class="pt-kpi-subtext">Seit 00:00 Uhr</span>
                </div>
            </div>

            <!-- Average Session Card -->
            <div class="pt-kpi-card pt-kpi-card--cyan">
                <div class="pt-kpi-header">
                    <span class="pt-kpi-title">Ø Sitzungsdauer</span>
                    <div class="pt-kpi-icon"><i class="ri-timer-flash-line"></i></div>
                </div>
                <div class="pt-kpi-value">{{ metrics.formattedAvgSession }}</div>
                <div class="pt-kpi-footer">
                    <span class="pt-badge pt-badge--cyan">Durchschnitt</span>
                    <span class="pt-kpi-subtext">Pro Session</span>
                </div>
            </div>

            <!-- Longest Session Card -->
            <div class="pt-kpi-card pt-kpi-card--amber">
                <div class="pt-kpi-header">
                    <span class="pt-kpi-title">Längste Session</span>
                    <div class="pt-kpi-icon"><i class="ri-trophy-line"></i></div>
                </div>
                <div class="pt-kpi-value">{{ metrics.formattedLongestSession }}</div>
                <div class="pt-kpi-footer">
                    <span class="pt-badge pt-badge--amber">Rekord</span>
                    <span class="pt-kpi-subtext">Maximale am Stück</span>
                </div>
            </div>

            <!-- Top World Card -->
            <div class="pt-kpi-card pt-kpi-card--rose">
                <div class="pt-kpi-header">
                    <span class="pt-kpi-title">Meistbesuchte Welt</span>
                    <div class="pt-kpi-icon"><i class="ri-earth-line"></i></div>
                </div>
                <div class="pt-kpi-value pt-kpi-value--small">
                    {{ topWorldName }}
                </div>
                <div class="pt-kpi-footer">
                    <span class="pt-badge pt-badge--rose">{{ topWorldVisits }} Besuche</span>
                    <span class="pt-kpi-subtext">{{ topWorldTime }}</span>
                </div>
            </div>
        </div>

        <!-- Navigation Tabs for Detailed Views -->
        <div class="pt-tab-nav">
            <div class="pt-tabs">
                <button
                    class="pt-tab-btn"
                    :class="{ 'pt-tab-btn--active': activeTab === 'trend' }"
                    @click="activeTab = 'trend'">
                    <i class="ri-bar-chart-grouped-line"></i>
                    <span>Tägliche Trends</span>
                </button>

                <button
                    class="pt-tab-btn"
                    :class="{ 'pt-tab-btn--active': activeTab === 'hourly' }"
                    @click="activeTab = 'hourly'">
                    <i class="ri-history-line"></i>
                    <span>Stunden-Aktivität (24h)</span>
                </button>

                <button
                    class="pt-tab-btn"
                    :class="{ 'pt-tab-btn--active': activeTab === 'worlds' }"
                    @click="activeTab = 'worlds'">
                    <i class="ri-planet-line"></i>
                    <span>Beliebte Welten ({{ metrics.topLocations.length }})</span>
                </button>

                <button
                    class="pt-tab-btn"
                    :class="{ 'pt-tab-btn--active': activeTab === 'sessions' }"
                    @click="activeTab = 'sessions'">
                    <i class="ri-list-check-3"></i>
                    <span>Sitzungsprotokoll ({{ metrics.sessions.length }})</span>
                </button>
            </div>

            <div v-if="activeTab === 'worlds' || activeTab === 'sessions'" class="pt-search-box">
                <i class="ri-search-line search-icon"></i>
                <input v-model="searchQuery" type="text" placeholder="Filtern..." class="pt-input" />
            </div>
        </div>

        <!-- Main Content Area -->
        <div class="pt-scroll-content">
            <!-- TAB 1: Daily Trends Bar Chart -->
            <div v-if="activeTab === 'trend'" class="pt-glass-panel">
                <div class="pt-panel-header">
                    <h3 class="pt-panel-title">
                        <i class="ri-bar-chart-2-line"></i> Spielzeitverlauf pro Tag
                    </h3>
                    <span class="pt-panel-hint">Hover über die Balken für Details</span>
                </div>

                <div v-if="metrics.dailyTrends.length === 0" class="pt-empty-state">
                    Keine Spielzeit-Daten im gewählten Zeitraum vorhanden.
                </div>

                <div v-else class="pt-chart-container">
                    <div class="pt-bar-chart">
                        <div
                            v-for="item in metrics.dailyTrends"
                            :key="item.date"
                            class="pt-bar-col">
                            <div class="pt-bar-wrapper">
                                <div
                                    class="pt-bar-fill"
                                    :style="{ height: getBarHeight(item.playtimeMs) + '%' }"
                                    :title="item.dateLabel + ': ' + item.formattedTime">
                                    <span v-if="item.playtimeMs > 0" class="pt-bar-tooltip">
                                        {{ item.dateLabel }}<br /><strong>{{ item.formattedTime }}</strong>
                                    </span>
                                </div>
                            </div>
                            <span class="pt-bar-label">{{ item.dateLabel }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB 2: Hourly Activity Heatmap (24h) -->
            <div v-if="activeTab === 'hourly'" class="pt-glass-panel">
                <div class="pt-panel-header">
                    <h3 class="pt-panel-title">
                        <i class="ri-time-zone-line"></i> Aktivitätsverteilung nach Tageszeit (00:00 – 23:00 Uhr)
                    </h3>
                    <span class="pt-panel-hint">Zeigt, zu welchen Uhrzeiten am häufigsten gespielt wird</span>
                </div>

                <div class="pt-hourly-grid">
                    <div
                        v-for="item in metrics.hourlyDistribution"
                        :key="item.hour"
                        class="pt-hourly-card"
                        :style="{ '--intensity': item.percent + '%' }">
                        <div class="pt-hourly-time">{{ item.hourLabel }}</div>
                        <div class="pt-hourly-bar-bg">
                            <div class="pt-hourly-bar-inner" :style="{ width: item.percent + '%' }"></div>
                        </div>
                        <div class="pt-hourly-val">{{ item.formattedTime }}</div>
                    </div>
                </div>
            </div>

            <!-- TAB 3: Top Worlds Table -->
            <div v-if="activeTab === 'worlds'" class="pt-glass-panel">
                <div class="pt-panel-header">
                    <h3 class="pt-panel-title">
                        <i class="ri-global-line"></i> Besuchte Welten & Aufenthaltsdauer
                    </h3>
                </div>

                <div class="pt-table-wrapper">
                    <table class="pt-table">
                        <thead>
                            <tr>
                                <th style="width: 40px">#</th>
                                <th>Weltname</th>
                                <th>Location Tag</th>
                                <th style="text-align: right">Besuche</th>
                                <th style="text-align: right">Geschätzte Zeit</th>
                                <th style="width: 140px; text-align: center">Aktion</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(world, index) in filteredWorlds" :key="world.worldId + index">
                                <td class="pt-col-rank">
                                    <span class="pt-rank-badge" :class="'pt-rank-' + (index + 1)">
                                        {{ index + 1 }}
                                    </span>
                                </td>
                                <td>
                                    <span class="pt-world-name">{{ world.worldName }}</span>
                                </td>
                                <td>
                                    <code class="pt-tag">{{ world.location || world.worldId }}</code>
                                </td>
                                <td style="text-align: right; font-weight: 600">
                                    {{ world.visitCount }}x
                                </td>
                                <td style="text-align: right">
                                    <span class="pt-time-chip">{{ world.formattedTime }}</span>
                                </td>
                                <td style="text-align: center">
                                    <button
                                        class="pt-link-btn"
                                        title="Welt-Dialog in VRCX öffnen"
                                        @click="openWorldDialog(world.location)">
                                        <i class="ri-external-link-line"></i> Öffnen
                                    </button>
                                </td>
                            </tr>

                            <tr v-if="filteredWorlds.length === 0">
                                <td colspan="6" class="pt-empty-table">
                                    Keine passenden Welten gefunden.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- TAB 4: Sessions Log Table -->
            <div v-if="activeTab === 'sessions'" class="pt-glass-panel">
                <div class="pt-panel-header">
                    <h3 class="pt-panel-title">
                        <i class="ri-history-fill"></i> Sitzungsverlauf
                    </h3>
                </div>

                <div class="pt-table-wrapper">
                    <table class="pt-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Startzeit</th>
                                <th>Endzeit</th>
                                <th style="text-align: right">Dauer</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(s, idx) in filteredSessions" :key="s.startMs + '-' + idx">
                                <td>
                                    <span
                                        class="pt-status-pill"
                                        :class="s.isOngoing ? 'pt-status--active' : 'pt-status--completed'">
                                        <span class="pt-status-dot"></span>
                                        {{ s.isOngoing ? 'Online (Aktiv)' : 'Beendet' }}
                                    </span>
                                </td>
                                <td>{{ formatDateTime(s.startMs) }}</td>
                                <td>{{ s.isOngoing ? 'Jetzt' : formatDateTime(s.endMs) }}</td>
                                <td style="text-align: right; font-weight: 600">
                                    {{ formatDuration(s.durationMs) }}
                                </td>
                            </tr>

                            <tr v-if="filteredSessions.length === 0">
                                <td colspan="4" class="pt-empty-table">
                                    Keine Sitzungen im Protokoll gefunden.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, onActivated, onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { getGpsLogs, getOnlineOfflineLogs, getWorldNames } from './db';
    import { computePlaytimeMetrics, formatDuration } from './engine';
    import { getCtx } from './runtime';

    // Internationalization helper with fallback
    let t = (key, fallback) => fallback;
    try {
        const i18n = useI18n();
        if (i18n && i18n.t) {
            t = i18n.t;
        }
    } catch {
        // use fallback string
    }

    const rangeOptions = [
        { days: 7, label: '7 Tage' },
        { days: 30, label: '30 Tage' },
        { days: 90, label: '90 Tage' },
        { days: 365, label: '1 Jahr' },
        { days: 0, label: 'Gesamt' }
    ];

    const rangeDays = ref(30);
    const activeTab = ref('trend');
    const loading = ref(false);
    const searchQuery = ref('');

    const rawLogs = ref({
        onlineOffline: [],
        gps: [],
        worldNames: new Map()
    });

    const metrics = computed(() => {
        return computePlaytimeMetrics({
            onlineOfflineLogs: rawLogs.value.onlineOffline,
            gpsLogs: rawLogs.value.gps,
            worldNames: rawLogs.value.worldNames,
            rangeDays: rangeDays.value,
            nowMs: Date.now()
        });
    });

    const rangeLabel = computed(() => {
        const opt = rangeOptions.find((o) => o.days === rangeDays.value);
        return opt ? opt.label : 'Zeitraum';
    });

    const topWorldName = computed(() => {
        const top = metrics.value.topLocations[0];
        return top ? top.worldName : '—';
    });

    const topWorldVisits = computed(() => {
        const top = metrics.value.topLocations[0];
        return top ? top.visitCount : 0;
    });

    const topWorldTime = computed(() => {
        const top = metrics.value.topLocations[0];
        return top ? top.formattedTime : '0m';
    });

    const filteredWorlds = computed(() => {
        const q = searchQuery.value.trim().toLowerCase();
        if (!q) {
            return metrics.value.topLocations;
        }
        return metrics.value.topLocations.filter(
            (w) =>
                w.worldName.toLowerCase().includes(q) ||
                (w.location && w.location.toLowerCase().includes(q))
        );
    });

    const filteredSessions = computed(() => {
        const q = searchQuery.value.trim().toLowerCase();
        if (!q) {
            return metrics.value.sessions;
        }
        return metrics.value.sessions.filter((s) => {
            const startStr = formatDateTime(s.startMs).toLowerCase();
            return startStr.includes(q);
        });
    });

    function maxTrendMs() {
        const trends = metrics.value.dailyTrends;
        if (!trends || trends.length === 0) return 1;
        return Math.max(...trends.map((t) => t.playtimeMs), 1);
    }

    function getBarHeight(playtimeMs) {
        if (!playtimeMs || playtimeMs <= 0) return 0;
        const max = maxTrendMs();
        return Math.min(100, Math.max(6, Math.round((playtimeMs / max) * 100)));
    }

    function setRange(days) {
        rangeDays.value = days;
    }

    function formatDateTime(tsMs) {
        if (!tsMs) return '—';
        return new Date(tsMs).toLocaleString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function openWorldDialog(location) {
        try {
            getCtx().ui.showWorldDialog(location);
        } catch (err) {
            console.error('[playtime-dashboard] openWorldDialog failed:', err);
        }
    }

    async function refresh() {
        loading.value = true;
        try {
            const ctx = getCtx();
            const [onlineOffline, gps, worldNamesMap] = await Promise.all([
                getOnlineOfflineLogs(ctx, 3000),
                getGpsLogs(ctx, 3000),
                getWorldNames(ctx)
            ]);

            rawLogs.value = {
                onlineOffline,
                gps,
                worldNames: worldNamesMap
            };
        } catch (err) {
            console.error('[playtime-dashboard] refresh failed:', err);
        } finally {
            loading.value = false;
        }
    }

    function exportCsv() {
        const header = 'start_time;end_time;duration_ms;duration_formatted;status';
        const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
        const lines = metrics.value.sessions.map((s) =>
            [
                new Date(s.startMs).toISOString(),
                s.isOngoing ? 'ONGOING' : new Date(s.endMs).toISOString(),
                s.durationMs,
                formatDuration(s.durationMs),
                s.isOngoing ? 'Online' : 'Completed'
            ]
                .map(esc)
                .join(';')
        );

        const blob = new Blob(['\uFEFF' + [header, ...lines].join('\r\n')], {
            type: 'text/csv;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vrchat-playtime-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    onMounted(refresh);
    onActivated(refresh);
</script>

<style scoped>
    .pt-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 20px;
        box-sizing: border-box;
        overflow: hidden;
        background: radial-gradient(circle at 10% 20%, rgba(30, 27, 75, 0.4) 0%, transparent 50%),
                    radial-gradient(circle at 90% 80%, rgba(15, 23, 42, 0.6) 0%, transparent 50%);
        color: var(--foreground, #f8fafc);
        font-family: inherit;
    }

    /* Header Styling */
    .pt-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        flex-wrap: wrap;
        gap: 16px;
    }

    .pt-title-group {
        display: flex;
        align-items: center;
        gap: 14px;
    }

    .pt-icon-badge {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: linear-gradient(135deg, #8b5cf6, #3b82f6);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: #ffffff;
        box-shadow: 0 4px 20px rgba(139, 92, 246, 0.35);
    }

    .pt-title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .pt-subtitle {
        margin: 2px 0 0 0;
        font-size: 12px;
        color: #94a3b8;
    }

    .pt-header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }

    /* Segmented Control */
    .pt-seg {
        display: inline-flex;
        padding: 3px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        backdrop-filter: blur(12px);
    }

    .pt-seg-btn {
        padding: 6px 14px;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .pt-seg-btn:hover {
        color: #f1f5f9;
    }

    .pt-seg-btn--active {
        background: linear-gradient(135deg, #6366f1, #4f46e5);
        color: #ffffff;
        font-weight: 600;
        box-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);
    }

    /* Action Buttons */
    .pt-action-btns {
        display: flex;
        gap: 8px;
    }

    .pt-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(30, 41, 59, 0.6);
        color: #e2e8f0;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        backdrop-filter: blur(12px);
        transition: all 0.2s ease;
    }

    .pt-btn:hover {
        background: rgba(51, 65, 85, 0.8);
        border-color: rgba(255, 255, 255, 0.2);
        color: #ffffff;
    }

    .pt-btn--primary {
        background: linear-gradient(135deg, #10b981, #059669);
        border: none;
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.25);
    }

    .pt-btn--primary:hover {
        background: linear-gradient(135deg, #34d399, #10b981);
    }

    .spin-icon {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    /* KPI Grid */
    .pt-kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 14px;
        margin-bottom: 20px;
    }

    .pt-kpi-card {
        padding: 16px;
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(16px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .pt-kpi-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
    }

    .pt-kpi-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .pt-kpi-title {
        font-size: 12px;
        font-weight: 500;
        color: #94a3b8;
    }

    .pt-kpi-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
    }

    .pt-kpi-value {
        font-size: 22px;
        font-weight: 700;
        color: #f8fafc;
        margin-bottom: 12px;
        letter-spacing: -0.5px;
    }

    .pt-kpi-value--small {
        font-size: 15px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .pt-kpi-footer {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .pt-kpi-subtext {
        font-size: 11px;
        color: #64748b;
    }

    /* KPI Card Themes */
    .pt-kpi-card--violet .pt-kpi-icon { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .pt-badge--violet { background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.3); }

    .pt-kpi-card--emerald .pt-kpi-icon { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .pt-badge--emerald { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3); }

    .pt-kpi-card--cyan .pt-kpi-icon { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }
    .pt-badge--cyan { background: rgba(6, 182, 212, 0.2); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.3); }

    .pt-kpi-card--amber .pt-kpi-icon { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .pt-badge--amber { background: rgba(245, 158, 11, 0.2); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.3); }

    .pt-kpi-card--rose .pt-kpi-icon { background: rgba(244, 63, 94, 0.15); color: #fb7185; }
    .pt-badge--rose { background: rgba(244, 63, 94, 0.2); color: #fca5a5; border: 1px solid rgba(244, 63, 94, 0.3); }

    .pt-badge {
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 600;
    }

    /* Tabs Navigation */
    .pt-tab-nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
        gap: 12px;
        flex-wrap: wrap;
    }

    .pt-tabs {
        display: flex;
        gap: 6px;
    }

    .pt-tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 8px;
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .pt-tab-btn:hover {
        color: #f1f5f9;
        background: rgba(30, 41, 59, 0.7);
    }

    .pt-tab-btn--active {
        background: rgba(99, 102, 241, 0.2);
        border-color: rgba(99, 102, 241, 0.4);
        color: #818cf8;
        font-weight: 600;
    }

    .pt-search-box {
        position: relative;
        min-width: 200px;
    }

    .search-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: #64748b;
        font-size: 14px;
    }

    .pt-input {
        width: 100%;
        padding: 6px 12px 6px 32px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #f8fafc;
        font-size: 12px;
        outline: none;
        box-sizing: border-box;
    }

    .pt-input:focus {
        border-color: #6366f1;
    }

    /* Scrollable Content Panels */
    .pt-scroll-content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .pt-glass-panel {
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 20px;
        backdrop-filter: blur(16px);
    }

    .pt-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }

    .pt-panel-title {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: #f1f5f9;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .pt-panel-hint {
        font-size: 11px;
        color: #64748b;
    }

    /* Bar Chart Visuals */
    .pt-chart-container {
        height: 260px;
        display: flex;
        align-items: flex-end;
        padding-top: 20px;
    }

    .pt-bar-chart {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: flex-end;
        gap: 6px;
        overflow-x: auto;
        padding-bottom: 24px;
        position: relative;
    }

    .pt-bar-col {
        flex: 1;
        min-width: 22px;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        position: relative;
    }

    .pt-bar-wrapper {
        width: 100%;
        height: calc(100% - 24px);
        display: flex;
        align-items: flex-end;
        justify-content: center;
    }

    .pt-bar-fill {
        width: 80%;
        max-width: 28px;
        background: linear-gradient(180deg, #818cf8 0%, #4f46e5 100%);
        border-radius: 6px 6px 2px 2px;
        transition: height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        cursor: pointer;
    }

    .pt-bar-fill:hover {
        background: linear-gradient(180deg, #a5b4fc 0%, #6366f1 100%);
        box-shadow: 0 0 16px rgba(99, 102, 241, 0.6);
    }

    .pt-bar-tooltip {
        position: absolute;
        bottom: 105%;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 11px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 4px 14px rgba(0,0,0,0.4);
        z-index: 10;
        color: #e2e8f0;
    }

    .pt-bar-label {
        position: absolute;
        bottom: 0;
        font-size: 10px;
        color: #64748b;
        white-space: nowrap;
    }

    /* Hourly Grid */
    .pt-hourly-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 10px;
    }

    .pt-hourly-card {
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 10px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .pt-hourly-time {
        font-size: 12px;
        font-weight: 600;
        color: #94a3b8;
    }

    .pt-hourly-bar-bg {
        height: 6px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 3px;
        overflow: hidden;
    }

    .pt-hourly-bar-inner {
        height: 100%;
        background: linear-gradient(90deg, #ec4899, #8b5cf6);
        border-radius: 3px;
    }

    .pt-hourly-val {
        font-size: 11px;
        color: #cbd5e1;
        font-weight: 500;
    }

    /* Tables */
    .pt-table-wrapper {
        overflow-x: auto;
    }

    .pt-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        text-align: left;
    }

    .pt-table th {
        padding: 10px 12px;
        color: #94a3b8;
        font-weight: 600;
        font-size: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .pt-table td {
        padding: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        color: #e2e8f0;
    }

    .pt-table tr:hover td {
        background: rgba(255, 255, 255, 0.02);
    }

    .pt-world-name {
        font-weight: 600;
        color: #f8fafc;
    }

    .pt-tag {
        font-family: monospace;
        font-size: 11px;
        background: rgba(0, 0, 0, 0.3);
        padding: 2px 6px;
        border-radius: 4px;
        color: #a78bfa;
    }

    .pt-time-chip {
        background: rgba(99, 102, 241, 0.15);
        color: #a5b4fc;
        padding: 3px 8px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 600;
    }

    .pt-link-btn {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #94a3b8;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .pt-link-btn:hover {
        background: #6366f1;
        color: #ffffff;
        border-color: #6366f1;
    }

    .pt-rank-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        font-size: 11px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.1);
        color: #94a3b8;
    }

    .pt-rank-1 { background: #f59e0b; color: #000; }
    .pt-rank-2 { background: #94a3b8; color: #000; }
    .pt-rank-3 { background: #b45309; color: #fff; }

    /* Status Pills */
    .pt-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
    }

    .pt-status--active {
        background: rgba(16, 185, 129, 0.2);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .pt-status--completed {
        background: rgba(148, 163, 184, 0.15);
        color: #94a3b8;
        border: 1px solid rgba(148, 163, 184, 0.2);
    }

    .pt-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
    }

    .pt-status--active .pt-status-dot {
        box-shadow: 0 0 8px #34d399;
        animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
    }

    .pt-empty-state, .pt-empty-table {
        text-align: center;
        padding: 40px;
        color: #64748b;
        font-size: 13px;
    }
</style>
