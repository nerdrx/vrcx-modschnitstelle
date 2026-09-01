<template>
    <div ref="containerRef" class="og-container" :class="{ 'og-container--fullscreen': isFullscreen }">
        <!-- Ambient glass background highlights -->
        <div class="og-bg-glow og-bg-glow--1"></div>
        <div class="og-bg-glow og-bg-glow--2"></div>

        <!-- Header -->
        <header class="og-header">
            <div class="og-title-group">
                <div class="og-icon-badge">
                    <i class="ri-node-tree"></i>
                </div>
                <div>
                    <h2 class="og-title">{{ t('mods.orbitgraph.nav.mod-orbit-graph') }}</h2>
                    <p class="og-subtitle">{{ L.subtitle }}</p>
                </div>
            </div>

            <div class="og-header-controls">
                <div class="og-search-box">
                    <i class="ri-search-line og-search-icon"></i>
                    <input v-model="search" type="text" :placeholder="L.searchPlaceholder" class="og-search-input" />
                    <button v-if="search" class="og-search-clear" @click="search = ''">
                        <i class="ri-close-line"></i>
                    </button>
                </div>

                <button class="og-btn og-btn--primary" :disabled="loading" :title="L.refreshHint" @click="reload">
                    <i :class="loading ? 'ri-loader-4-line og-spin' : 'ri-refresh-line'"></i>
                    <span>{{ loading ? L.computing : L.refresh }}</span>
                </button>

                <button class="og-btn" :title="L.fullscreen" @click="toggleFullscreen">
                    <i :class="isFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'"></i>
                </button>
            </div>
        </header>

        <!-- Filter bar -->
        <div class="og-filters">
            <div class="og-filter">
                <span class="og-filter-label">{{ L.range }}</span>
                <div class="og-seg">
                    <button
                        v-for="opt in RANGE_OPTIONS"
                        :key="opt.key"
                        class="og-seg-btn"
                        :class="{ 'og-seg-btn--active': filters.rangeDays === opt.days }"
                        @click="filters.rangeDays = opt.days">
                        {{ L.ranges[opt.key] }}
                    </button>
                </div>
            </div>

            <div class="og-filter">
                <span class="og-filter-label">{{ L.minShared }}</span>
                <select v-model.number="filters.minSharedMinutes" class="og-select">
                    <option v-for="opt in MIN_SHARED_OPTIONS" :key="opt" :value="opt">
                        {{ opt === 0 ? L.noLimit : formatHours(opt * 60) }}
                    </option>
                </select>
            </div>

            <div class="og-filter">
                <span class="og-filter-label">{{ L.topN }}</span>
                <select v-model.number="filters.topN" class="og-select">
                    <option v-for="opt in TOP_N_OPTIONS" :key="opt" :value="opt">
                        {{ opt === 0 ? L.noLimit : opt }}
                    </option>
                </select>
            </div>

            <button
                class="og-btn"
                :class="{ 'og-btn--active': filters.friendsOnly }"
                :title="L.friendsOnlyHint"
                @click="filters.friendsOnly = !filters.friendsOnly">
                <i :class="filters.friendsOnly ? 'ri-heart-3-fill' : 'ri-heart-3-line'"></i>
                <span>{{ L.friendsOnly }}</span>
            </button>

            <span v-if="computedAt" class="og-stamp">{{ L.computedAt }} {{ computedAt }}</span>
        </div>

        <!-- KPI ribbon -->
        <div class="og-kpi-grid">
            <div class="og-kpi-card og-kpi-card--rose">
                <div class="og-kpi-header">
                    <span>{{ L.kpiPeople }}</span>
                    <i class="ri-group-line"></i>
                </div>
                <div class="og-kpi-value">{{ stats.peopleTotal }}</div>
                <div class="og-kpi-subtext">{{ stats.peopleShown }} {{ L.kpiShown }}</div>
            </div>

            <div class="og-kpi-card og-kpi-card--violet">
                <div class="og-kpi-header">
                    <span>{{ L.kpiFriends }}</span>
                    <i class="ri-heart-3-line"></i>
                </div>
                <div class="og-kpi-value">{{ stats.friendsShown }}</div>
                <div class="og-kpi-subtext">{{ L.kpiFriendsSub }}</div>
            </div>

            <div class="og-kpi-card og-kpi-card--cyan">
                <div class="og-kpi-header">
                    <span>{{ L.kpiOthers }}</span>
                    <i class="ri-user-search-line"></i>
                </div>
                <div class="og-kpi-value">{{ stats.othersShown }}</div>
                <div class="og-kpi-subtext">{{ L.kpiOthersSub }}</div>
            </div>

            <div class="og-kpi-card og-kpi-card--amber">
                <div class="og-kpi-header">
                    <span>{{ L.kpiEdges }}</span>
                    <i class="ri-links-line"></i>
                </div>
                <div class="og-kpi-value">{{ stats.edgesShown }}</div>
                <div class="og-kpi-subtext">{{ L.kpiEdgesSub }}</div>
            </div>

            <div class="og-kpi-card og-kpi-card--emerald">
                <div class="og-kpi-header">
                    <span>{{ L.kpiTime }}</span>
                    <i class="ri-time-line"></i>
                </div>
                <div class="og-kpi-value">{{ formatHours(stats.secondsInGame) }}</div>
                <div class="og-kpi-subtext">{{ stats.windows }} {{ L.kpiVisits }}</div>
            </div>
        </div>

        <!-- Viewport -->
        <div class="og-viewport">
            <div class="og-legend">
                <span v-for="cat in CATEGORIES" :key="cat.name" class="og-legend-item">
                    <span class="og-dot" :style="{ background: cat.color }"></span>
                    {{ L.categories[cat.name] }}
                </span>
                <span class="og-legend-hint">{{ L.legendHint }}</span>
            </div>

            <div class="og-toolbar">
                <button class="og-tool-btn" :title="L.zoomIn" @click="zoomGraph(1.25)">
                    <i class="ri-add-line"></i>
                </button>
                <button class="og-tool-btn" :title="L.zoomOut" @click="zoomGraph(0.8)">
                    <i class="ri-subtract-line"></i>
                </button>
                <button class="og-tool-btn" :title="L.recenter" @click="recenterGraph">
                    <i class="ri-restart-line"></i>
                </button>
                <button
                    class="og-tool-btn"
                    :class="{ 'og-tool-btn--active': showLabels }"
                    :title="L.toggleLabels"
                    @click="showLabels = !showLabels">
                    <i class="ri-text"></i>
                </button>
            </div>

            <div ref="chartRef" class="og-chart-canvas"></div>

            <!-- Empty states -->
            <div v-if="!hasGraph && !loading" class="og-empty">
                <i class="ri-radar-line og-empty-icon"></i>
                <h3 class="og-empty-title">{{ isFreshInstall ? L.emptyFreshTitle : L.emptyFilterTitle }}</h3>
                <p class="og-empty-text">{{ isFreshInstall ? L.emptyFreshText : L.emptyFilterText }}</p>
                <button v-if="!isFreshInstall" class="og-btn og-btn--primary" @click="relaxFilters">
                    <i class="ri-filter-off-line"></i>
                    <span>{{ L.relaxFilters }}</span>
                </button>
            </div>

            <div v-if="error" class="og-error">
                <i class="ri-error-warning-line"></i>
                <span>{{ error }}</span>
            </div>

            <transition name="og-fade">
                <div v-if="loading" class="og-loading">
                    <i class="ri-loader-4-line og-spin"></i>
                    <span>{{ L.computingLong }}</span>
                </div>
            </transition>

            <!-- Inspector -->
            <transition name="og-slide">
                <div v-if="selectedNode" class="og-inspector">
                    <div class="og-inspector-header">
                        <div class="og-inspector-title">
                            <i class="ri-user-search-line"></i>
                            <span>{{ L.inspector }}</span>
                        </div>
                        <button class="og-close-btn" @click="selectedNode = null">
                            <i class="ri-close-line"></i>
                        </button>
                    </div>

                    <div class="og-inspector-body">
                        <div class="og-user-profile">
                            <div class="og-avatar-ring" :style="{ borderColor: nodeColor(selectedNode) }">
                                <div
                                    class="og-avatar-placeholder"
                                    :style="{ background: nodeColor(selectedNode) }">
                                    {{ (selectedNode.displayName || '?').charAt(0).toUpperCase() }}
                                </div>
                            </div>
                            <h3 class="og-user-name">{{ selectedNode.displayName }}</h3>
                            <span
                                class="og-badge"
                                :style="{
                                    backgroundColor: nodeColor(selectedNode) + '25',
                                    color: nodeColor(selectedNode),
                                    borderColor: nodeColor(selectedNode)
                                }">
                                {{ L.categories[selectedNode.categoryName] }}
                            </span>
                        </div>

                        <div class="og-detail-list">
                            <div class="og-detail-item">
                                <i class="ri-time-line"></i>
                                <div>
                                    <span class="og-detail-label">{{ L.together }}</span>
                                    <span class="og-detail-value">{{ formatHours(selectedNode.secondsWithYou) }}</span>
                                </div>
                            </div>
                            <div class="og-detail-item">
                                <i class="ri-repeat-line"></i>
                                <div>
                                    <span class="og-detail-label">{{ L.sessions }}</span>
                                    <span class="og-detail-value">{{ selectedNode.sessionsWithYou }}</span>
                                </div>
                            </div>
                            <div class="og-detail-item">
                                <i class="ri-calendar-check-line"></i>
                                <div>
                                    <span class="og-detail-label">{{ L.lastSeen }}</span>
                                    <span class="og-detail-value">
                                        {{ formatDate(selectedNode.lastSeenAt) }}
                                        <template v-if="selectedNode.lastWorldName">
                                            · {{ selectedNode.lastWorldName }}
                                        </template>
                                    </span>
                                </div>
                            </div>
                            <div class="og-detail-item">
                                <i class="ri-calendar-line"></i>
                                <div>
                                    <span class="og-detail-label">{{ L.firstSeen }}</span>
                                    <span class="og-detail-value">{{ formatDate(selectedNode.firstSeenAt) }}</span>
                                </div>
                            </div>
                        </div>

                        <div v-if="neighbors.length > 0" class="og-connected-section">
                            <h4 class="og-section-title">{{ L.neighbors }}</h4>
                            <div class="og-neighbor-chips">
                                <button
                                    v-for="n in neighbors"
                                    :key="n.node.id"
                                    class="og-neighbor-chip"
                                    @click="selectNodeById(n.node.id)">
                                    <span class="og-dot" :style="{ background: nodeColor(n.node) }"></span>
                                    <span>{{ n.node.displayName }}</span>
                                    <span class="og-neighbor-time">{{ formatHours(n.seconds) }}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="og-inspector-footer">
                        <button
                            v-if="isRealUser(selectedNode)"
                            class="og-btn og-btn--primary og-w-full"
                            @click="openUser(selectedNode)">
                            <i class="ri-user-line"></i>
                            <span>{{ L.openProfile }}</span>
                        </button>
                        <button
                            v-if="selectedNode.lastLocation"
                            class="og-btn og-w-full"
                            @click="openWorld(selectedNode)">
                            <i class="ri-earth-line"></i>
                            <span>{{ L.openWorld }}</span>
                        </button>
                    </div>
                </div>
            </transition>
        </div>
    </div>
