<template>
    <div ref="containerRef" class="og-container" :class="{ 'og-container--fullscreen': isFullscreen }">
        <!-- Ambient Glass background highlights -->
        <div class="og-bg-glow og-bg-glow--1"></div>
        <div class="og-bg-glow og-bg-glow--2"></div>

        <!-- Top Header & Navigation Bar -->
        <header class="og-header">
            <div class="og-title-group">
                <div class="og-icon-badge">
                    <i class="ri-node-tree"></i>
                </div>
                <div>
                    <h2 class="og-title">Orbit Graph</h2>
                    <p class="og-subtitle">Interactive Social Network & Constellation Explorer</p>
                </div>
            </div>

            <div class="og-header-controls">
                <!-- Data Source Segmented Switcher -->
                <div class="og-seg">
                    <button
                        class="og-seg-btn"
                        :class="{ 'og-seg-btn--active': dataSource === 'store' }"
                        title="Use Live VRCX Store Data"
                        @click="setDataSource('store')">
                        <i class="ri-database-2-line"></i>
                        <span>Live Store</span>
                    </button>
                    <button
                        class="og-seg-btn"
                        :class="{ 'og-seg-btn--active': dataSource === 'demo' }"
                        title="Use Demo Constellation Data"
                        @click="setDataSource('demo')">
                        <i class="ri-magic-line"></i>
                        <span>Demo Mode</span>
                    </button>
                </div>

                <!-- Search Filter Input -->
                <div class="og-search-box">
                    <i class="ri-search-line og-search-icon"></i>
                    <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search friend, group or location..."
                        class="og-search-input" />
                    <button v-if="searchQuery" class="og-search-clear" @click="searchQuery = ''">
                        <i class="ri-close-line"></i>
                    </button>
                </div>

                <!-- Action Buttons -->
                <div class="og-header-actions">
                    <button
                        class="og-btn"
                        :class="{ 'og-btn--active': showPhysicsPanel }"
                        title="Physics Physics Tuning"
                        @click="showPhysicsPanel = !showPhysicsPanel">
                        <i class="ri-settings-4-line"></i>
                        <span>Physics</span>
                    </button>

                    <button class="og-btn" title="Toggle Fullscreen" @click="toggleFullscreen">
                        <i :class="isFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'"></i>
                    </button>
                </div>
            </div>
        </header>

        <!-- KPI Metrics Ribbon -->
        <div class="og-kpi-grid">
            <div class="og-kpi-card og-kpi-card--rose">
                <div class="og-kpi-header">
                    <span>Total Orbit Nodes</span>
                    <i class="ri-user-star-line"></i>
                </div>
                <div class="og-kpi-value">{{ metrics.totalFriends }}</div>
                <div class="og-kpi-subtext">Active Constellation</div>
            </div>

            <div class="og-kpi-card og-kpi-card--emerald">
                <div class="og-kpi-header">
                    <span>Online & Active</span>
                    <i class="ri-checkbox-blank-circle-fill"></i>
                </div>
                <div class="og-kpi-value">{{ metrics.onlineCount }}</div>
                <div class="og-kpi-subtext">In-Game Now</div>
            </div>

            <div class="og-kpi-card og-kpi-card--violet">
                <div class="og-kpi-header">
                    <span>VIP Nodes</span>
                    <i class="ri-vip-crown-line"></i>
                </div>
                <div class="og-kpi-value">{{ metrics.vipCount }}</div>
                <div class="og-kpi-subtext">Favorites</div>
            </div>

            <div class="og-kpi-card og-kpi-card--cyan">
                <div class="og-kpi-header">
                    <span>Connections</span>
                    <i class="ri-links-line"></i>
                </div>
                <div class="og-kpi-value">{{ metrics.connectionsCount }}</div>
                <div class="og-kpi-subtext">Inter-Friend Edges</div>
            </div>

            <div class="og-kpi-card og-kpi-card--amber">
                <div class="og-kpi-header">
                    <span>Network Density</span>
                    <i class="ri-bubble-chart-line"></i>
                </div>
                <div class="og-kpi-value">{{ metrics.densityPercent }}%</div>
                <div class="og-kpi-subtext">Social Clustering</div>
            </div>
        </div>

        <!-- Main Workspace Viewport -->
        <div class="og-viewport">
            <!-- Category Filter Chips Overlay -->
            <div class="og-category-bar">
                <span class="og-bar-label">Categories:</span>
                <button
                    v-for="cat in CATEGORIES"
                    :key="cat.name"
                    class="og-cat-chip"
                    :class="{ 'og-cat-chip--active': selectedCategories.includes(cat.name) }"
                    :style="selectedCategories.includes(cat.name) ? { borderColor: cat.color, color: cat.color } : {}"
                    @click="toggleCategory(cat.name)">
                    <i :class="cat.icon"></i>
                    <span>{{ cat.label }}</span>
                </button>
                <button v-if="selectedCategories.length > 0" class="og-cat-reset" @click="selectedCategories = []">
                    Reset Filters
                </button>
            </div>

            <!-- Floating Viewport Toolbar (Top Right) -->
            <div class="og-toolbar">
                <div class="og-toolbar-group">
                    <button
                        class="og-tool-btn"
                        :class="{ 'og-tool-btn--active': layoutType === 'force' }"
                        title="Force-Directed Physics Layout"
                        @click="layoutType = 'force'">
                        <i class="ri-node-tree"></i>
                        <span>Force</span>
                    </button>
                    <button
                        class="og-tool-btn"
                        :class="{ 'og-tool-btn--active': layoutType === 'circular' }"
                        title="Circular Constellation Layout"
                        @click="layoutType = 'circular'">
                        <i class="ri-pie-chart-line"></i>
                        <span>Circular</span>
                    </button>
                </div>

                <div class="og-toolbar-divider"></div>

                <div class="og-toolbar-group">
                    <button
                        class="og-tool-btn"
                        :class="{ 'og-tool-btn--active': showLabels }"
                        title="Toggle Node Labels"
                        @click="showLabels = !showLabels">
                        <i class="ri-text"></i>
                    </button>
                    <button
                        class="og-tool-btn"
                        :class="{ 'og-tool-btn--active': isCurveEdges }"
                        title="Toggle Curved Edges"
                        @click="isCurveEdges = !isCurveEdges">
                        <i class="ri-route-line"></i>
                    </button>
                </div>

                <div class="og-toolbar-divider"></div>

                <div class="og-toolbar-group">
                    <button class="og-tool-btn" title="Zoom In" @click="zoomGraph(1.2)">
                        <i class="ri-add-line"></i>
                    </button>
                    <button class="og-tool-btn" title="Zoom Out" @click="zoomGraph(0.8)">
                        <i class="ri-subtract-line"></i>
                    </button>
                    <button class="og-tool-btn" title="Recenter View" @click="recenterGraph">
                        <i class="ri-restart-line"></i>
                    </button>
                </div>
            </div>

            <!-- ECharts Graph Element -->
            <div ref="chartRef" class="og-chart-canvas"></div>

            <!-- Drawer: Inspector Panel for Selected Friend / Node -->
            <transition name="og-slide">
                <div v-if="selectedNode" class="og-inspector">
                    <div class="og-inspector-header">
                        <div class="og-inspector-title">
                            <i class="ri-user-search-line"></i>
                            <span>Node Inspector</span>
                        </div>
                        <button class="og-close-btn" @click="selectedNode = null">
                            <i class="ri-close-line"></i>
                        </button>
                    </div>

                    <div class="og-inspector-body">
                        <div class="og-user-profile">
                            <div class="og-avatar-ring" :style="{ borderColor: getNodeColor(selectedNode) }">
                                <img
                                    v-if="selectedNode.avatarUrl"
                                    :src="selectedNode.avatarUrl"
                                    class="og-avatar-img"
                                    alt="Avatar" />
                                <div
                                    v-else
                                    class="og-avatar-placeholder"
                                    :style="{ background: getNodeColor(selectedNode) }">
                                    {{
                                        selectedNode.displayName
                                            ? selectedNode.displayName.charAt(0).toUpperCase()
                                            : '?'
                                    }}
                                </div>
                            </div>

                            <h3 class="og-user-name">{{ selectedNode.displayName }}</h3>

                            <div class="og-user-badges">
                                <span
                                    class="og-badge"
                                    :style="{
                                        backgroundColor: getNodeColor(selectedNode) + '25',
                                        color: getNodeColor(selectedNode),
                                        borderColor: getNodeColor(selectedNode)
                                    }">
                                    {{ selectedNode.categoryName }}
                                </span>
                                <span class="og-badge og-badge--status" :class="'og-badge--' + selectedNode.status">
                                    {{ selectedNode.statusText || selectedNode.status }}
                                </span>
                            </div>
                        </div>

                        <div class="og-detail-list">
                            <div class="og-detail-item">
                                <i class="ri-earth-line"></i>
                                <div>
                                    <span class="og-detail-label">Location / World</span>
                                    <span class="og-detail-value">{{ selectedNode.location || 'Offline' }}</span>
                                </div>
                            </div>

                            <div v-if="selectedNode.bio" class="og-detail-item">
                                <i class="ri-chat-quote-line"></i>
                                <div>
                                    <span class="og-detail-label">Status Bio</span>
                                    <span class="og-detail-value og-detail-bio">"{{ selectedNode.bio }}"</span>
                                </div>
                            </div>

                            <div class="og-detail-item">
                                <i class="ri-git-branch-line"></i>
                                <div>
                                    <span class="og-detail-label">Degree (Connections)</span>
                                    <span class="og-detail-value">{{ connectedNeighbors.length }} direct links</span>
                                </div>
                            </div>
                        </div>

                        <!-- Connected Neighbors Section -->
                        <div v-if="connectedNeighbors.length > 0" class="og-connected-section">
                            <h4 class="og-section-title">Connected Orbit Nodes</h4>
                            <div class="og-neighbor-chips">
                                <button
                                    v-for="neighbor in connectedNeighbors"
                                    :key="neighbor.id"
                                    class="og-neighbor-chip"
                                    @click="selectNodeById(neighbor.id)">
                                    <span class="og-dot" :style="{ background: getNodeColor(neighbor) }"></span>
                                    <span>{{ neighbor.displayName }}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="og-inspector-footer">
                        <button class="og-btn og-btn--primary og-w-full" @click="recenterGraph">
                            <i class="ri-focus-3-line"></i>
                            <span>Focus in Constellation</span>
                        </button>
                    </div>
                </div>
            </transition>

            <!-- Drawer: Physics Slider Tuning Panel -->
            <transition name="og-slide">
                <div v-if="showPhysicsPanel" class="og-physics-panel">
                    <div class="og-inspector-header">
                        <div class="og-inspector-title">
                            <i class="ri-settings-4-line"></i>
                            <span>Graph Physics Tuning</span>
                        </div>
                        <button class="og-close-btn" @click="showPhysicsPanel = false">
                            <i class="ri-close-line"></i>
                        </button>
                    </div>

                    <div class="og-inspector-body">
                        <div class="og-slider-group">
                            <div class="og-slider-header">
                                <span>Repulsion Strength</span>
                                <span class="og-slider-val">{{ physicsConfig.repulsion }}</span>
                            </div>
                            <input
                                v-model.number="physicsConfig.repulsion"
                                type="range"
                                min="50"
                                max="1000"
                                step="25"
                                class="og-slider" />
                        </div>

                        <div class="og-slider-group">
                            <div class="og-slider-header">
                                <span>Gravity Force</span>
                                <span class="og-slider-val">{{ physicsConfig.gravity }}</span>
                            </div>
                            <input
                                v-model.number="physicsConfig.gravity"
                                type="range"
                                min="0.01"
                                max="0.5"
                                step="0.01"
                                class="og-slider" />
                        </div>

                        <div class="og-slider-group">
                            <div class="og-slider-header">
                                <span>Edge Length</span>
                                <span class="og-slider-val">{{ physicsConfig.edgeLength }}</span>
                            </div>
                            <input
                                v-model.number="physicsConfig.edgeLength"
                                type="range"
                                min="30"
                                max="300"
                                step="10"
                                class="og-slider" />
                        </div>

                        <div class="og-slider-group">
                            <div class="og-slider-header">
                                <span>Damping / Friction</span>
                                <span class="og-slider-val">{{ physicsConfig.friction }}</span>
                            </div>
                            <input
                                v-model.number="physicsConfig.friction"
                                type="range"
                                min="0.1"
                                max="0.9"
                                step="0.05"
                                class="og-slider" />
                        </div>

                        <div class="og-slider-group">
                            <div class="og-slider-header">
                                <span>Node Scale Multiplier</span>
                                <span class="og-slider-val">{{ physicsConfig.nodeScale }}x</span>
                            </div>
                            <input
                                v-model.number="physicsConfig.nodeScale"
                                type="range"
                                min="0.5"
                                max="2.5"
                                step="0.1"
                                class="og-slider" />
                        </div>
                    </div>

                    <div class="og-inspector-footer">
                        <button class="og-btn og-w-full" @click="resetPhysics">
                            <i class="ri-restart-line"></i>
                            <span>Reset Physics Defaults</span>
                        </button>
                    </div>
                </div>
            </transition>
        </div>
    </div>
