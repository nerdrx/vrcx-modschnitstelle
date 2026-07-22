<template>
    <div class="wrapped-dashboard-container">
        <WidgetHeader icon="ri-medal-line" title="VRChat Wrapped" />

        <div class="wrapped-controls">
            <el-select v-model="timeframe" placeholder="Select Timeframe" @change="loadData" class="timeframe-select">
                <el-option label="Last 7 Days" :value="7"></el-option>
                <el-option label="Last 30 Days" :value="30"></el-option>
                <el-option label="Last 90 Days" :value="90"></el-option>
                <el-option label="All Time (365 Days)" :value="365"></el-option>
            </el-select>
            <el-button @click="loadData" type="primary" :loading="loading" plain>
                <i class="ri-refresh-line"></i> Refresh
            </el-button>
        </div>

        <div v-if="loading" class="loading-overlay">
            <el-spinner />
            <span>Calculating your VRChat journey...</span>
        </div>

        <div v-else class="wrapped-grid">
            <!-- Top Worlds -->
            <div class="wrapped-card top-worlds glass">
                <h3><i class="ri-global-line"></i> Top Worlds</h3>
                <div class="card-content">
                    <div v-for="(world, index) in topWorlds" :key="index" class="list-item">
                        <span class="rank">#{{ index + 1 }}</span>
                        <span class="name">{{ world.worldName || 'Unknown World' }}</span>
                        <span class="stat">{{ world.visitCount }} visits</span>
                    </div>
                    <div v-if="!topWorlds.length" class="empty-state">No world data found.</div>
                </div>
            </div>

            <!-- Top Friends -->
            <div class="wrapped-card top-friends glass">
                <h3><i class="ri-group-line"></i> Top Friends</h3>
                <div class="card-content">
                    <div v-for="(friend, index) in topFriends" :key="index" class="list-item">
                        <span class="rank">#{{ index + 1 }}</span>
                        <span class="name">{{ friend.displayName || 'Unknown Friend' }}</span>
                        <span class="stat">{{ friend.interactionScore }} interactions</span>
                    </div>
                    <div v-if="!topFriends.length" class="empty-state">No friend data found.</div>
                </div>
            </div>

            <!-- Top Avatars -->
            <div class="wrapped-card top-avatars glass">
                <h3><i class="ri-user-smile-line"></i> Top Avatars</h3>
                <div class="card-content">
                    <div v-for="(avatar, index) in topAvatars" :key="index" class="avatar-item">
                        <img :src="avatar.imageUrl || 'assets/images/default-avatar.png'" class="avatar-img" @error="handleImageError"/>
                        <div class="avatar-info">
                            <span class="name">{{ avatar.avatarName || 'Unknown Avatar' }}</span>
                            <span class="stat">{{ avatar.switchCount }} uses</span>
                        </div>
                    </div>
                    <div v-if="!topAvatars.length" class="empty-state">No avatar data found.</div>
                </div>
            </div>

            <!-- Activity Heatmap -->
            <div class="wrapped-card activity-heatmap glass full-width">
                <h3><i class="ri-calendar-event-line"></i> Activity Heatmap</h3>
                <div class="chart-container" ref="heatmapChart"></div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, inject, markRaw } from 'vue';
import * as echarts from 'echarts';

// VRCX specific injects if needed, or we rely on the global AppApi/ctx
// For this mod, we'll assume the mod context has been added to window.ModContext or passed somehow
// But wait, in our mod API, context is usually available globally if we set it, or we import our db directly.
import * as db from './db.js';

const $app = inject('$app'); // If using VRCX's dependency injection
// Actually we can just use the db functions directly and pass the global ctx
const ctx = window.$modCtx || { db: window.$app.db }; 
// Note: To make this robust, VRCX mod setup should attach ctx to window.$modCtx
// Let's assume we can query via db module directly if we pass the right dependencies.

const timeframe = ref(30);
const loading = ref(false);

const topWorlds = ref([]);
const topFriends = ref([]);
const topAvatars = ref([]);
const heatmapDataRaw = ref([]);

const heatmapChart = ref(null);
let echartInstance = null;