</template>

<script setup>
    import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
    import { useI18n } from 'vue-i18n';
    import * as echarts from 'echarts';

    import {
        CATEGORIES,
        DEFAULT_OPTIONS,
        RANGE_OPTIONS,
        applyFilters,
        formatDate,
        formatHours,
        loadCoPresence,
        toEchartsGraph
    } from './engine';
    import { getCtx } from './runtime';

    const { t, locale } = useI18n();

    // ------------------------------------------------------------- i18n ----
    const TEXTS = {
        de: {
            subtitle: 'Wer war mit dir – und miteinander – in denselben Instanzen',
            searchPlaceholder: 'Namen suchen…',
            refresh: 'Neu berechnen',
            refreshHint: 'Gamelog erneut auswerten',
            computing: 'Rechne…',
            computingLong: 'Werte Gamelog aus…',
            fullscreen: 'Vollbild',
            range: 'Zeitraum',
            ranges: { 30: '30 Tage', 90: '90 Tage', 365: '1 Jahr', all: 'Alles' },
            minShared: 'Mindestzeit',
            topN: 'Max. Personen',
            noLimit: 'Alle',
            friendsOnly: 'Nur Freunde',
            friendsOnlyHint: 'Nicht-Freunde ausblenden (standardmäßig sind alle dabei)',
            computedAt: 'Stand:',
            kpiPeople: 'Begegnete Personen',
            kpiShown: 'angezeigt',
            kpiFriends: 'Freunde',
            kpiFriendsSub: 'im Graph',
            kpiOthers: 'Keine Freunde',
            kpiOthersSub: 'Bekannte Gesichter',
            kpiEdges: 'Verbindungen',
            kpiEdgesSub: 'gemeinsame Zeit',
            kpiTime: 'Zeit in Instanzen',
            kpiVisits: 'Besuche',
            categories: { You: 'Du', Friends: 'Freunde', Others: 'Keine Freunde' },
            legendHint: 'Knotengröße = Zeit mit dir · Linienstärke = gemeinsame Zeit',
            zoomIn: 'Vergrößern',
            zoomOut: 'Verkleinern',
            recenter: 'Ansicht zurücksetzen',
            toggleLabels: 'Namen ein-/ausblenden',
            emptyFreshTitle: 'Noch keine Gamelog-Daten',
            emptyFreshText:
                'Der Graph entsteht aus dem lokalen Gamelog von VRCX. Lass VRCX beim Spielen mitlaufen – jede Instanz, die du besuchst, füllt den Graph weiter. Ohne VRChat-API, alles bleibt lokal.',
            emptyFilterTitle: 'Niemand über der Schwelle',
            emptyFilterText:
                'Im gewählten Zeitraum liegt niemand über der Mindestzeit. Setze die Filter weiter auf oder wähle einen längeren Zeitraum.',
            relaxFilters: 'Filter zurücksetzen',
            inspector: 'Details',
            together: 'Zeit zusammen',
            sessions: 'Gemeinsame Sessions',
            lastSeen: 'Zuletzt getroffen',
            firstSeen: 'Erstmals getroffen',
            neighbors: 'Stärkste Verbindungen',
            openProfile: 'VRCX-Profil öffnen',
            openWorld: 'Welt öffnen',
            errorPrefix: 'Auswertung fehlgeschlagen:'
        },
        en: {
            subtitle: 'Who shared instances with you — and with each other',
            searchPlaceholder: 'Search name…',
            refresh: 'Recompute',
            refreshHint: 'Sweep the gamelog again',
            computing: 'Computing…',
            computingLong: 'Sweeping the gamelog…',
            fullscreen: 'Fullscreen',
            range: 'Time range',
            ranges: { 30: '30 days', 90: '90 days', 365: '1 year', all: 'All' },
            minShared: 'Min. shared time',
            topN: 'Max. people',
            noLimit: 'All',
            friendsOnly: 'Friends only',
            friendsOnlyHint: 'Hide non-friends (everyone is included by default)',
            computedAt: 'As of',
            kpiPeople: 'People met',
            kpiShown: 'shown',
            kpiFriends: 'Friends',
            kpiFriendsSub: 'in the graph',
            kpiOthers: 'Non-friends',
            kpiOthersSub: 'Familiar faces',
            kpiEdges: 'Connections',
            kpiEdgesSub: 'shared time',
            kpiTime: 'Time in instances',
            kpiVisits: 'visits',
            categories: { You: 'You', Friends: 'Friends', Others: 'Non-friends' },
            legendHint: 'Node size = time with you · line width = shared time',
            zoomIn: 'Zoom in',
            zoomOut: 'Zoom out',
            recenter: 'Reset view',
            toggleLabels: 'Toggle names',
            emptyFreshTitle: 'No gamelog data yet',
            emptyFreshText:
                'This graph is built from the local VRCX gamelog. Keep VRCX running while you play — every instance you visit adds to it. No VRChat API calls, everything stays on this machine.',
            emptyFilterTitle: 'Nobody above the threshold',
            emptyFilterText:
                'Nobody in the selected range passes the minimum shared time. Loosen the filters or pick a longer range.',
            relaxFilters: 'Reset filters',
            inspector: 'Details',
            together: 'Time together',
            sessions: 'Shared sessions',
            lastSeen: 'Last seen',
            firstSeen: 'First seen',
            neighbors: 'Strongest connections',
            openProfile: 'Open VRCX profile',
            openWorld: 'Open world',
            errorPrefix: 'Computation failed:'
        }
    };
    const L = computed(() =>
        String(locale.value || '')
            .toLowerCase()
            .startsWith('de')
            ? TEXTS.de
            : TEXTS.en
    );

    // ------------------------------------------------------------ state ----
    const MIN_SHARED_OPTIONS = [0, 5, 15, 30, 60, 180];
    const TOP_N_OPTIONS = [25, 50, 120, 250, 0];

    const containerRef = ref(null);
    const chartRef = ref(null);
    const chartInstance = shallowRef(null);

    const filters = reactive({
        rangeDays: DEFAULT_OPTIONS.rangeDays,
        minSharedMinutes: DEFAULT_OPTIONS.minSharedMinutes,
        topN: DEFAULT_OPTIONS.topN,
        friendsOnly: DEFAULT_OPTIONS.friendsOnly
    });

    const search = ref('');
    const showLabels = ref(true);
    const isFullscreen = ref(false);
    const loading = ref(false);
    const error = ref('');
    const computedAt = ref('');
    const selectedNode = ref(null);

    /** raw sweep result, kept so filter changes never touch the DB again */
    const accumulator = shallowRef(null);
    /** filtered engine output */
    const graph = shallowRef(null);
    /** ECharts series data */
    const series = shallowRef({ nodes: [], links: [], categories: [] });

    const stats = computed(
        () =>
            graph.value?.stats || {
                peopleTotal: 0,
                peopleShown: 0,
                friendsShown: 0,
                othersShown: 0,
                edgesShown: 0,
                windows: 0,
                secondsInGame: 0
            }
    );
    const hasGraph = computed(() => series.value.nodes.length > 1);
    const isFreshInstall = computed(() => !graph.value || graph.value.stats.windows === 0);

    // ------------------------------------------------------------- data ----
    let loadToken = 0;

    async function reload() {
        const token = ++loadToken;
        loading.value = true;
        error.value = '';
        try {
            const acc = await loadCoPresence(getCtx(), { rangeDays: filters.rangeDays });
            if (token !== loadToken) {
                return; // a newer run superseded this one
            }
            accumulator.value = acc;
            refilter();
            computedAt.value = new Date().toLocaleTimeString();
        } catch (e) {
            if (token !== loadToken) {
                return;
            }
            error.value = `${L.value.errorPrefix} ${e?.message || e}`;
            try {
                getCtx().error('orbit graph computation failed:', e);
            } catch {
                console.error('[orbitgraph] computation failed:', e);
            }
        } finally {
            if (token === loadToken) {
                loading.value = false;
            }
        }
    }

    function refilter() {
        if (!accumulator.value) {
            return;
        }
        graph.value = applyFilters(accumulator.value, {
            minSharedMinutes: filters.minSharedMinutes,
            topN: filters.topN,
            friendsOnly: filters.friendsOnly
        });
        selectedNode.value = null;
        rebuildSeries();
    }

    function rebuildSeries() {
        series.value = graph.value
            ? toEchartsGraph(graph.value, { search: search.value })
            : { nodes: [], links: [], categories: [] };
        nextTick(() => updateChart());
    }

    function relaxFilters() {
        filters.minSharedMinutes = 0;
        filters.topN = 0;
        filters.friendsOnly = false;
    }

    watch(
        () => filters.rangeDays,
        () => reload()
    );
    watch([() => filters.minSharedMinutes, () => filters.topN, () => filters.friendsOnly], () =>
        refilter()
    );
    watch(search, () => rebuildSeries());
    watch(showLabels, () => updateChart());

    // ------------------------------------------------------------ chart ----
    function nodeColor(node) {
        return CATEGORIES[node?.category ?? 2].color;
    }

    function isRealUser(node) {
        return Boolean(node && !node.isSelf && String(node.userId || '').startsWith('usr_'));
    }

    function openUser(node) {
        if (!isRealUser(node)) {
            return;
        }
        try {
            getCtx().ui.showUserDialog(node.userId);
        } catch (e) {
            getCtx().warn('showUserDialog failed:', e);
        }
    }

    function openWorld(node) {
        if (!node?.lastLocation) {
            return;
        }
        try {
            getCtx().ui.showWorldDialog(node.lastLocation);
        } catch (e) {
            getCtx().warn('showWorldDialog failed:', e);
        }
    }

    function selectNodeById(id) {
        selectedNode.value = series.value.nodes.find((n) => n.id === id) || null;
    }

    const neighbors = computed(() => {
        const node = selectedNode.value;
        if (!node) {
            return [];
        }
        const byId = new Map(series.value.nodes.map((n) => [n.id, n]));
        return series.value.links
            .filter((l) => l.source === node.id || l.target === node.id)
            .map((l) => ({
                node: byId.get(l.source === node.id ? l.target : l.source),
                seconds: l.seconds
            }))
            .filter((n) => n.node)
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 12);
    });

    function tooltipFormatter(params) {
        const texts = L.value;
        if (params.dataType === 'node') {
            const d = params.data;
            const color = CATEGORIES[d.category].color;
            let html = '<div style="font-family: system-ui, sans-serif; min-width: 180px;">';
            html += `<div style="font-weight:700;font-size:15px;margin-bottom:4px;color:#fff;">${escapeHtml(d.displayName)}</div>`;
            html += `<div style="font-size:11px;color:${color};margin-bottom:6px;">${escapeHtml(texts.categories[d.categoryName])}</div>`;
            if (!d.isSelf) {
                html += `<div style="font-size:12px;">${escapeHtml(texts.together)}: <b>${formatHours(d.secondsWithYou)}</b></div>`;
                html += `<div style="font-size:12px;">${escapeHtml(texts.sessions)}: <b>${d.sessionsWithYou}</b></div>`;
                html += `<div style="font-size:11px;color:#94a3b8;margin-top:4px;">${escapeHtml(texts.lastSeen)}: ${formatDate(d.lastSeenAt)}</div>`;
                if (d.lastWorldName) {
                    html += `<div style="font-size:11px;color:#94a3b8;">📍 ${escapeHtml(d.lastWorldName)}</div>`;
                }
            } else {
                html += `<div style="font-size:12px;">${escapeHtml(texts.kpiTime)}: <b>${formatHours(d.secondsWithYou)}</b></div>`;
            }
            html += '</div>';
            return html;
        }
        if (params.dataType === 'edge') {
            const d = params.data;
            const names = new Map(series.value.nodes.map((n) => [n.id, n.displayName]));
            const a = escapeHtml(names.get(d.source) || d.source);
            const b = escapeHtml(names.get(d.target) || d.target);
            return (
                `<div style="font-family: system-ui, sans-serif; font-size:12px;">` +
                `<b>${a}</b> ↔ <b>${b}</b><br/>` +
                `${escapeHtml(L.value.together)}: <b>${formatHours(d.seconds)}</b><br/>` +
                `${escapeHtml(L.value.sessions)}: <b>${d.sessions}</b></div>`
            );
        }
        return '';
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function initChart() {
        if (!chartRef.value || chartInstance.value) {
            return;
        }
        const chart = echarts.init(chartRef.value, 'dark');
        chartInstance.value = chart;
        chart.on('click', (params) => {
            if (params.dataType !== 'node') {
                selectedNode.value = null;
                return;
            }
            selectedNode.value = params.data;
            if (isRealUser(params.data)) {
                openUser(params.data);
            }
        });
        updateChart();
    }

    function updateChart() {
        if (!chartInstance.value) {
            return;
        }
        chartInstance.value.setOption(
            {
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'item',
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    borderColor: 'rgba(255, 255, 255, 0.12)',
                    borderWidth: 1,
                    padding: [10, 14],
                    textStyle: { color: '#f8fafc', fontSize: 13 },
                    extraCssText:
                        'backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.6); border-radius: 12px;',
                    formatter: tooltipFormatter
                },
                series: [
                    {
                        name: 'Orbit',
                        type: 'graph',
                        layout: 'force',
                        data: series.value.nodes,
                        links: series.value.links,
                        categories: series.value.categories,
                        roam: true,
                        draggable: true,
                        label: {
                            show: showLabels.value,
                            position: 'right',
                            // Only label the nodes that carry weight, so a big
                            // graph does not drown in text.
                            formatter: (params) =>
                                params.data.labelShow ? params.data.displayName || params.name : '',
                            color: '#e2e8f0',
                            fontSize: 11,
                            distance: 6
                        },
                        labelLayout: { hideOverlap: true },
                        scaleLimit: { min: 0.15, max: 8 },
                        lineStyle: { color: 'source', curveness: 0.12 },
                        emphasis: {
                            focus: 'adjacency',
                            lineStyle: { width: 3.5, opacity: 0.95 },
                            itemStyle: { shadowBlur: 25 }
                        },
                        force: {
                            repulsion: 260,
                            gravity: 0.08,
                            edgeLength: [40, 160],
                            friction: 0.35
                        }
                    }
                ]
            },
            true
        );
    }

    function zoomGraph(factor) {
        chartInstance.value?.dispatchAction({ type: 'graphRoam', zoom: factor });
    }

    function recenterGraph() {
        chartInstance.value?.dispatchAction({ type: 'restore' });
        nextTick(() => updateChart());
    }

    function toggleFullscreen() {
        isFullscreen.value = !isFullscreen.value;
        nextTick(() => chartInstance.value?.resize());
    }

    // ----------------------------------------------------------- mount -----
    let resizeObserver = null;

    onMounted(() => {
        nextTick(() => {
            initChart();
            if (containerRef.value && typeof ResizeObserver !== 'undefined') {
                resizeObserver = new ResizeObserver(() => chartInstance.value?.resize());
                resizeObserver.observe(containerRef.value);
            }
        });
        // Compute on tab open, never on app start.
        reload();
    });

    onBeforeUnmount(() => {
        resizeObserver?.disconnect();
        chartInstance.value?.dispose();
        chartInstance.value = null;
    });