</template>

<script setup>
    import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
    import * as echarts from 'echarts';
    import {
        CATEGORIES,
        CATEGORY_MAP,
        buildGraphFromFriends,
        computeNetworkMetrics,
        filterGraphData,
        generateMockFriendsNetwork
    } from './engine';
    import { useFriendStore } from '../../stores/friend';
    import { useUserStore } from '../../stores/user';

    // State refs
    const containerRef = ref(null);
    const chartRef = ref(null);
    const chartInstance = shallowRef(null);

    const dataSource = ref('demo');
    const searchQuery = ref('');
    const selectedCategories = ref([]);
    const selectedNode = ref(null);

    const layoutType = ref('force'); // 'force' | 'circular'
    const showLabels = ref(true);
    const isCurveEdges = ref(true);
    const showPhysicsPanel = ref(false);
    const isFullscreen = ref(false);

    const physicsConfig = reactive({
        repulsion: 300,
        gravity: 0.1,
        edgeLength: 110,
        friction: 0.5,
        nodeScale: 1.0
    });

    // Safely access stores
    let friendStore = null;
    let userStore = null;
    try {
        friendStore = useFriendStore();
        userStore = useUserStore();
    } catch (e) {
        // Pinia not yet initialized or test environment
    }

    // Check if real friends exist in store and auto-select source
    onMounted(() => {
        if (friendStore && friendStore.friends && friendStore.friends.size > 0) {
            dataSource.value = 'store';
        } else {
            dataSource.value = 'demo';
        }
    });

    function setDataSource(type) {
        dataSource.value = type;
        selectedNode.value = null;
    }

    // Compute raw base graph data
    const rawGraphData = computed(() => {
        if (dataSource.value === 'store' && friendStore && friendStore.friends && friendStore.friends.size > 0) {
            const built = buildGraphFromFriends(friendStore.friends, userStore?.currentUser);
            if (built) return built;
        }
        return generateMockFriendsNetwork();
    });

    // Filtered graph data for active rendering
    const activeGraphData = computed(() => {
        return filterGraphData(rawGraphData.value, searchQuery.value, selectedCategories.value);
    });

    // Compute KPI network metrics
    const metrics = computed(() => {
        return computeNetworkMetrics(activeGraphData.value);
    });

    // Connected neighbors for inspector
    const connectedNeighbors = computed(() => {
        if (!selectedNode.value || !activeGraphData.value) return [];
        const nodeId = selectedNode.value.id;
        const links = activeGraphData.value.links;

        const neighborIds = new Set();
        links.forEach((l) => {
            const src = typeof l.source === 'object' ? l.source.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target.id : l.target;

            if (src === nodeId) neighborIds.add(tgt);
            if (tgt === nodeId) neighborIds.add(src);
        });

        return activeGraphData.value.nodes.filter((n) => neighborIds.has(n.id));
    });

    function toggleCategory(catName) {
        const idx = selectedCategories.value.indexOf(catName);
        if (idx >= 0) {
            selectedCategories.value.splice(idx, 1);
        } else {
            selectedCategories.value.push(catName);
        }
    }

    function getNodeColor(node) {
        if (!node) return '#94a3b8';
        if (node.itemStyle && node.itemStyle.color) return node.itemStyle.color;
        const cat = CATEGORY_MAP[node.categoryName];
        return cat ? cat.color : '#94a3b8';
    }

    function selectNodeById(id) {
        if (!activeGraphData.value) return;
        const found = activeGraphData.value.nodes.find((n) => n.id === id);
        if (found) {
            selectedNode.value = found;
        }
    }

    function resetPhysics() {
        physicsConfig.repulsion = 300;
        physicsConfig.gravity = 0.1;
        physicsConfig.edgeLength = 110;
        physicsConfig.friction = 0.5;
        physicsConfig.nodeScale = 1.0;
    }

    function toggleFullscreen() {
        isFullscreen.value = !isFullscreen.value;
        nextTick(() => {
            if (chartInstance.value) {
                chartInstance.value.resize();
            }
        });
    }

    function zoomGraph(factor) {
        if (!chartInstance.value) return;
        const option = chartInstance.value.getOption();
        if (option && option.series && option.series[0]) {
            chartInstance.value.dispatchAction({
                type: 'graphRoam',
                zoom: factor
            });
        }
    }

    function recenterGraph() {
        if (!chartInstance.value) return;
        chartInstance.value.dispatchAction({
            type: 'restore'
        });
    }

    // ECharts Initialization & Updating
    function initChart() {
        if (!chartRef.value) return;

        if (chartInstance.value) {
            chartInstance.value.dispose();
        }

        const chart = echarts.init(chartRef.value, 'dark');
        chartInstance.value = chart;

        chart.on('click', (params) => {
            if (params.dataType === 'node') {
                selectedNode.value = params.data;
            } else {
                selectedNode.value = null;
            }
        });

        updateChartOptions();
    }

    function updateChartOptions() {
        if (!chartInstance.value) return;

        const data = activeGraphData.value;
        if (!data) return;

        // Apply scale multiplier to node symbol sizes
        const nodes = data.nodes.map((n) => ({
            ...n,
            symbolSize: Math.round((n.symbolSize || 24) * physicsConfig.nodeScale)
        }));

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                borderColor: 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1,
                padding: [10, 14],
                textStyle: { color: '#f8fafc', fontSize: 13 },
                extraCssText:
                    'backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); border-radius: 12px;',
                formatter: (params) => {
                    if (params.dataType === 'node') {
                        const d = params.data;
                        const statusDot =
                            d.status === 'online'
                                ? '<span style="color:#10b981;">● Online</span>'
                                : d.status === 'active'
                                  ? '<span style="color:#06b6d4;">● Active</span>'
                                  : '<span style="color:#64748b;">● Offline</span>';

                        let html = `<div style="font-family: system-ui, sans-serif;">`;
                        html += `<div style="font-weight: 700; font-size: 15px; margin-bottom: 4px; color: #ffffff;">${d.displayName}</div>`;
                        html += `<div style="font-size: 12px; margin-bottom: 6px;">Category: <b>${d.categoryName}</b> | ${statusDot}</div>`;
                        if (d.location) {
                            html += `<div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">📍 ${d.location}</div>`;
                        }
                        if (d.bio) {
                            html += `<div style="font-size: 11px; color: #cbd5e1; margin-top: 4px; font-style: italic;">"${d.bio}"</div>`;
                        }
                        html += `</div>`;
                        return html;
                    } else if (params.dataType === 'edge') {
                        const link = params.data;
                        const src = typeof link.source === 'object' ? link.source.name : link.source;
                        const tgt = typeof link.target === 'object' ? link.target.name : link.target;
                        return `<div style="font-size: 12px; font-family: system-ui, sans-serif;">Connection: <b>${src}</b> ↔ <b>${tgt}</b></div>`;
                    }
                    return '';
                }
            },
            legend: [
                {
                    data: CATEGORIES.map((c) => c.name),
                    textStyle: { color: '#94a3b8', fontSize: 12 },
                    icon: 'circle',
                    top: 10,
                    left: 'center'
                }
            ],
            series: [
                {
                    name: 'Orbit Constellation',
                    type: 'graph',
                    layout: layoutType.value,
                    data: nodes,
                    links: data.links,
                    categories: CATEGORIES.map((c) => ({ name: c.name })),
                    roam: true,
                    draggable: true,
                    label: {
                        show: showLabels.value,
                        position: 'right',
                        formatter: (params) => params.data.displayName || params.name,
                        color: '#e2e8f0',
                        fontSize: 11,
                        distance: 6
                    },
                    labelLayout: {
                        hideOverlap: true
                    },
                    scaleLimit: {
                        min: 0.2,
                        max: 6
                    },
                    lineStyle: {
                        color: 'source',
                        curveness: isCurveEdges.value ? 0.15 : 0,
                        opacity: 0.45,
                        width: 1.5
                    },
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: {
                            width: 3.5,
                            opacity: 0.95
                        },
                        itemStyle: {
                            shadowBlur: 25,
                            shadowColor: 'rgba(236, 72, 153, 0.8)'
                        }
                    },
                    force: {
                        repulsion: physicsConfig.repulsion,
                        gravity: physicsConfig.gravity,
                        edgeLength: [physicsConfig.edgeLength * 0.5, physicsConfig.edgeLength * 1.5],
                        friction: physicsConfig.friction
                    }
                }
            ]
        };

        chartInstance.value.setOption(option, true);
    }

    // Watchers for reactive settings
    watch(
        [activeGraphData, layoutType, showLabels, isCurveEdges, physicsConfig],
        () => {
            updateChartOptions();
        },
        { deep: true }
    );

    // Resize handling
    let resizeObserver = null;
    onMounted(() => {
        nextTick(() => {
            initChart();
            if (containerRef.value) {
                resizeObserver = new ResizeObserver(() => {
                    if (chartInstance.value) {
                        chartInstance.value.resize();
                    }
                });
                resizeObserver.observe(containerRef.value);
            }
        });
    });

    onBeforeUnmount(() => {
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
        if (chartInstance.value) {
            chartInstance.value.dispose();
        }
    });