const loadData = async () => {
    loading.value = true;
    try {
        // Retrieve context, in our API the context is stored in the registry or we can use the window hook
        const context = window.$modCtx || { db: { 
            query: window.$app.db.query, 
            corePrefix: () => 'vrcx' 
        }};

        // Execute queries in parallel
        const [worlds, friends, avatars, heatmap] = await Promise.all([
            db.getTopWorlds(context, timeframe.value, 5),
            db.getTopFriends(context, timeframe.value, 5),
            db.getTopAvatars(context, timeframe.value, 4),
            db.getActivityHeatmap(context, timeframe.value)
        ]);

        topWorlds.value = worlds || [];
        topFriends.value = friends || [];
        topAvatars.value = avatars || [];
        heatmapDataRaw.value = heatmap || [];

        renderHeatmap();
    } catch (err) {
        console.error('[VRC Wrapped] Error loading data:', err);
    } finally {
        loading.value = false;
    }
};

const renderHeatmap = () => {
    if (!heatmapChart.value) return;

    if (!echartInstance) {
        echartInstance = markRaw(echarts.init(heatmapChart.value));
    }

    // Process heatmap data for ECharts calendar
    const data = heatmapDataRaw.value.map(row => [row.day, row.count]);
    
    // Determine the date range
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - timeframe.value);
    
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    const option = {
        tooltip: {
            position: 'top',
            formatter: function (p) {
                const format = echarts.format.formatTime('yyyy-MM-dd', p.data[0]);
                return format + ': ' + p.data[1] + ' activities';
            }
        },
        visualMap: {
            min: 0,
            max: 50, // Roughly 50 instance joins a day is a lot
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            inRange: {
                color: ['#1a1a24', '#7b2cbf', '#9d4edd', '#c77dff']
            },
            textStyle: { color: '#a0a0b0' }
        },
        calendar: [{
            range: [startDateStr, endDateStr],
            cellSize: ['auto', 20],
            itemStyle: {
                color: '#1e1e2d',
                borderWidth: 1,
                borderColor: '#2d2d3d'
            },
            yearLabel: { show: false },
            dayLabel: {
                firstDay: 1,
                nameMap: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                color: '#a0a0b0'
            },
            monthLabel: { color: '#a0a0b0' }
        }],
        series: [{
            type: 'heatmap',
            coordinateSystem: 'calendar',
            data: data
        }]
    };

    echartInstance.setOption(option);
};

const handleImageError = (e) => {
    e.target.src = 'assets/images/default-avatar.png'; // Fallback
};

const handleResize = () => {
    if (echartInstance) {
        echartInstance.resize();
    }
};

onMounted(() => {
    loadData();
    window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    if (echartInstance) {
        echartInstance.dispose();
    }
});
</script>

<style scoped>
.wrapped-dashboard-container {
    padding: 20px;
    height: 100%;
    overflow-y: auto;
    color: #e0e0e0;
}

.wrapped-controls {
    display: flex;
    gap: 15px;
    margin-bottom: 25px;
    align-items: center;
}

.timeframe-select {
    width: 200px;
}

.loading-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: 15px;
    color: #9d4edd;
    font-size: 1.2rem;
}

.wrapped-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

.full-width {
    grid-column: 1 / -1;
}

/* Glassmorphism Styling */
.glass {
    background: rgba(30, 30, 45, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
}

.wrapped-card {
    padding: 20px;
    display: flex;
    flex-direction: column;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.wrapped-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 12px 40px 0 rgba(157, 78, 221, 0.2);
    border-color: rgba(157, 78, 221, 0.3);
}

.wrapped-card h3 {
    margin-top: 0;
    margin-bottom: 20px;
    font-size: 1.3rem;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 10px;
}

.wrapped-card h3 i {
    color: #c77dff;
}

.card-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.list-item {
    display: flex;
    align-items: center;
    padding: 10px 15px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    gap: 15px;
}

.list-item .rank {
    font-weight: bold;
    color: #e0aaff;
    font-size: 1.1rem;
    min-width: 30px;
}

.list-item .name {
    flex: 1;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.list-item .stat {
    font-size: 0.9rem;
    color: #a0a0b0;
    background: rgba(157, 78, 221, 0.15);
    padding: 4px 8px;
    border-radius: 4px;
}

.avatar-item {
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 10px;
    gap: 15px;
}

.avatar-img {
    width: 50px;
    height: 50px;
    border-radius: 8px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.avatar-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
    overflow: hidden;
}

.avatar-info .name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.avatar-info .stat {
    font-size: 0.85rem;
    color: #c77dff;
}

.empty-state {
    color: #a0a0b0;
    text-align: center;
    padding: 20px 0;
    font-style: italic;
}

.chart-container {
    width: 100%;
    height: 250px;
}
</style>