</script>

<style scoped>
    .og-container {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 720px;
        padding: 24px;
        gap: 16px;
        background: #090d16;
        color: #f1f5f9;
        font-family: inherit;
        box-sizing: border-box;
        overflow: hidden;
    }

    .og-container--fullscreen {
        position: fixed;
        inset: 0;
        z-index: 9999;
        min-height: 100vh;
        border-radius: 0;
    }

    .og-bg-glow {
        position: absolute;
        border-radius: 50%;
        filter: blur(120px);
        opacity: 0.18;
        pointer-events: none;
    }
    .og-bg-glow--1 {
        width: 450px;
        height: 450px;
        background: #ec4899;
        top: -100px;
        left: -100px;
    }
    .og-bg-glow--2 {
        width: 500px;
        height: 500px;
        background: #22d3ee;
        bottom: -150px;
        right: -150px;
    }

    /* Header */
    .og-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 16px;
        z-index: 2;
    }

    .og-title-group {
        display: flex;
        align-items: center;
        gap: 14px;
    }

    .og-icon-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 46px;
        height: 46px;
        border-radius: 14px;
        background: linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(34, 211, 238, 0.25));
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #ec4899;
        font-size: 24px;
        box-shadow: 0 8px 20px rgba(236, 72, 153, 0.2);
    }

    .og-title {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.02em;
        background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .og-subtitle {
        margin: 2px 0 0 0;
        font-size: 13px;
        color: #94a3b8;
    }

    .og-header-controls {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    /* Filters */
    .og-filters {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        z-index: 2;
    }

    .og-filter {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .og-filter-label {
        font-size: 12px;
        color: #94a3b8;
    }

    .og-stamp {
        margin-left: auto;
        font-size: 11px;
        color: #64748b;
    }

    .og-seg {
        display: flex;
        padding: 3px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        backdrop-filter: blur(12px);
    }

    .og-seg-btn {
        padding: 5px 11px;
        border: none;
        background: transparent;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .og-seg-btn:hover {
        color: #f8fafc;
    }
    .og-seg-btn--active {
        background: linear-gradient(135deg, #ec4899, #8b5cf6);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);
    }

    .og-select {
        padding: 6px 10px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        color: #f8fafc;
        font-size: 12px;
        cursor: pointer;
    }
    .og-select:focus {
        outline: none;
        border-color: #ec4899;
    }

    /* Search */
    .og-search-box {
        position: relative;
        display: flex;
        align-items: center;
    }
    .og-search-icon {
        position: absolute;
        left: 12px;
        color: #64748b;
        font-size: 16px;
    }
    .og-search-input {
        width: 200px;
        padding: 8px 32px 8px 36px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        color: #f8fafc;
        font-size: 13px;
        backdrop-filter: blur(12px);
    }
    .og-search-input:focus {
        outline: none;
        border-color: #ec4899;
        box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.2);
    }
    .og-search-clear {
        position: absolute;
        right: 8px;
        border: none;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        font-size: 14px;
    }

    /* Buttons */
    .og-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 14px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        color: #cbd5e1;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        backdrop-filter: blur(12px);
        transition: all 0.2s ease;
    }
    .og-btn:hover:not(:disabled) {
        color: #ffffff;
        border-color: rgba(255, 255, 255, 0.2);
    }
    .og-btn:disabled {
        opacity: 0.55;
        cursor: default;
    }
    .og-btn--primary {
        background: linear-gradient(135deg, #ec4899, #8b5cf6);
        border-color: transparent;
        color: #ffffff;
    }
    .og-btn--active {
        border-color: #a855f7;
        color: #d8b4fe;
    }
    .og-w-full {
        width: 100%;
    }

    .og-spin {
        animation: og-spin 1s linear infinite;
    }
    @keyframes og-spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* KPI ribbon */
    .og-kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
        z-index: 2;
    }

    .og-kpi-card {
        padding: 12px 14px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 14px;
        backdrop-filter: blur(12px);
    }
    .og-kpi-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .og-kpi-value {
        margin-top: 6px;
        font-size: 24px;
        font-weight: 700;
    }
    .og-kpi-subtext {
        font-size: 11px;
        color: #64748b;
    }
    .og-kpi-card--rose .og-kpi-value {
        color: #f472b6;
    }
    .og-kpi-card--violet .og-kpi-value {
        color: #c084fc;
    }
    .og-kpi-card--cyan .og-kpi-value {
        color: #22d3ee;
    }
    .og-kpi-card--amber .og-kpi-value {
        color: #fbbf24;
    }
    .og-kpi-card--emerald .og-kpi-value {
        color: #34d399;
    }

    /* Viewport */
    .og-viewport {
        position: relative;
        flex: 1;
        min-height: 380px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 18px;
        background: rgba(2, 6, 23, 0.55);
        overflow: hidden;
        z-index: 2;
    }

    .og-chart-canvas {
        width: 100%;
        height: 100%;
    }

    .og-legend {
        position: absolute;
        top: 12px;
        left: 16px;
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        font-size: 12px;
        color: #cbd5e1;
        z-index: 3;
        pointer-events: none;
    }
    .og-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .og-legend-hint {
        font-size: 11px;
        color: #64748b;
    }
    .og-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        display: inline-block;
    }

    .og-toolbar {
        position: absolute;
        top: 12px;
        right: 16px;
        display: flex;
        gap: 4px;
        padding: 4px;
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        backdrop-filter: blur(12px);
        z-index: 3;
    }
    .og-tool-btn {
        border: none;
        background: transparent;
        color: #94a3b8;
        font-size: 15px;
        padding: 5px 8px;
        border-radius: 7px;
        cursor: pointer;
    }
    .og-tool-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.06);
    }
    .og-tool-btn--active {
        color: #f472b6;
    }

    /* Empty / loading / error */
    .og-empty {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 32px;
        text-align: center;
        background: rgba(2, 6, 23, 0.92);
        z-index: 4;
    }
    .og-empty-icon {
        font-size: 42px;
        color: #334155;
    }
    .og-empty-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: #e2e8f0;
    }
    .og-empty-text {
        margin: 0;
        max-width: 520px;
        font-size: 13px;
        line-height: 1.55;
        color: #94a3b8;
    }

    .og-loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        font-size: 13px;
        color: #cbd5e1;
        background: rgba(2, 6, 23, 0.55);
        backdrop-filter: blur(3px);
        z-index: 4;
    }

    .og-error {
        position: absolute;
        bottom: 14px;
        left: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        font-size: 12px;
        color: #fecaca;
        background: rgba(127, 29, 29, 0.5);
        border: 1px solid rgba(248, 113, 113, 0.4);
        border-radius: 10px;
        z-index: 5;
    }

    /* Inspector */
    .og-inspector {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 300px;
        display: flex;
        flex-direction: column;
        background: rgba(9, 13, 22, 0.92);
        border-left: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(16px);
        z-index: 6;
    }
    .og-inspector-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .og-inspector-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
        color: #e2e8f0;
    }
    .og-close-btn {
        border: none;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        font-size: 16px;
    }
    .og-inspector-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
    }
    .og-inspector-footer {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .og-user-profile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
    }
    .og-avatar-ring {
        width: 62px;
        height: 62px;
        border-radius: 50%;
        border: 2px solid #ec4899;
        padding: 3px;
    }
    .og-avatar-placeholder {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        font-weight: 700;
        color: #0f172a;
    }
    .og-user-name {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        text-align: center;
        word-break: break-word;
    }
    .og-badge {
        padding: 3px 10px;
        border: 1px solid;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
    }

    .og-detail-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .og-detail-item {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        font-size: 12px;
        color: #cbd5e1;
    }
    .og-detail-item > i {
        color: #64748b;
        font-size: 15px;
        margin-top: 1px;
    }
    .og-detail-label {
        display: block;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748b;
    }
    .og-detail-value {
        display: block;
        color: #f1f5f9;
        word-break: break-word;
    }

    .og-connected-section {
        margin-top: 18px;
    }
    .og-section-title {
        margin: 0 0 8px 0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748b;
    }
    .og-neighbor-chips {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .og-neighbor-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 9px;
        color: #cbd5e1;
        font-size: 12px;
        cursor: pointer;
        text-align: left;
    }
    .og-neighbor-chip:hover {
        border-color: rgba(255, 255, 255, 0.18);
        color: #ffffff;
    }
    .og-neighbor-time {
        margin-left: auto;
        font-size: 11px;
        color: #64748b;
    }

    /* Transitions */
    .og-slide-enter-active,
    .og-slide-leave-active {
        transition: transform 0.22s ease, opacity 0.22s ease;
    }
    .og-slide-enter-from,
    .og-slide-leave-to {
        transform: translateX(20px);
        opacity: 0;
    }
    .og-fade-enter-active,
    .og-fade-leave-active {
        transition: opacity 0.2s ease;
    }
    .og-fade-enter-from,
    .og-fade-leave-to {
        opacity: 0;
    }
</style>