</script>

<style scoped>
    /* High-Tech Glassmorphism Design System */
    .og-container {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 720px;
        padding: 24px;
        gap: 20px;
        background: #090d16;
        color: #f1f5f9;
        font-family: inherit;
        box-sizing: border-box;
        overflow: hidden;
    }

    .og-container--fullscreen {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
        min-height: 100vh;
        border-radius: 0;
    }

    /* Glowing background ambient lights */
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
        background: #6366f1;
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
        background: linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(99, 102, 241, 0.25));
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
        gap: 12px;
        flex-wrap: wrap;
    }

    /* Segmented Button Group */
    .og-seg {
        display: flex;
        padding: 3px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        backdrop-filter: blur(12px);
    }

    .og-seg-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
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

    /* Search Box */
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
        width: 220px;
        padding: 8px 32px 8px 36px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        color: #f8fafc;
        font-size: 13px;
        backdrop-filter: blur(12px);
        transition: all 0.2s ease;
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
        color: #94a3b8;
        cursor: pointer;
        font-size: 16px;
        padding: 2px;
    }

    /* General Buttons */
    .og-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .og-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 14px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        color: #e2e8f0;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        backdrop-filter: blur(12px);
        transition: all 0.2s ease;
    }

    .og-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .og-btn--active {
        border-color: #ec4899;
        color: #ec4899;
        background: rgba(236, 72, 153, 0.1);
    }

    .og-btn--primary {
        background: linear-gradient(135deg, #ec4899, #a855f7);
        border: none;
        color: #ffffff;
        font-weight: 600;
        box-shadow: 0 4px 14px rgba(236, 72, 153, 0.35);
    }

    .og-btn--primary:hover {
        opacity: 0.92;
    }

    .og-w-full {
        width: 100%;
    }

    /* KPI Bar */
    .og-kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        z-index: 2;
    }

    .og-kpi-card {
        position: relative;
        padding: 14px 18px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 14px;
        backdrop-filter: blur(16px);
        transition:
            transform 0.2s ease,
            border-color 0.2s ease;
    }

    .og-kpi-card:hover {
        transform: translateY(-2px);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .og-kpi-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 500;
        color: #94a3b8;
    }

    .og-kpi-value {
        margin-top: 6px;
        font-size: 24px;
        font-weight: 700;
        color: #f8fafc;
    }

    .og-kpi-subtext {
        margin-top: 2px;
        font-size: 11px;
        color: #64748b;
    }

    .og-kpi-card--rose {
        border-left: 3px solid #ec4899;
    }
    .og-kpi-card--emerald {
        border-left: 3px solid #10b981;
    }
    .og-kpi-card--violet {
        border-left: 3px solid #a855f7;
    }
    .og-kpi-card--cyan {
        border-left: 3px solid #06b6d4;
    }
    .og-kpi-card--amber {
        border-left: 3px solid #f59e0b;
    }

    /* Viewport & Graph Workspace */
    .og-viewport {
        position: relative;
        flex: 1;
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(16px);
        overflow: hidden;
        min-height: 480px;
    }

    /* Category Filter Chips Bar */
    .og-category-bar {
        position: absolute;
        top: 14px;
        left: 16px;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding: 6px 12px;
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        backdrop-filter: blur(12px);
    }

    .og-bar-label {
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .og-cat-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #94a3b8;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .og-cat-chip:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #f8fafc;
    }

    .og-cat-chip--active {
        background: rgba(255, 255, 255, 0.1);
        font-weight: 600;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .og-cat-reset {
        border: none;
        background: transparent;
        color: #ec4899;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        margin-left: 4px;
    }

    /* Toolbar Overlay */
    .og-toolbar {
        position: absolute;
        top: 14px;
        right: 16px;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        backdrop-filter: blur(12px);
    }

    .og-toolbar-group {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .og-toolbar-divider {
        width: 1px;
        height: 18px;
        background: rgba(255, 255, 255, 0.1);
    }

    .og-tool-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 6px 10px;
        background: transparent;
        border: none;
        border-radius: 8px;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .og-tool-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #f8fafc;
    }

    .og-tool-btn--active {
        background: rgba(236, 72, 153, 0.15);
        color: #ec4899;
        font-weight: 600;
    }

    /* ECharts Canvas Container */
    .og-chart-canvas {
        width: 100%;
        height: 100%;
        flex: 1;
        min-height: 480px;
    }

    /* Inspector Glass Drawer */
    .og-inspector,
    .og-physics-panel {
        position: absolute;
        top: 14px;
        right: 16px;
        bottom: 14px;
        width: 320px;
        z-index: 20;
        display: flex;
        flex-direction: column;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        backdrop-filter: blur(20px);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
        overflow: hidden;
    }

    .og-inspector-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .og-inspector-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 700;
        color: #f8fafc;
    }

    .og-close-btn {
        border: none;
        background: transparent;
        color: #94a3b8;
        font-size: 18px;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
    }

    .og-close-btn:hover {
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.08);
    }

    .og-inspector-body {
        flex: 1;
        padding: 18px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .og-user-profile {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .og-avatar-ring {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        border: 3px solid #ec4899;
        padding: 3px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
        margin-bottom: 10px;
    }

    .og-avatar-img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
    }

    .og-avatar-placeholder {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        font-weight: 700;
        color: #ffffff;
    }

    .og-user-name {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: #f8fafc;
    }

    .og-user-badges {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
    }

    .og-badge {
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid transparent;
    }

    .og-badge--status {
        background: rgba(100, 116, 139, 0.2);
        color: #94a3b8;
        border-color: rgba(100, 116, 139, 0.3);
    }

    .og-badge--online {
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
        border-color: rgba(16, 185, 129, 0.3);
    }

    .og-badge--active {
        background: rgba(6, 182, 212, 0.2);
        color: #06b6d4;
        border-color: rgba(6, 182, 212, 0.3);
    }

    .og-detail-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .og-detail-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        font-size: 12px;
    }

    .og-detail-item i {
        font-size: 16px;
        color: #ec4899;
        margin-top: 2px;
    }

    .og-detail-label {
        display: block;
        font-size: 10px;
        color: #64748b;
        text-transform: uppercase;
        font-weight: 600;
    }

    .og-detail-value {
        color: #e2e8f0;
        font-weight: 500;
    }

    .og-detail-bio {
        font-style: italic;
        color: #cbd5e1;
    }

    /* Neighbor Chips */
    .og-connected-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .og-section-title {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
    }

    .og-neighbor-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .og-neighbor-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: #e2e8f0;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .og-neighbor-chip:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: #ec4899;
    }

    .og-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
    }

    .og-inspector-footer {
        padding: 14px 18px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    /* Physics Sliders */
    .og-slider-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .og-slider-header {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 500;
        color: #cbd5e1;
    }

    .og-slider-val {
        color: #ec4899;
        font-weight: 700;
    }

    .og-slider {
        width: 100%;
        accent-color: #ec4899;
        cursor: pointer;
    }

    /* Transitions */
    .og-slide-enter-active,
    .og-slide-leave-active {
        transition:
            transform 0.25s ease,
            opacity 0.25s ease;
    }

    .og-slide-enter-from,
    .og-slide-leave-to {
        transform: translateX(30px);
        opacity: 0;
    }
</style>
